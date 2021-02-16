const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Digital OUT', function (config) {
		const topic = config.topic || config.name || 'Digital OUT';
		const portinfoType = '3';
		const portinfoType2 = '5';

		RED.nodes.createNode(this, config);

		let lastStatusString = '';
		const sendWebioStatus = (status) => {
			if (JSON.stringify(status) !== lastStatusString) {
				lastStatusString = JSON.stringify(status);
				RED.comms.publish('wut/webio-i18n-status/' + this.id, status, true);
			}
		}

		let isValidClamp = true;
		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let lastValue = null;
			let diff = null;
			let clampLabels = [];

			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			const webioLabelsCb = (labels) => {
				clampLabels = Object.assign({}, labels[portinfoType2], labels[portinfoType]);
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					const clampName = clampLabels[config.number] || config.number;
					this.send({ topic, payload: value, lastValue, diff, clampName });
				}
			};

			const webioGetCb = (type, mask, status) => {
				if (type === 'output') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp) {
						tmpValue = ((mask >> config.number) & 1) === 1;
						sendWebioStatus({ fill: 'green', shape: 'dot', text: tmpValue ? 'status.connectedON' : 'status.connectedOFF' });
					} else {
						sendWebioStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						const lastLastValue = lastValue; // lastValue will be overwritten before msg is sent (to ensure data consistency)
						value = tmpValue;
						diff = value != null && lastValue !== null ? value !== lastValue : null;
						lastValue = value !== null ? value : lastValue;
						const clampName = clampLabels[config.number] || config.number;
						this.send({ topic, payload: value, lastValue: lastLastValue, diff, clampName });
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					sendWebioStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			};

			webio.emitter.addListener('webioLabels', webioLabelsCb);

			webio.emitter.addListener('webioGet', webioGetCb);

			this.on('close', () => {
				webio.emitter.removeListener('webioLabels', webioLabelsCb);
				webio.emitter.removeListener('webioGet', webioGetCb);
			});
		} else {
			this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.invalid-webio'));
			sendWebioStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}

		this.on('input', msg => {
			if (isValidClamp) {
				const stringPayload = (msg.payload + '').toLowerCase();
				if (['true', '1', 'on', 'an', 'ein'].indexOf(stringPayload) !== -1) {
					msg.payload = true;
				}
				if (['false', '0', 'off', 'aus'].indexOf(stringPayload) !== -1) {
					msg.payload = false;
				}
				if (webio && webio.emitter && typeof msg.payload === 'boolean') {
					webio.emitter.emit('webioSet', 'digitalout', config.number, msg.payload);
				} else {
					this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-failed'));
				}
			} else {
				this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-invalid-clamp', { index: config.number }));
			}
		});
	});
}