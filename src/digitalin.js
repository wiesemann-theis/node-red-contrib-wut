const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Digital IN', function (config) {
		const topic = config.topic || config.name || 'Digital IN';
		const portinfoType = '2';

		RED.nodes.createNode(this, config);

		let lastStatusString = '';
		const sendWebioStatus = (status) => {
			if (JSON.stringify(status) !== lastStatusString) {
				lastStatusString = JSON.stringify(status);
				RED.comms.publish('wut/webio-i18n-status/' + this.id, status, true);
			}
		}

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let lastValue = null;
			let diff = null;
			let isValidClamp = true;
			let clampLabels = [];

			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					const clampName = clampLabels[config.number] || config.number;
					this.send({ topic, payload: value, lastValue, diff, clampName });
				}
			});

			webio.emitter.addListener('webioGet', (type, mask, status) => {
				if (type === 'input') {
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
			});
		} else {
			this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.invalid-webio'));
			sendWebioStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}
	});
}