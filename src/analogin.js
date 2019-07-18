const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Analog IN', function (config) {
		const topic = config.name || 'Analog IN';
		const portinfoType = '1';
		
		RED.nodes.createNode(this, config);

		let lastStatusString = '';
		const sendStatus = (status) => {
			if (JSON.stringify(status) !== lastStatusString) {
				lastStatusString = JSON.stringify(status);
				this.status(status);
				RED.comms.publish('wut/i18n-status/analogin/' + this.id, null, false); // publish empty message to "delete" retained message
			}
		};
		const sendI18nStatus = (i18nStatus) => {
			if (JSON.stringify(i18nStatus) !== lastStatusString) {
				lastStatusString = JSON.stringify(i18nStatus);
				RED.comms.publish("wut/i18n-status/analogin/" + this.id, i18nStatus, true);
			}
		};

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let unit = '';
			let isValidClamp = true;
			let clampLabels = [];

			sendStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				this.send({ topic: topic, payload: value, unit: unit, clampName: clampLabels[config.number] || config.number });
			});

			webio.emitter.addListener('webioGet', (type, values, status) => {
				if (type === 'single') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp && values && values[config.number - 1] !== undefined) {
						let match = values[config.number - 1].match(/^(-?\d+,?\d*).*$/);
						if (match !== null) {
							tmpValue = parseFloat(match[1].replace(',', '.'));
							// workaround to generate parameterized status messages (this.status(...) does not support dynamic parameters (yet)!)
							sendI18nStatus({ fill: 'green', shape: 'dot', text: 'status.connected', params: { value: values[config.number - 1] } });
						} else {
							sendStatus({ fill: 'red', shape: 'dot', text: 'status.no-value' });
						}

						match = values[config.number - 1].match(/^[-,\d]+\s?(.*)$/);
						unit = match !== null ? match[1] : '';
					} else {
						sendStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						this.send({ topic: topic, payload: value, unit: unit, clampName: clampLabels[config.number] || config.number });
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					sendStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			});

			this.on('close', () => {
				webio.emitter.removeAllListeners('webioGet');
				webio.emitter.removeAllListeners('webioLabels');
				RED.comms.publish('wut/i18n-status/analogin/' + this.id, null, false); // publish empty message to "delete" retained message
			});
		} else {
			this.warn(RED._('logging.invalid-webio'));
			sendStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}
	});
}