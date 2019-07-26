const dgram = require('dgram');

const broadcastMsg = 'Version 1.04';
const broadcastPort = 8513;
const broadcastAddress = '255.255.255.255';
const broadcastTimeout = 1000;

const cacheTimeoutSec = 5 * 60; // 5 min

let cachedData = null;
let cacheTimestamp = 0;

function createSocket() {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        socket.on('error', (err) => reject(err));
        socket.on('listening', () => resolve(socket));
        socket.bind();
    });
}

function closeSocket(socket) {
    return new Promise((resolve, reject) => {
        if (socket) {
            socket.close(resolve);
        } else {
            resolve(); // no socket passed -> nothing to close
        }
    });
}

function sendBroadcast(socket) {
    return new Promise((resolve, reject) => {
        if (socket) {
            socket.setBroadcast(true);
            socket.send(broadcastMsg, 0, broadcastMsg.length, broadcastPort, broadcastAddress, (err, bytes) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        } else {
            reject(new Error('Sending W&T broadcast failed. No UDP socket available.'));
        }
    });
}

function timeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGisData(buffer) {
    const response = {};
    let isValid = Buffer.isBuffer(buffer) && buffer.length >= 4;
    if (isValid) {
        version = buffer[0] + '.' + buffer[1];
        response.version = version;
        if (version === '1.4') { // special treatment for v1.04
            const gisLength = buffer.readUInt16LE(2);
            isValid = buffer.length === gisLength + 4;
            if (isValid) {
                let offset = 8;
                const lengthValues = [1, 2, 4, 6, 8, 16, 0, -1]; // to map lengthKeys to actual lengths (key 6 is not defined; special handling for key 7)
                while (offset < gisLength + 1) { // min length for GisItem is 3 bytes
                    const type = buffer.readUInt16LE(offset);
                    const lengthKey = (type >> 12) & 0x7;
                    const isIndexed = (type >> 15) & 0x1; // flag stating that "Condition" and "Index" fields are available
                    const headLength = 2 + (isIndexed ? 2 : 0) + (lengthKey === 7 ? 2 : 0);
                    if (offset < gisLength + 4 - headLength && lengthValues[lengthKey]) {
                        const dataLength = lengthKey === 7 ? buffer.readUInt16LE(offset + headLength - 2) : lengthValues[lengthKey];
                        const rawData = buffer.slice(offset + headLength, offset + headLength + dataLength);

                        switch (type & 0x0FFF) { // which information does the GisItem represent?
                            // MAC -> only use index 0
                            case 0: response.mac = (isIndexed && buffer[offset + 3] === 0) ? rawData.toString('hex').match(/.{1,2}/g).join(':') : response.mac; break;
                            case 11: response.port = parseInt(Buffer.from(rawData).reverse().toString('hex'), 16); break;
                            case 13: response.sysname = rawData.toString(); break;
                            case 14: // system flags
                                response.httpsSupport = !!(rawData[2] & 0x1);
                                response.httpsEnabled = !!(rawData[2] & 0x2);
                                break;
                            case 15: response.prodname = rawData.toString(); break;
                            case 16: response.softname = rawData.toString(); break;
                            case 19: response.productid = parseInt(Buffer.from(rawData).reverse().toString('hex'), 16).toString(); break;
                        }
                        offset += (headLength + dataLength);
                    } else {
                        break; // abort
                    }
                }
            }
        } else { // all older versions have a similar structure
            const portCountIndexes = { '1.0': 30, '1.1': 46, '1.3': 280 };
            const minLength = portCountIndexes[version] + 2;
            isValid = buffer.length >= minLength && buffer.length === minLength + 10 * buffer.readUInt16LE(minLength - 2, minLength);
            if (isValid) {
                if (version === '1.0') {
                    response.mac = buffer.slice(10, 10 + 6).toString('hex').match(/.{1,2}/g).join(':');
                } else if (version === '1.1') {
                    response.productid = buffer.slice(10, 18).toString('latin1').replace(/\0/g, '').substr(1);
                    response.mac = buffer.slice(26, 26 + 6).toString('hex').match(/.{1,2}/g).join(':');
                } else if (version === '1.3') {
                    response.mac = buffer.slice(260, 260 + 6).toString('hex').match(/.{1,2}/g).join(':');
                    response.port = buffer.readUInt16LE(40);
                    response.sysname = buffer.slice(44, 44 + 48).toString('latin1').replace(/\0/g, '');
                    response.prodname = buffer.slice(104, 104 + 64).toString('latin1').replace(/\0/g, '');
                    response.softname = buffer.slice(168, 168 + 48).toString('latin1').replace(/\0/g, '');
                    response.productid = parseInt(Buffer.from(buffer.slice(96, 102)).reverse().toString('hex'), 16).toString().substr(7, 5);
                    response.httpsSupport = !!(buffer[94] & 0x1);
                    response.httpsEnabled = !!(buffer[94] & 0x2);
                }
            }
        }
    }
    return isValid ? response : null;
}

async function findWutDevices(clearCache) {
    if (!cachedData || clearCache || new Date() - cacheTimestamp > cacheTimeoutSec * 1000) {
        const responses = [];
        let socket = null;
        try {
            socket = await createSocket();

            socket.on('message', (msg, src) => {
                if (src.port === broadcastPort) {
                    const infos = parseGisData(msg, src.address);
                    if (infos) {
                        infos.ip = src.address;
                        infos.id = `${infos.ip}:${infos.port} (${infos.mac})`;
                        responses.push(infos);
                    } else {
                        console.warn('W&T broadcast: invalid GIS data received from ' + src.address);
                    }
                }
            });

            await sendBroadcast(socket);
            await timeout(broadcastTimeout); // wait for responses
            await closeSocket(socket);
        } catch (e) {
            closeSocket(socket).catch(err => console.warn('W&T broadcast: closing socket failed', err.message));
            throw e; // re-throw exception -> like Promise.reject
        }
        const mapIp = (ip) => ip.replace(/(\d+)/g, d => ('000' + d).slice(-3));
        cachedData = responses.sort((a, b) => mapIp(a.ip) > mapIp(b.ip) ? 1 : -1); // sort by ip
        cacheTimestamp = new Date();
    }
    return cachedData;
}

module.exports = findWutDevices;