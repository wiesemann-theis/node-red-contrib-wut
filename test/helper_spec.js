/* global should */
/* eslint-env mocha */
const helper = require('node-red-node-test-helper');
// const webioNode = require('../src/webio.js');
// const http = require('http');
const { parsePortinfos } = require('../src/util/helper');

helper.init(require.resolve('node-red'));

describe('Helper utils', () => {

  const MOCK_RED = {
    nodes: { getNode: (nodeId) => ({ warn: () => { } }) },
    '_': (key, data) => key
  }

  beforeEach(done => { helper.startServer(done); });

  afterEach(done => { helper.unload().then(() => helper.stopServer(done)); });

  it('should parse valid digital portinfos', done => {
    const rawData = '1.0|6\r\n0|a||||0|0|||||\r\n0|b||||0|0|||||\r\n0|c||||0|0|||||\r\n' +
      '0|d|1|Input 0||2|2|||||\r\n0|e|1|Input 0||4|4|||||\r\n0|f|3|Output 0||3|3|||||\r\n\u0000';
    const result = parsePortinfos(rawData, MOCK_RED, null);
    JSON.stringify(result.swInterfaces).should.equal('{"1":false,"2":true,"3":true,"4":true,"5":false,"6":false}');
    JSON.stringify(result.portData).should.equal('{}');
    JSON.stringify(result.portLabels).should.equal('{"1":{},"2":{"0":"Input 0"},"3":{"0":"Output 0"},"4":{"0":"Input 0"},"5":{},"6":{}}');
    done();
  });

  it('should parse valid analog portinfos', done => {
    const rawData = '1.1|4\r\n0|a||||0|0|||||||\r\n0|b||||0|0|||||||\r\n' +
      `0|I||Kanal 1|mA|6|6||1||||0.5000|30.0000\r\n0|I||Kanal 2|mA|1|1||2||||0.2000|0.0000\r\n`;

    const result = parsePortinfos(rawData, MOCK_RED, null);
    JSON.stringify(result.swInterfaces).should.equal('{"1":true,"2":false,"3":false,"4":false,"5":false,"6":true}');
    JSON.stringify(result.portData).should.equal('{"1":{"2":{"min":0,"max":20,"unit":"mA"}},"6":{"1":{"min":30,"max":80,"unit":"mA"}}}');
    JSON.stringify(result.portLabels).should.equal('{"1":{"2":"Kanal 2"},"2":{},"3":{},"4":{},"5":{},"6":{"1":"Kanal 1"}}');
    done();
  });

  it('should fail to parse invalid portinfos', done => {
    const result = parsePortinfos(null, MOCK_RED, null); // no data at all
    should(result).equal(null);

    const rawData2 = '0.1|6\r\n0|a||||0|0|||||||\r\n0|b||||0|0|||||||\r\n0|c||||0|0|||||||\r\n' +
      '0|d|1|Input 0||2|2|||||||\r\n0|e|1|Input 0||4|4|||||||\r\n0|f|3|Output 0||3|3|||||||\r\n\u0000';
    const result2 = parsePortinfos(rawData2, MOCK_RED, null); // invalid version
    should(result2).equal(null);

    const rawData3 = '1.1|8\r\n0|a||||0|0|||||||\r\n0|b||||0|0|||||||\r\n0|c||||0|0|||||||\r\n' +
      '0|d|1|Input 0||2|2|||||||\r\n0|e|1|Input 0||4|4|||||||\r\n0|f|3|Output 0||3|3|||||||\r\n\u0000';
    const result3 = parsePortinfos(rawData3, MOCK_RED, null); // invalid length
    should(result3).equal(null);

    const rawData4 = '1.1\r\n0|a||||0|0|||||||\r\n0|b||||0|0|||||||\r\n0|c||||0|0|||||||\r\n' +
      '0|d|1|Input 0||2|2|||||||\r\n0|e|1|Input 0||4|4|||||||\r\n0|f|3|Output 0||3|3|||||||\r\n\u0000';
    const result4 = parsePortinfos(rawData4, MOCK_RED, null); // invalid header
    should(result4).equal(null);

    done();
  });

  it('should handle rare portinfo formats properly', done => {
    const rawData = '1.1|5\r\n0|a||||0|0|||||||\r\n0|b||||0|0|||||||\r\n' +
      `0|I||Kanal 1|mA|1|1||1||||0.5000|30.0000\r\n0|I||Kanal 2|mA|1|1||2||||0.2000|0.0000\r\n0||||test|42|1||2||||invalid|invalid`;

    let warnCount = 0;
    const mockRed = {
      nodes: { getNode: (nodeId) => (nodeId ? { warn: () => { warnCount++; } } : null) },
      '_': (key, data) => ''
    }

    const result = parsePortinfos(rawData, mockRed, 42);
    JSON.stringify(result.swInterfaces).should.equal('{"1":true,"2":false,"3":false,"4":false,"5":false,"6":false}');
    JSON.stringify(result.portData).should.equal('{"1":{"1":{"min":30,"max":80,"unit":"mA"},"2":{"min":0,"max":20,"unit":"mA"}}}');
    JSON.stringify(result.portLabels).should.equal('{"1":{"1":"Kanal 1","2":""},"2":{},"3":{},"4":{},"5":{},"6":{}}');
    should(warnCount).equal(2); // doublet slot + invalid measurement

    const result2 = parsePortinfos('', mockRed, null);
    should(result2).equal(null);

    done();
  });


});
