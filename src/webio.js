const { EventEmitter } = require('events');
const { STATUS } = require('./util/status');
const wutHttpAdmin = require('./util/wut-http-admin');

const MACHINE_STATES = Object.freeze({
    INITIALIZING: -1,
    POLLING: 50,
    NOT_SUPPORTED: 90
});

module.exports = RED => {
    wutHttpAdmin.init(RED);

    RED.nodes.registerType('Web-IO', function (config) {
        const pollingInterval = config.pollingIntervalSec * 1000 || 1000;
        const portinfosInterval = config.portinfoIntervalSec * 1000 || 60000;
        const httpTimeout = 3000;
        const agentTimeout = 5000;
        const keepAliveMsecs = 5000; // Web-IOs keep connection open for 30 s

        RED.nodes.createNode(this, config);

        if (!config.host || !+config.port) {
            this.warn(RED._('logging.invalid-config', { host: config.host, port: config.port }));
            return;
        }

        const node = this;
        const http = require(config.protocol);
        const agent = new http.Agent({
            keepAlive: true,
            keepAliveMsecs: keepAliveMsecs,
            maxSockets: 1,
            timeout: agentTimeout,
            host: config.host,
            port: +config.port
        });

        const pw = node.credentials.password || '';
        let machineState = MACHINE_STATES.INITIALIZING;
        let portlabels = {};
        let swInterfaces = {};
        let portdata = {}; // currently used for analog measurement ranges
        let isActive = true;

        node.emitter = new EventEmitter();
        node.emitter.setMaxListeners(128);

        // Helper functions
        let lastGetData = {};
        const emitGetData = (category, value, status) => {
            node.emitter.emit('webioGet', category, value, status);
            lastGetData[category] = { value, status };
        }
        const sendErrorStatus = (status) => {
            emitGetData('counter', null, status);
            emitGetData('input', null, status);
            emitGetData('output', null, status);
            emitGetData('single', null, status);
        };
        const sendGetData = (category, value) => {
            if (value || value === 0) {
                emitGetData(category, value, STATUS.OK);
            } else {
                emitGetData(category, null, STATUS.NO_VALUE);
            }
        };
        let pendingHttp;
        let hasPendingRequest;
        const httpGetHelper = (path) => {
            if (hasPendingRequest && pendingHttp) {
                return new Promise((res, rej) => {
                    pendingHttp.catch(() => { }).finally(() => { // when pending request is finished, call method again
                        setTimeout(() => httpGetHelper(path).then(res, rej), 50); // little timeout to ensure 'hasPendingRequest' is reset
                    });
                });
            } else {
                hasPendingRequest = true;
                pendingHttp = new Promise((resolve, reject) => {
                    http.get({ agent, path, timeout: httpTimeout }, response => {
                        response.setEncoding(JSON.stringify(response.headers).includes('utf-8') ? 'utf-8' : 'latin1');

                        let data = '';
                        response.on('data', chunk => data += chunk);

                        response.on('end', () => {
                            if (response.statusCode === 200) {
                                if (path.startsWith('/portinfo')) {
                                    setTimeout(() => resolve(data), 100); // /portinfo will reset TCP connection!
                                } else {
                                    resolve(data);
                                }
                            } else {
                                reject({ statusCode: response.statusCode, message: `http statusCode ${response.statusCode}` });
                            }
                        });
                    }).on('timeout', function () { this.abort(); }).on('error', err => reject(err));
                });
                // second promise object to handle 'hasPendingRequest' flag correctly
                return new Promise((res, rej) => {
                    pendingHttp.then(res, rej).finally(() => { hasPendingRequest = false; });
                });
            }
        }

        // callback helper functions
        const onPortinfosReceived = (data) => {
            const lines = (data || '').split('\r\n');
            if (!lines[lines.length - 1] || lines[lines.length - 1] === '\u0000') {
                lines.pop(); // remove empty line at the end
            }
            const details = lines.map(line => line.split('|'));
            let isValid = details[0];

            if (isValid) {
                const headerVersion = details[0][0];
                const headerLength = +details[0][1] || 0;

                isValid = headerLength + 1 === lines.length && details[0].length === 2;
                const relevantLines = details.filter(line => line && +line[5] >= 1);
                const flatInfos = relevantLines.reduce((acc, val) => acc.concat(val), []);
                if (headerVersion === '1.0') {
                    isValid &= flatInfos.length === (relevantLines.length * 12);
                } else if (headerVersion === '1.1') {
                    isValid &= flatInfos.length === (relevantLines.length * 14);
                } else {
                    isValid = false;
                }
            }

            if (isValid) {
                swInterfaces = {};
                const tempData = {};
                const tempLabels = {};

                for (let i = 1; i <= 6; ++i) { // iterate over defined software interface ids
                    const relevantEntries = details.filter(line => +line[5] === i || (+line[5] > 6 && +line[6] === i)); // if line[5] is unknown, fall back to line[6]
                    swInterfaces[i] = relevantEntries.length > 0; // flag which software interfaces the web-io provides -> corresponding data needs to be polled and published

                    const typeLabels = {};
                    const typeData = {};
                    for (let k = 0; k < relevantEntries.length; ++k) {
                        const entry = relevantEntries[k];
                        const slot = +entry[8] || 0;
                        if (typeLabels[slot]) {
                            node.warn(RED._('logging.portinfos.doublet-slot', { slot, type: i }));
                        }
                        typeLabels[slot] = entry[3] || entry[1] || ''; // label = individually configured name OR official clamp name OR ''

                        if (entry[12] && entry[13]) { // data is only available for analog devices and portinfo version 1.1
                            const gradient = parseFloat(entry[12]);
                            const minimum = parseFloat(entry[13]);
                            if (!isNaN(minimum) && !isNaN(gradient)) {
                                const min = +(minimum.toFixed(2));
                                const max = +((gradient * 100 + minimum).toFixed(2));
                                typeData[slot] = { min, max, unit: entry[4] };
                            } else {
                                node.warn(RED._('logging.portinfos.invalid-measurement-range', { slot, type: i, gradient, minimum }));
                            }
                        }
                    }
                    tempLabels[i] = typeLabels;
                    if (Object.keys(typeData).length) {
                        tempData[i] = typeData;
                    }
                }

                if (JSON.stringify(portdata) !== JSON.stringify(tempData)) {
                    portdata = tempData;
                    node.emitter.emit('webioData', portdata);
                    RED.comms.publish('wut/portdata/' + node.id, portdata, true); // workaround to publish infos to web client
                    node.log(RED._('logging.portinfos.ranges-loaded'));
                }

                if (JSON.stringify(portlabels) !== JSON.stringify(tempLabels)) {
                    portlabels = tempLabels;
                    node.emitter.emit('webioLabels', portlabels);
                    RED.comms.publish('wut/portlabels/' + node.id, portlabels, true); // workaround to publish infos to web client
                    node.log(RED._('logging.portinfos.loaded'));
                }
            } else {
                node.warn(RED._('logging.portinfos.invalid'));
            }
        }

        const onAlloutDataReceived = (data) => {
            if (data) {
                let match = data.match(/input;([\da-f]+)/i) || [];
                sendGetData('input', parseInt(match[1], 16));

                match = data.match(/output;([\da-f]+)/i) || [];
                sendGetData('output', parseInt(match[1], 16));

                match = data.match(/counter;(.*)$/i);
                const counters = (match && match[1]) ? match[1].split(';') : null;
                sendGetData('counter', counters);
            } else {
                node.warn(RED._('logging.invalid-data', { url: '/allout', data }));
            }
        }

        const onSingleDataReceived = (data) => {
            if (data && data.match(/;?((-?\d+,?\d*)|(-{4})).*$/) !== null) {
                const parts = data.split(';');

                // possibly remove IP address and system name from data array
                if (parts[0].match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) !== null) {
                    parts.shift();
                    parts.shift();
                }
                sendGetData('single', parts);
            } else {
                node.warn(RED._('logging.invalid-data', { url: '/single', data }));
            }
        }

        let getPortinfosTimeout;
        const setPortinfosTimeout = (time) => {
            clearTimeout(getPortinfosTimeout);
            if (isActive) {
                getPortinfosTimeout = setTimeout(getPortinfos, time || portinfosInterval);
            }
        }
        const getPortinfos = () => {
            httpGetHelper('/portinfo').then(data => {
                onPortinfosReceived(data);
                setPortinfosTimeout(portinfosInterval);
            }, () => {
                node.warn(RED._('logging.portinfos.failed'));
                setPortinfosTimeout(portinfosInterval);
            });
        };

        let stateHandlerTimeout;
        const setStateHandlerTimeout = (time) => {
            clearTimeout(stateHandlerTimeout);
            if (isActive) {
                stateHandlerTimeout = setTimeout(stateHandler, time || pollingInterval);
            }
        }
        const stateHandler = () => {
            const requests = []; // for promise handling
            switch (machineState) {
                case MACHINE_STATES.INITIALIZING:
                    httpGetHelper('/portinfo').then(data => {
                        onPortinfosReceived(data);

                        if (Object.keys(swInterfaces).length) {
                            machineState = MACHINE_STATES.POLLING;
                            setPortinfosTimeout(portinfosInterval); // start updating the portinfos periodically
                        } else {
                            machineState = MACHINE_STATES.NOT_SUPPORTED;
                        }

                        // NOTE: short timeouts because /portinfo resets TCP connection
                        setStateHandlerTimeout(50); // proceed with next state
                    }, err => {
                        if (err.statusCode === 404) { // /portinfo not supported?
                            machineState = MACHINE_STATES.NOT_SUPPORTED;
                        } else {
                            sendErrorStatus(STATUS.NOT_REACHABLE);
                        }
                        setStateHandlerTimeout(pollingInterval);
                    });
                    break;

                case MACHINE_STATES.POLLING:
                    if (swInterfaces[1] || swInterfaces[6]) {
                        const req = httpGetHelper('/single').then(data => onSingleDataReceived(data));
                        requests.push(req);
                    }

                    if (swInterfaces[2] || swInterfaces[3] || swInterfaces[4] || swInterfaces[5]) {
                        const req = httpGetHelper(`/allout?PW=${pw}&`).then(data => onAlloutDataReceived(data));
                        requests.push(req);
                    }

                    Promise.all(requests).then(() => {
                        setStateHandlerTimeout(pollingInterval);
                    }, err => { // if > 0 requests failed -> set error status based on first rejected promise
                        let status = STATUS.NOT_REACHABLE;
                        if (err.statusCode !== undefined) {
                            if (err.statusCode === 403) {
                                status = STATUS.PW_REQUIRED;
                            } else if (err.statusCode === 404) {
                                status = STATUS.NOT_ENABLED;
                            } else {
                                status = STATUS.UNKNOWN;
                            }
                        }
                        sendErrorStatus(status);
                        setStateHandlerTimeout(pollingInterval);
                    });
                    break;

                case MACHINE_STATES.NOT_SUPPORTED:
                    sendErrorStatus(STATUS.NOT_SUPPORTED); // NOTE: no setTimeout here -> this is a final state
                    break;

                default:
                    sendErrorStatus(STATUS.UNKNOWN); // NOTE: no setTimeout here -> this is a final state
            }
        };
        sendErrorStatus(STATUS.NOT_INITIALIZED); // initial status
        lastGetData = {}; // reset lastGetData (initial status doesn't have to be transmitted to new listeners)
        stateHandler();

        node.emitter.addListener('webioSet', (type, number, value) => {
            if (number >= 0 && ['digitalout', 'analogout', 'digitalcounter'].indexOf(type) >= 0) {
                if (type === 'digitalout') {
                    value = !value ? 'OFF' : 'ON';
                }
                const path = type === 'digitalcounter' ? `/counterclear${number}?PW=${pw}&Set=${value}&` : `/outputaccess${number}?PW=${pw}&State=${value}&`;
                httpGetHelper(path).then(data => {
                    let match = null;
                    if (type === 'digitalout') {
                        match = (data || '').match(/output;([\da-f]+)$/i);
                        if (match) {
                            sendGetData('output', parseInt(match[1], 16)); // confirm successful setting by emitting new value							
                        }
                    } else if (type === 'analogout') {
                        match = (data || '').match(/output\d+;-?\d+,?\d*\s?.*$/i);
                        // don't emit value because it is the IS and not TO-BE value
                    } else {
                        match = (data || '').match(/counter\d+;(-?\d+,?\d*\s?.*)$/i);
                        if (match) {
                            sendGetData(`counter${number}`, match[1]);
                        }
                    }

                    if (!match) {
                        node.warn(RED._('logging.set-failed-invaliddata', { number, value, data }));
                    }
                }, err => {
                    if (err.statusCode) {
                        node.warn(RED._('logging.set-failed-statuscode', { number, value, statusCode: err.statusCode }));
                    } else {
                        node.error(RED._('logging.set-failed-error', { number, value, errMsg: err.message }));
                    }
                });
            } else {
                node.warn(RED._('logging.set-failed-invalidinput', { type, number, value }));
            }
        });

        node.emitter.addListener('newListener', event => {
            // emit data again if a new listener is registered with a delay (for whatever reason)
            if (event === 'webioLabels' && Object.keys(portlabels).length) {
                setTimeout(() => node.emitter.emit('webioLabels', portlabels), 50); // NOTE: immediate response might not be received!
            } else if (event === 'webioData' && Object.keys(portdata).length) {
                setTimeout(() => node.emitter.emit('webioData', portdata), 50); // NOTE: immediate response might not be received!
            } else if (event === 'webioGet' && Object.keys(lastGetData).length) {
                setTimeout(() => {
                    for (let key in lastGetData) {
                        const data = lastGetData[key];
                        if (data.status !== STATUS.NOT_INITIALIZED) {
                            emitGetData(key, data.value, data.status);
                        }
                    }
                }, 50); // NOTE: immediate response might not be received!
            }
        });


        node.on('close', () => {
            isActive = false; // to handle old pending requests correctly

            node.emitter.removeAllListeners(); // centrally remove all listeners (across all clamp nodes)

            agent.destroy();

            clearTimeout(stateHandlerTimeout);
            clearTimeout(getPortinfosTimeout);
        });

    }, { credentials: { password: { type: 'password' } } });
}