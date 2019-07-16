const { EventEmitter } = require('events');
const { STATUS } = require('./util');

const MACHINE_STATES = Object.freeze({
	INITIALIZING: -1,
	POLLING: 50,
	NOT_SUPPORTED: 90
});

module.exports = RED => {
	RED.nodes.registerType('Web-IO', function (config) {
		RED.nodes.createNode(this, config);
		const node = this;

		if (!config.host || !+config.port) {
			node.warn(RED._('logging.invalid-config', { host: config.host, port: config.port }));
			return;
		}

		const http = require(config.protocol);
		const agent = new http.Agent({
			keepAlive: true,
			keepAliveMsecs: 5000, // Web-IOs keep connection open for 30 s
			maxSockets: 1,
			timeout: 5000,
			host: config.host,
			port: +config.port
		});

		const pollingInterval = config.pollingIntervalSec * 1000 || 1000;
		const portinfosInterval = config.portinfoIntervalSec * 1000 || 60000;

		const pw = node.credentials.password;
		let machineState = MACHINE_STATES.INITIALIZING;
		let portlabels = null;
		let swInterfaces = {};
		let isActive = true;

		node.emitter = new EventEmitter();

		// Helper functions
		const sendErrorStatus = (status) => {
			node.emitter.emit('webioGet', 'counter', null, status);
			node.emitter.emit('webioGet', 'input', null, status);
			node.emitter.emit('webioGet', 'output', null, status);
			node.emitter.emit('webioGet', 'single', null, status);
		};
		const sendGetData = (category, value) => {
			if (value || value === 0) {
				node.emitter.emit('webioGet', category, value, STATUS.OK);
			} else {
				node.emitter.emit('webioGet', category, null, STATUS.NO_VALUE);
			}
		};
		let pendingRequest;
		const httpGetHelper = (path) => {
			return new Promise((resolve, reject) => {
				pendingRequest = http.get({ agent, path }, response => {
					response.setEncoding(JSON.stringify(response.headers).includes('utf-8') ? 'utf-8' : 'latin1');

					let data = '';
					response.on('data', chunk => data += chunk);

					response.on('end', () => {
						if (response.statusCode === 200) {
							resolve(data);
						} else {
							reject({ statusCode: response.statusCode, message: `http statusCode ${response.statusCode}` });
						}
					});
				}).on('error', err => reject(err));
			});
		}

		// callback helper functions
		const onPortinfosReceived = (data) => {
			const lines = (data || '').split('\r\n');
			if (!lines[lines.length - 1] || lines[lines.length - 1] === '\u0000') {
				lines.pop(); // remove empty line at the end
			}
			const details = lines.map(line => line.split('|'));

			const headerVersion = details[0][0];
			const headerLength = +details[0][1] || 0;

			let isValid = details[0] && headerLength + 1 === lines.length;
			const flatInfos = details.reduce((acc, val) => acc.concat(val), []);
			if (headerVersion === '1.0') {
				isValid &= flatInfos.length === (2 + headerLength * 12);
			} else if (headerVersion === '1.1') {
				isValid &= flatInfos.length === (2 + headerLength * 14);
			} else {
				isValid = false;
			}

			if (isValid) {
				swInterfaces = {};
				const tempLabels = {};

				for (let i = 1; i <= 6; ++i) { // iterate over defined software interface ids
					const relevantEntries = details.filter(line => +line[5] === i || (+line[5] > 6 && +line[6] === i)); // if line[5] is unknown, fall back to line[6]
					const labels = relevantEntries.map(line => line[3] || line[1] || '');
					tempLabels[i] = labels;
					swInterfaces[i] = relevantEntries.length > 0;
				}

				if (JSON.stringify(portlabels) !== JSON.stringify(tempLabels)) {
					portlabels = tempLabels;
					node.emitter.emit('webioLabels', portlabels);
					RED.comms.publish("wut/portlabels/" + node.id, portlabels, true); // workaround to publish infos to web client
					node.log(RED._('logging.portinfos.loaded'));
				}
			} else {
				node.warn(RED._('logging.portinfos.invalid'));
			}
		}

		const onAlloutDataReceived = (data) => {
			if (data) {
				let match = data.match(/input;([0-9a-f]+)/i) || [];
				sendGetData('input', parseInt(match[1], 16));

				match = data.match(/output;([0-9a-f]+)/i) || [];
				sendGetData('output', parseInt(match[1], 16));

				match = data.match(/counter;([;0-9]+)$/i);
				const counters = (match && match[1]) ? match[1].split(';').map(s => parseInt(s, 10)) : null;
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
			}, err => {
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
						setStateHandlerTimeout(50);  // proceed with next state
					}, err => {
						sendErrorStatus(STATUS.NOT_REACHABLE);
						setStateHandlerTimeout(pollingInterval);
					});
					break;

				case MACHINE_STATES.POLLING:
					const requests = [];

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
		stateHandler();

		node.emitter.addListener('webioSet', (type, number, value) => {
			if (type === 'output') {
				const path = `/outputaccess${number}?PW=${pw}&State=${!value ? 'OFF' : 'ON'}&`;
				httpGetHelper(path).then(data => {
					const match = (data || '').match(/output;([0-9a-f]+)$/i);
					if (match) {
						sendGetData('output', parseInt(match[1], 16)); // confirm successful setting by emitting new value
					} else {
						node.warn(RED._('logging.set-failed-invaliddata', { number, value, data }));
					}
				}, err => {
					if (err.statusCode) {
						node.warn(RED._('logging.set-failed-statuscode', { number, value, statusCode: err.statusCode }));
					} else {
						node.error(RED._('logging.set-failed-error', { number, value, errMsg: err.message }));
					}
				});
			}
		});

		node.on('close', () => {
			isActive = false; // to handle old pending requests correctly
			node.emitter.removeAllListeners('webioSet');

			if (pendingRequest && !pendingRequest.res) {
				pendingRequest.abort();
			}

			clearTimeout(stateHandlerTimeout);
			clearTimeout(getPortinfosTimeout);
		});

	}, { credentials: { password: { type: 'password' } } });
}
