const fs = require('fs');
const path = require('path');
const wutBroadcast = require('./wut-broadcast');
const { parsePortinfos } = require('./helper');

let isInitialized = false;

const init = RED => {
    if (!isInitialized && RED) { // endpoints only need to be initialized once
        isInitialized = true;

        RED.httpAdmin.get("/wut/devices/:type", RED.auth.needsPermission('wut.read'), function (req, res) {
            const node = RED.nodes.getNode(req.query.nodeId) || console; // for logging: try to identify node for logging; use console as default
            const type = req.params.type || '';
            node.log(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.wut-broadcast-started'));
            wutBroadcast(req.query.clearCache === 'true').then(data => {
                const result = data.filter(d => { // only return Com-Servers or Web-IOs...
                    if (type === 'comserver') {
                        return d.productId && d.productId.startsWith('58') || ['57631'].indexOf(d.productId) > -1; // Com-Servers usually have an 58xxx article no. -> exceptions: 57631
                    } else if (type === 'webio') {
                        return d.portinfoAvailable;
                    }
                    return false;
                });
                node.log(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.wut-broadcast-finished', { count: result.length }));
                res.set({ 'Cache-Control': 'no-cache, no-store', 'Expires': -1, 'Pragma': 'no-cache' });
                res.json(result);
            }, err => {
                node.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.wut-broadcast-failed', { msg: err.message }));
                res.set({ 'Cache-Control': 'no-cache, no-store', 'Expires': -1, 'Pragma': 'no-cache' });
                res.json(null);
            });
        });

        RED.httpAdmin.get("/wut/files/:filename", RED.auth.needsPermission('wut.read'), (req, res) => {
            try {
                const filepath = path.normalize(__dirname + '/../webfiles/' + req.params.filename);
                fs.accessSync(filepath);
                res.sendFile(filepath);
            } catch (e) {
                res.sendStatus(404);
            }
        });

        RED.httpAdmin.put("/wut/portinfo/:webioid", RED.auth.needsPermission('wut.read'), (req, res) => {
            const nodeId = req.params.webioid;
            const node = RED.nodes.getNode(nodeId) || console; // for logging: try to identify node for logging; use console as default
            const protocol = req.body.protocol || 'http';
            const host = req.body.host || '';
            const port = req.body.port || 80;
            const url = `${protocol}://${host}:${port}/portinfo`;

            const http = require(protocol);
            http.get(url, response => {
                response.setEncoding(JSON.stringify(response.headers).includes('utf-8') ? 'utf-8' : 'latin1');

                let data = '';
                response.on('data', chunk => data += chunk);

                response.on('end', () => {
                    let portlabels = {}; // if invalid or no portinfos received -> delete old portlabel information to avoid inconsistent states
                    let portdata = {}; // if invalid or no portinfos received -> delete old portdata information to avoid inconsistent states
                    if (response.statusCode === 200) {
                        const parsedData = parsePortinfos(data, RED, nodeId);
                        portlabels = parsedData ? (parsedData.portLabels || {}) : {};
                        portdata = parsedData ? (parsedData.portData || {}) : {};
                    } else if (response.statusCode !== 404) {
                        node.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.portinfos.failed'));
                    }
                    RED.comms.publish('wut/portlabels/' + nodeId, portlabels); // workaround to publish infos to web client
                    RED.comms.publish('wut/portdata/' + nodeId, portdata); // workaround to publish infos to web client
                });
            }).on('error', err => {
                node.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.portinfos.failed'));
                RED.comms.publish('wut/portlabels/' + nodeId, {}); // delete old portlabel information to avoid inconsistent states
                RED.comms.publish('wut/portdata/' + nodeId, {}); // delete old portdata information to avoid inconsistent states
            });

            res.sendStatus(200); // portinfo request was triggered -> therefore, this put request was successful (regardless of the portinfo request result)
        });
    }
}

module.exports = {
    init
};