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
		let isDigital = true;
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

					response.on('end', () => resolve({ data, statusCode: response.statusCode }));
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
				const temp = {};
				if (details && details.length) {
					const alltypes = details.map(line => +line[5] || -1);
					const types = Array.from(new Set(alltypes)).sort(); // unique and sorted array 
					for (let i = 0; i < types.length; ++i) {
						const type = types[i];
						const relevantEntries = details.filter(line => +line[5] === type);
						const labels = relevantEntries.map(line => line[3] || line[1] || '');
						temp[type] = labels;
					}
				}
				if (JSON.stringify(portlabels) !== JSON.stringify(temp)) {
					portlabels = temp;
					node.emitter.emit('webioLabels', portlabels);
					RED.comms.publish("wut/portlabels/" + node.id, portlabels, true); // workaround to publish infos to web client
					node.log(RED._('logging.portinfos.loaded'));
				}
			} else {
				node.warn(RED._('logging.portinfos.invalid'));
			}
		}

		const onVersionReceived = (data) => {
			const match = data.match(/^(\d+\.\d+)\s/m) || [];
			const version = parseFloat(match[1]);
			switch (version) {
				case 12.18:	// #57634
				case 12.33:	// #57630
				case 13.33:	// #57730
				case 13.35:	// #57734
				case 13.36:	// #57737
					machineState = MACHINE_STATES.POLLING;
					isDigital = true;
					break;

				case 12.15:	// #57610
				case 12.17:	// #57613
				case 12.37:	// #57618
				case 13.1:	// #57713
				case 13.3:	// #57715
				case 13.5:	// #57718
					machineState = MACHINE_STATES.POLLING;
					isDigital = false;
					break;

				default:
					machineState = MACHINE_STATES.NOT_SUPPORTED;
					break;
			}
		}

		const onDeviceDataReceived = (data) => {
			if (isDigital) {
				let match = data.match(/input;([0-9a-f]+)/i) || [];
				sendGetData('input', parseInt(match[1], 16));

				match = data.match(/output;([0-9a-f]+)/i) || [];
				sendGetData('output', parseInt(match[1], 16));

				match = data.match(/counter;([;0-9]+)$/i);
				const counters = (match && match[1]) ? match[1].split(';').map(s => parseInt(s, 10)) : null;
				sendGetData('counter', counters);
			} else {
				let parts = null;
				if (data.match(/;?((-?\d+,?\d*)|(-{4})).*$/) !== null) {
					parts = data.split(';');

					// possibly remove IP address and system name from data array
					if (parts[0].match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) !== null) {
						parts.shift();
						parts.shift();
					}
				}
				sendGetData('single', parts);
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
			httpGetHelper('/portinfo').then(result => {
				onPortinfosReceived(result.data);
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
					httpGetHelper('/version').then(result => {
						onVersionReceived(result.data);
						// NOTE: short timeouts because /version resets TCP connection
						// -> call /portinfo AFTER next stateHandler because it will also reset TCP connection
						setStateHandlerTimeout(50);  // proceed with next state
						setPortinfosTimeout(100); // get portinfos only if /version request was successful
					}, err => {
						sendErrorStatus(STATUS.NOT_REACHABLE);
						setStateHandlerTimeout(pollingInterval);
					});
					break;

				case MACHINE_STATES.POLLING:
					const path = isDigital ? `/allout?PW=${pw}&` : `/single`;
					httpGetHelper(path).then(result => {
						if (result.statusCode === 200) {
							onDeviceDataReceived(result.data);
						} else if (result.statusCode === 403) {
							sendErrorStatus(STATUS.PW_REQUIRED);
						} else if (result.statusCode === 404) {
							sendErrorStatus(STATUS.NOT_ENABLED);
						} else {
							sendErrorStatus(STATUS.UNKNOWN);
						}
						setStateHandlerTimeout(pollingInterval);
					}, err => {
						sendErrorStatus(STATUS.NOT_REACHABLE);
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
				httpGetHelper(path).then(result => {
					const match = (result.data || '').match(/output;([0-9a-f]+)$/i);
					if (match && result.statusCode === 200) {
						sendGetData('output', parseInt(match[1], 16)); // confirm successful setting by emitting new value
					} else {
						node.warn(RED._('logging.set-failed-statuscode', { number, value, statusCode: result.statusCode }));
					}

				}, err => node.error(RED._('logging.set-failed-error', { number, value, errMsg: err.message })));
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
