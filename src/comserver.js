const net = require('net');
const wutBroadcast = require('./util/wut-broadcast');

module.exports = RED => {
    const reconnectTime = RED.settings.socketReconnectTime || 10000;

    RED.httpAdmin.get("/wut/devices/comserver", RED.auth.needsPermission('wut.read'), function (req, res) {
        const node = RED.nodes.getNode(req.query.nodeId) || console; // for logging: try to identify node for logging; use console as default
        node.log(RED._('logging.wut-broadcast-started'));
        wutBroadcast(req.query.clearCache === 'true').then(data => {
            // only return com-servers (no web-ios or other devices)
            const comservers = data.filter(d => d.productId && d.productId.startsWith('58'));
            node.log(RED._('logging.wut-broadcast-finished', { count: comservers.length }));
            res.json(comservers);
        }, err => {
            node.warn(RED._('logging.wut-broadcast-failed', { msg: err.message }));
            res.json(null);
        });
    });

    RED.nodes.registerType('Com-Server', function (config) {
        RED.nodes.createNode(this, config);

        const host = config.host;
        const port = +config.port;
        const topic = config.name || 'Com-Server';
        const format = config.format || 'string';
        const delimiter = (config.delimiter || '').replace('\\n', '\n').replace('\\r', '\r');

        const node = this;

        let connected = false;
        let buffer = null;
        let tcpClient;
        let controlClient; // (optional) use control port to set baudrate etc. on startup
        let reconnectTimeout;

        const setupConfigConnection = () => {
            // const configPort = +config.configport || 9094;
            const configPort = port + 1094; // NOTE: this node could handle individual config ports but other (important) tools cannot! -> therefore, do not offer this configuration option (yet)
            let dataTransmitted = false;
            let setData = null;

            if (controlClient) { controlClient.destroy(); }

            controlClient = net.connect(configPort, host);

            controlClient.on('connect', () => {
                // when connected, send authentication data immediately --> otherwise Com-Server will close connection after 2 s!
                const pwData = Buffer.concat([Buffer.from(node.credentials.password || ''), Buffer.from([0])]);
                controlClient.write(pwData);
            });

            controlClient.on('data', (data) => {
                // expect 30 bytes with leading + trailing 0x00 byte
                const isValid = Buffer.isBuffer(data) && data.length === 30 && data[0] === 0 && data[data.length - 1] === 0;
                if (isValid) {
                    if (!dataTransmitted) { // on first data receiving (indirectly triggered by sending password data when connected!), set custom values and send data back
                        dataTransmitted = true;
                        const baudrate = +config.baudrate || 3; // 0-15
                        const parity = +config.parity || 0; // 0, 1, 3, 5, 7
                        const stopbits = +config.stopbits || 1; // 1-2
                        const databits = +config.databits || 8; // 5-8
                        const eepromUpdate = config.permupdate || false;

                        setData = Buffer.from(data);
                        setData[9] &= 0xE0; // clear baudrate bits
                        setData[9] |= (baudrate & 0x1F); // set custom baudrate bits

                        setData[10] = 0x00; // clear parity/stop/data bits
                        setData[10] |= ((databits - 5) & 0x03); // set data bits (5 = 00, 6 = 01, 7 = 10, 8 = 11)
                        setData[10] |= (((stopbits - 1) & 0x01) << 2); // set stop bits (1 = 0, 2 = 1)
                        setData[10] |= ((parity & 0x07) << 3); // set parity bits (NONE = 0, ODD = 1, EVEN = 3, MARK = 5, SPACE = 7)

                        setData[24] &= 0xF0; // clear save flags
                        setData[24] |= eepromUpdate ? 0x02 : 0x01; // set save flags

                        controlClient.write(setData);
                    } else { // on second data receiving, validate that custom values have been applied and close connection
                        if (setData && data[9] === setData[9] && data[10] === setData[10]) {
                            node.log(RED._('logging.config.success'));
                        } else {
                            node.warn(RED._('logging.config.invaliddata'));
                        }
                        controlClient.end();
                    }
                } else {
                    if (data && data.toString().toLowerCase() === 'passwd?\u0000') {
                        node.log(RED._('logging.config.passworderror'));
                    } else {
                        node.warn(RED._('logging.config.unexpecteddata'));
                    }
                    controlClient.end(); // close socket
                }
            });

            controlClient.on('error', (err) => node.error(err));
        }

        const setupTcpConnection = () => {
            node.status({ fill: 'grey', shape: 'dot', text: 'status.connecting' });

            if (tcpClient) { tcpClient.destroy(); }

            tcpClient = net.connect(port, host);
            tcpClient.setKeepAlive(true);

            tcpClient.on('connect', () => {
                connected = true;
                node.log(RED._('logging.connection.established', { host: host, port: port }));
                buffer = '';
                node.status({ fill: 'green', shape: 'dot', text: 'status.connected' });

                if (config.setuart) {
                    setupConfigConnection(); // transmit UART config when connected
                }
            });

            tcpClient.on('data', (data) => {
                if (format === 'string') {
                    data = data.toString(config.encoding || 'utf8');
                    if (delimiter) {
                        buffer += data;
                        const parts = buffer.split(delimiter);
                        const suffix = (config.sendDelimiter ? delimiter : '');
                        for (let i = 0; i < parts.length - 1; ++i) { // send out all but last part
                            node.send({ topic: topic, payload: parts[i] + suffix });
                        }
                        buffer = parts[parts.length - 1];
                    } else {
                        node.send({ topic: topic, payload: data });
                    }
                } else {
                    node.send({ topic: topic, payload: data });
                }
            });
            tcpClient.on('end', () => {
                if (buffer) { // if there is something left in the buffer, send/output it
                    node.send({ topic: topic, payload: buffer });
                    buffer = '';
                }
            });
            tcpClient.on('close', () => {
                connected = false;
                node.status({ fill: 'red', shape: 'dot', text: 'status.disconnected' });
                if (node.done) {
                    node.done();
                } else {
                    node.error(RED._('logging.connection.lost', { host: host, port: port }));
                    clearTimeout(reconnectTimeout);
                    reconnectTimeout = setTimeout(setupTcpConnection, reconnectTime);
                }
            });
            tcpClient.on('error', (err) => node.error(err));
        }

        if (host && port) {
            setupTcpConnection();
        } else {
            node.error(RED._('logging.invalid-config', { host, port }));
            node.status({ fill: 'red', shape: 'dot', text: 'status.invalid-config' });
        }

        node.on("input", (msg) => {
            if (connected && tcpClient && msg.payload) {
                const data = Buffer.isBuffer(msg.payload) ? msg.payload : Buffer.from('' + msg.payload, config.encoding || 'utf8');
                tcpClient.write(data);
            } else {
                node.error(RED._('logging.input-failed'));
            }
        });

        node.on('close', (done) => {
            node.done = done;
            clearTimeout(reconnectTimeout);
            if (controlClient) { // controlClient should be closed/ended already -> destroy if not
                controlClient.destroy();
            }
            if (tcpClient) {
                tcpClient.end();
                setTimeout(() => {
                    if (tcpClient && !tcpClient.destroyed) {
                        tcpClient.destroy();
                        node.log(RED._('logging.connection.force-destroy', { host: host, port: port }));
                    }
                    done();
                }, 1000);
            } else {
                done();
            }
        });
    }, { credentials: { password: { type: 'password' } } });
}
