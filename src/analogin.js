const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Analog IN', function (config) {
		const topic = config.name || 'Analog IN';
		const portinfoType = '1';

		RED.nodes.createNode(this, config);

		let lastStatusString = '';
		const sendWebioStatus = (status) => {
			if (JSON.stringify(status) !== lastStatusString) {
				lastStatusString = JSON.stringify(status);
				const key = status.text.indexOf('@wiesemann-theis') === 0 ? status.text : '@wiesemann-theis/node-red-contrib-wut/web-io:' + status.text;
				status.text = RED._(key, status.params || {});
				this.status(status);
			}
		};

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let unit = '';
			let isValidClamp = true;
			let clampLabels = [];
			let clampData = null;

			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					const msg = { topic, payload: value, unit, clampName: clampLabels[config.number] || config.number };
					Object.assign(msg, clampData);
					this.send(msg);
				}
			});

			webio.emitter.addListener('webioData', data => {
				clampData = (data[portinfoType] || {})[config.number];
			});

			webio.emitter.addListener('webioGet', (type, values, status) => {
				if (type === 'single') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp && values && values[config.number - 1] !== undefined) {
						let match = values[config.number - 1].match(/^(-?\d+,?\d*).*$/);
						if (match !== null) {
							tmpValue = parseFloat(match[1].replace(',', '.'));
							sendWebioStatus({ fill: 'green', shape: 'dot', text: 'status.connected', params: { value: values[config.number - 1] } });
						} else {
							sendWebioStatus({ fill: 'red', shape: 'dot', text: 'status.no-value' });
						}

						match = values[config.number - 1].match(/^[-,\d]+\s?(.*)$/);
						unit = match !== null ? match[1] : '';
					} else {
						sendWebioStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						const msg = { topic, payload: value, unit, clampName: clampLabels[config.number] || config.number };
						Object.assign(msg, clampData);
						this.send(msg);
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					sendWebioStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			});
		} else {
			this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.invalid-webio'));
			sendWebioStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}
	});
}