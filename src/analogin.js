const { STATUS, STATUS_MSG } = require('./util');

module.exports = RED => {
	RED.nodes.registerType('Analog IN', function (config) {
		RED.nodes.createNode(this, config);

		const sendStatus = (status) => {
			this.status(status);
			RED.comms.publish('wut/i18n-status/' + this.id, null, false); // publish empty message to "delete" retained message
		}

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let unit = '';
			const topic = config.name || 'Analog IN';
			const portinfoType = '1';
			let clampLabels = [];

			sendStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || [];
				this.send({ topic: topic, payload: value, unit: unit, clampName: clampLabels[config.number - 1] || config.number });
			});

			webio.emitter.addListener('webioGet', (type, values, status) => {
				if (type === 'single' && values) {
					let tmpValue = null;

					if (status === STATUS.OK && values[config.number - 1] !== undefined) {
						let match = values[config.number - 1].match(/^(-?\d+,?\d*)\D*.*$/);
						if (match !== null) {
							tmpValue = parseFloat(match[1].replace(',', '.'));
							// workaround to generate parameterized status messages (this.status(...) does not support dynamic parameters (yet)!)
							const i18nStatus = { fill: 'green', shape: 'dot', text: 'status.connected', params: { value: values[config.number - 1] } };
							RED.comms.publish("wut/i18n-status/" + this.id, i18nStatus, true);
						} else {
							sendStatus({ fill: 'red', shape: 'dot', text: 'status.no-value' });
						}

						match = values[config.number - 1].match(/^[-,\d]+(\D*.*)$/);
						unit = match !== null ? match[1] : '';
					} else {
						sendStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						this.send({ topic: topic, payload: value, unit: unit, clampName: clampLabels[config.number - 1] || config.number });
					}
				}
			});

			this.on('close', () => {
				webio.emitter.removeAllListeners('webioGet');
				webio.emitter.removeAllListeners('webioLabels');
				RED.comms.publish('wut/i18n-status/' + this.id, null, false); // publish empty message to "delete" retained message
			});
		} else {
			this.warn(RED._('logging.invalid-webio'));
			sendStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}
	});
}