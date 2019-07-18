const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Digital OUT', function (config) {
		const topic = config.name || 'Digital OUT';
		const portinfoType = '3';
		const portinfoType2 = '5';

		RED.nodes.createNode(this, config);

		let isValidClamp = true;
		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let clampLabels = [];

			let lastStatusString = '';
			const setStatus = (status) => {
				if (JSON.stringify(status) !== lastStatusString) {
					lastStatusString = JSON.stringify(status);
					this.status(status);
				}
			}

			setStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || labels[portinfoType2] || {};
				isValidClamp = !!clampLabels[config.number];
				this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
			});

			webio.emitter.addListener('webioGet', (type, mask, status) => {
				if (type === 'output') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp) {
						tmpValue = ((mask >> config.number) & 1) === 1;
						setStatus({ fill: 'green', shape: 'dot', text: tmpValue ? 'status.connectedON' : 'status.connectedOFF' });
					} else {
						setStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					setStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			});

			this.on('close', () => {
				webio.emitter.removeAllListeners('webioGet');
				webio.emitter.removeAllListeners('webioLabels');
			});
		} else {
			this.warn(RED._('logging.invalid-webio'));
			this.status(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}

		this.on('input', msg => {
			if (isValidClamp) {
				if (webio && webio.emitter && typeof msg.payload === 'boolean') {
					webio.emitter.emit('webioSet', 'digitalout', config.number, msg.payload);
				} else {
					this.warn(RED._('logging.input-failed'));
				}
			} else {
				this.warn(RED._('logging.input-invalid-clamp', { index: config.number }));
			}
		});
	});
}