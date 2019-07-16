const { STATUS, STATUS_MSG } = require('./util');

module.exports = RED => {
	RED.nodes.registerType('Digital IN', function (config) {
		RED.nodes.createNode(this, config);

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let isValidClamp = true;
			const topic = config.name || 'Digital IN';
			const portinfoType = '2';
			let clampLabels = [];

			this.status(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
			});

			webio.emitter.addListener('webioGet', (type, mask, status) => {
				if (type === 'input') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp) {
						tmpValue = ((mask >> config.number) & 1) === 1;
						this.status({ fill: 'green', shape: 'dot', text: tmpValue ? 'status.connectedON' : 'status.connectedOFF' });
					} else {
						this.status(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
					}
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
	});
}