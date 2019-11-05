/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const testNode = require("../src/digitalcounter.js");
const webioNode = require('../src/webio.js');
const { STATUS } = require('../src/util/status');

const portinfoType = '4';
const getTestFlow = (nodeName, clampNumber) => {
  return [
    { id: 'helperNode', type: 'helper' },
    { id: 'testNode', type: 'Counter', name: nodeName, webio: 'webio1', number: (clampNumber || 0), wires: [['helperNode']] },
    { id: 'webio1', type: 'Web-IO', host: 'i n va l i d', port: '80', protocol: 'http' }
  ];
};

helper.init(require.resolve('node-red'));

describe('Counter Node', () => {

  beforeEach(done => { helper.startServer(done); });

  afterEach(done => { helper.unload().then(() => helper.stopServer(done)); });

  it('should be loaded', done => {
    const flow = [{ id: 'testNode', type: 'Counter', name: 'DEMO Counter' }];
    helper.load(testNode, flow, () => {
      helper.getNode('testNode').should.have.property('name', 'DEMO Counter');
      done();
    });
  });

  it('should generate output messages when data is received', done => {
    const nodeName = 'Demo Counter';
    helper.load([testNode, webioNode], getTestFlow(nodeName, 1), () => {
      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ topic: nodeName, clampName: 1 });
        switch (++msgCount) {
          case 1:
            msg.should.have.property('payload', 73);
            msg.should.have.property('unit', '');
            helper.getNode('webio1').emitter.emit('webioGet', 'counter', ['73', '42'], STATUS.OK);  // expect message with payload true to be sent
            break;
          case 2:
            msg.should.have.property('payload', 42);
            msg.should.have.property('unit', '');
            helper.getNode('webio1').emitter.emit('webioGet', 'counter', ['73', '42'], STATUS.OK);  // same message again -> should not generate output
            helper.getNode('webio1').emitter.emit('webioGet', 'counter', ['1', '12,34mA'], STATUS.OK);  // expect message with payload 12.34 and unit 'mA' to be sent
            break;
          case 3:
            msg.should.have.property('payload', 12.34);
            msg.should.have.property('unit', 'mA');
            done();
            break;
        }
      });

      helper.getNode('webio1').emitter.emit('webioGet', 'counter', ['42', '73'], STATUS.OK); // expect message with payload 73 to be sent
    });
  });

  it('should process input data correctly', done => {
    helper.load([testNode, webioNode], getTestFlow('', 1), () => {
      const node = helper.getNode('testNode');
      const emitter = helper.getNode('webio1').emitter;

      let setData = [];
      emitter.addListener('webioSet', (type, number, value) => {
        setData.push({ type, number, value });
      });

      node.receive({}); // empty message -> expect warning
      node.warn.callCount.should.equal(1);

      const testData = [
        ['42', 42], ['12.34', 12.34], ['12,34', 12.34], [42, 42], [-1.2, -1.2]
      ];
      let expect = '';
      testData.forEach(data => {
        setData = [];
        node.receive({ payload: data[0] }); // valid message -> no warning, but webioSet message
        node.warn.callCount.should.equal(1);
        expect = JSON.stringify([{ type: 'digitalcounter', number: 1, value: data[1] }]);
        JSON.stringify(setData).should.equal(expect);
      });

      emitter.emit('webioLabels', {}); // set isValidClamp to false
      node.receive({ payload: 42 }); // valid message, but invalid clamp -> expect warning
      node.warn.callCount.should.equal(2);

      done();
    });
  });

  it('should pass on custom clamp labels', done => {
    helper.load([testNode, webioNode], getTestFlow(null, 3), () => {
      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ payload: 7.8 });
        switch (++msgCount) {
          case 1:
            msg.should.have.property('clampName', 'DEMO');
            break;
          case 2:
            msg.should.have.property('clampName', 'foo bar');
            break;
          case 3:
            msg.should.have.property('clampName', 3);
            done();
            break;
        }
      });

      const emitter = helper.getNode('webio1').emitter;
      let data = {};
      data[portinfoType] = { 3: 'DEMO' };
      emitter.emit('webioLabels', data); // do not expect output mesasge (because value is not set yet)
      emitter.emit('webioGet', 'counter', ['1,2', '3,4', '5,6', '7,8'], STATUS.OK); // do not expect clampData

      data[portinfoType] = { 3: 'foo bar' };
      emitter.emit('webioLabels', data); // expect retriggered output message

      emitter.emit('webioLabels', {}); // expect retriggered output message
    });
  });

  it('should handle invalid webio information properly', done => {
    helper.load([testNode, webioNode], getTestFlow(), () => {
      const emitter = helper.getNode('webio1').emitter;

      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ topic: 'Counter', payload: null, clampName: 0 });
        switch (++msgCount) {
          case 1:
            emitter.emit('webioGet', 'invalidtype', ['42'], STATUS.OK); // -> invalid type -> don't do anything (no output message)
            emitter.emit('webioGet', 'counter', [null], STATUS.OK); // -> invalid value -> don't do anything (no output message)

            emitter.emit('webioLabels', {}); // set isValidClamp to false (will resend payload null)
            break;
          case 2:
            emitter.emit('webioGet', 'invalidtype', ['42'], STATUS.OK); // -> error 'invalid clamp' (no output message)
            done();
            break;
        }
      });

      emitter.emit('webioGet', 'counter', ['42'], 'unknown_status'); // -> error 'unknown status' (send payload null)
    });
  });

  it('should handle single values properly', done => {
    const nodeName = 'Demo Counter';
    helper.load([testNode, webioNode], getTestFlow(nodeName, 7), () => {
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.property('payload', 12.34);
        msg.should.have.property('unit', 'mA');
        msg.should.have.property('clampName', 7);
        done();
      });

      helper.getNode('webio1').emitter.emit('webioGet', 'counter7', '12,34mA', STATUS.OK); // expect message with payload 73 to be sent
    });
  });
});
