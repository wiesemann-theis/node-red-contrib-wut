function parsePortinfos(data, RED, nodeId) {
    const node = RED.nodes.getNode(nodeId) || console; // for logging: try to identify node for logging; use console as default
    const lines = (data || '').split('\r\n');
    if (!lines[lines.length - 1] || lines[lines.length - 1] === '\u0000') {
        lines.pop(); // remove empty line at the end
    }
    const details = lines.map(line => line.split('|'));
    let isValid = details[0];

    if (isValid) {
        const headerVersion = details[0][0];
        const headerLength = +details[0][1] || 0;

        isValid = headerLength + 1 === lines.length && details[0].length === 2;
        const relevantLines = details.filter(line => line && +line[5] >= 1);
        const flatInfos = relevantLines.reduce((acc, val) => acc.concat(val), []);
        if (headerVersion === '1.0') {
            isValid &= flatInfos.length === (relevantLines.length * 12);
        } else if (headerVersion === '1.1') {
            isValid &= flatInfos.length === (relevantLines.length * 14);
        } else {
            isValid = false;
        }
    }

    if (isValid) {
        const swInterfaces = {};
        const portData = {};
        const portLabels = {};

        for (let i = 1; i <= 6; ++i) { // iterate over defined software interface ids
            const relevantEntries = details.filter(line => +line[5] === i || (+line[5] > 6 && +line[6] === i)); // if line[5] is unknown, fall back to line[6]
            swInterfaces[i] = relevantEntries.length > 0; // flag which software interfaces the web-io provides -> corresponding data needs to be polled and published

            const typeLabels = {};
            const typeData = {};
            for (let k = 0; k < relevantEntries.length; ++k) {
                const entry = relevantEntries[k];
                const slot = +entry[8] || 0;
                if (typeLabels[slot]) {
                    node.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.portinfos.doublet-slot', { slot, type: i }));
                }
                typeLabels[slot] = entry[3] || entry[1] || ''; // label = individually configured name OR official clamp name OR ''

                if (entry[12] && entry[13]) { // data is only available for analog devices and portinfo version 1.1
                    const gradient = parseFloat(entry[12]);
                    const minimum = parseFloat(entry[13]);
                    if (!isNaN(minimum) && !isNaN(gradient)) {
                        const min = +(minimum.toFixed(2));
                        const max = +((gradient * 100 + minimum).toFixed(2));
                        typeData[slot] = { min, max, unit: entry[4] };
                    } else {
                        node.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.portinfos.invalid-measurement-range', { slot, type: i, gradient, minimum }));
                    }
                }
            }
            portLabels[i] = typeLabels;
            if (Object.keys(typeData).length) {
                portData[i] = typeData;
            }
        }

        return { swInterfaces, portData, portLabels };
    } else {
        node.warn(RED._('@wiesemann-theis/node-red-contrib-wut/web-io:logging.portinfos.invalid'));
        return null;
    }
}

module.exports = {
    parsePortinfos
};
