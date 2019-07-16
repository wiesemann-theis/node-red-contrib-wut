const { STATUS, STATUS_MSG } = require('./util');

module.exports = RED => {
	RED.nodes.registerType('Digital OUT', function (config) {
		RED.nodes.createNode(this, config);

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let isValidClamp = true;
			const topic = config.name || 'Digital OUT';
			const portinfoType = '3';
			const portinfoType2 = '5';
			let clampLabels = [];

			this.status(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || labels[portinfoType2] || [];
				isValidClamp = !clampLabels.length || config.number < clampLabels.length;
				this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
			});
			
			webio.emitter.addListener('webioGet', (type, mask, status) => {
				if (type === 'output') {
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

		this.on('input', msg => {
			if (webio && webio.emitter) {
				if (typeof msg.payload === 'boolean') {
					webio.emitter.emit('webioSet', 'output', config.number, msg.payload);
				}
			} else {
				this.warn(RED._('logging.input-failed'));
			}
		});
	});
}