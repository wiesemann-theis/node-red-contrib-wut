const fs = require('fs');
const path = require('path');
const wutBroadcast = require('./wut-broadcast');

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
                        return d.productId && d.productId.startsWith('58');
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
    }
}

module.exports = {
    init
};