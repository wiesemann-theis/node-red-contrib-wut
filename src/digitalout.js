const { STATUS, STATUS_MSG } = require('./util');
const nodeName = 'Digital OUT';

module.exports = RED => {
	RED.nodes.registerType(nodeName, function (config) {
		RED.nodes.createNode(this, config);

		const webio = RED.nodes.getNode(config.webio);
		if (webio && webio.emitter) {
			let value;
			let isValidClamp = true;
			const topic = config.name || nodeName;

			this.status(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				let temp = (labels || [])[3];
				if (!temp || !temp.length) {
					temp = (labels || [])[5];
				}
				isValidClamp = !temp || !temp.length || config.number < temp.length;
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
						this.send({ topic: topic, payload: value });
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