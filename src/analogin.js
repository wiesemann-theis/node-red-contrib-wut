const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Analog IN', function (config) {
		const topic = config.topic || config.name || 'Analog IN';
		const portinfoType = '1';

		RED.nodes.createNode(this, config);

		let lastStatusString = '';
		const sendWebioStatus = (status) => {
			if (JSON.stringify(status) !== lastStatusString) {
				lastStatusString = JSON.stringify(status);
				RED.comms.publish('wut/webio-i18n-status/' + this.id, status, true);
			}
		};

		let value;
		let lastValue = null;
		let diff = null;
		let unit = '';
		let isValidClamp = true;
		let clampLabels = [];
		let clampData = null;
		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			const webioLabelsCb = (labels) => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					const clampName = clampLabels[config.number] || config.number;
					const msg = { topic, payload: value, unit, lastValue, diff, clampName };
					Object.assign(msg, clampData);
					this.send(msg);
				}
			};

			const webioDataCb = (data) => {
				clampData = (data[portinfoType] || {})[config.number];
			};

			const webioGetCb = (type, values, status) => {
				if (type === 'single') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp && values && values[config.number - 1] !== undefined) {
						let match = (values[config.number - 1] || '').match(/^(-?\d+,?\d*).*$/);
						if (match !== null) {
							tmpValue = parseFloat(match[1].replace(',', '.'));
							sendWebioStatus({ fill: 'green', shape: 'dot', text: 'status.connected', params: { value: values[config.number - 1] } });
						} else {
							sendWebioStatus({ fill: 'red', shape: 'dot', text: 'status.no-value' });
						}

						match = (values[config.number - 1] || '').match(/^-?\d+,?\d*\s?(.*)$/);
						unit = match !== null ? match[1] : '';
					} else {
						sendWebioStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						diff = value !== null && !isNaN(value) && lastValue !== null ? +(value - lastValue).toFixed(3) : null;
						const clampName = clampLabels[config.number] || config.number;
						const msg = { topic, payload: value, unit, lastValue, diff, clampName };
						Object.assign(msg, clampData);
						this.send(msg);
						lastValue = value !== null && !isNaN(value) ? value : lastValue;
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					sendWebioStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			};

			webio.emitter.addListener('webioLabels', webioLabelsCb);

			webio.emitter.addListener('webioData', webioDataCb);

			webio.emitter.addListener('webioGet', webioGetCb);

			this.on('close', () => {
				webio.emitter.removeListener('webioLabels', webioLabelsCb);
				webio.emitter.removeListener('webioData', webioDataCb);
				webio.emitter.removeListener('webioGet', webioGetCb);
			});
		} else {
			this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.invalid-webio'));
			sendWebioStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}

		this.on('input', msg => {
			if (isValidClamp) {
				if (msg.status) { // msg.status triggers output message with current value
					const clampName = clampLabels[config.number] || config.number;
					const msg = { topic, payload: value, unit, lastValue, diff: null, clampName, status: msg.status };
					Object.assign(msg, clampData);
					this.send(msg);
				} else if (msg.status !== undefined) {
					this.log(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-ignored', { status: msg.status }));
				} else {
					this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-failed'));
				}
			} else {
				this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-invalid-clamp', { index: config.number }));
			}
		});
	});
}