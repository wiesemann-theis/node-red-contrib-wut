const { STATUS, STATUS_MSG } = require('./util/status');

module.exports = RED => {
	RED.nodes.registerType('Digital COUNTER', function (config) {
		const topic = config.topic || config.name || 'Digital COUNTER';
		const portinfoType = '4';

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
			let clampLabels = [];

			sendWebioStatus(STATUS_MSG[STATUS.NOT_INITIALIZED]);

			webio.emitter.addListener('webioLabels', labels => {
				clampLabels = labels[portinfoType] || {};
				isValidClamp = !!clampLabels[config.number];
				if (value !== undefined) {
					this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
				}
			});

			webio.emitter.addListener('webioGet', (type, values, status) => {
				if (type === `counter${config.number}`) { // workaround to handle single counter value messages
					const tmp = new Array(config.number + 1);
					tmp[config.number] = values;
					values = tmp;
					type = 'counter';
				}
				if (type === 'counter') {
					let tmpValue = null;

					if (status === STATUS.OK && isValidClamp && values && Number.isInteger(+values[config.number])) {
						tmpValue = +values[config.number];
						sendWebioStatus({ fill: 'green', shape: 'dot', text: 'status.connected', params: { value: values[config.number] } });
					} else {
						sendWebioStatus(STATUS_MSG[status] || STATUS_MSG[STATUS.UNKNOWN]);
					}

					if (tmpValue !== value) {
						value = tmpValue;
						this.send({ topic: topic, payload: value, clampName: clampLabels[config.number] || config.number });
					}
				} else if (!isValidClamp && status === STATUS.OK) {
					sendWebioStatus(STATUS_MSG[STATUS.OK]);  // invalid clamp status (if invalid web-io configured)
				}
			});
		} else {
			this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.invalid-webio'));
			sendWebioStatus(STATUS_MSG[STATUS.INVALID_CONFIG]);
		}

		this.on('input', msg => {
			if (isValidClamp) {
				const numericPayload = +msg.payload;
				if (webio && webio.emitter && Number.isInteger(numericPayload)) {
					webio.emitter.emit('webioSet', 'digitalcounter', config.number, numericPayload);
				} else {
					this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-failed'));
				}
			} else {
				this.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.input-invalid-clamp', { index: config.number }));
			}
		});
	});
}