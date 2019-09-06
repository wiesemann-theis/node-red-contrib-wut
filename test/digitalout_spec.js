/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const testNode = require("../src/digitalout.js");
const webioNode = require('../src/webio.js');
const { STATUS } = require('../src/util/status');

const portinfoType = '3';
const portinfoType2 = '5';
const getTestFlow = (nodeName, clampNumber) => {
  return [
    { id: 'helperNode', type: 'helper' },
    { id: 'testNode', type: 'Digital OUT', name: nodeName, webio: 'webio1', number: (clampNumber || 0), wires: [['helperNode']] },
    { id: 'webio1', type: 'Web-IO', host: 'foobar', port: '80', protocol: 'http' }
  ];
};

helper.init(require.resolve('node-red'));

describe('Digital OUT Node', () => {

  beforeEach(done => { helper.startServer(done); });

  afterEach(done => { helper.unload().then(() => helper.stopServer(done)); });

  it('should be loaded', done => {
    const flow = [{ id: 'testNode', type: 'Digital OUT', name: 'DEMO Digital OUT' }];
    helper.load(testNode, flow, () => {
      helper.getNode('testNode').should.have.property('name', 'DEMO Digital OUT');
      done();
    });
  });

  it('should generate output messages when data is received', done => {
    const nodeName = 'Demo Digital OUT';
    helper.load([testNode, webioNode], getTestFlow(nodeName, 1), () => {
      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ topic: nodeName, clampName: 1 });
        switch (++msgCount) {
          case 1:
            msg.should.have.property('payload', false);
            helper.getNode('webio1').emitter.emit('webioGet', 'output', 2, STATUS.OK);  // expect message with payload true to be sent
            break;
          case 2:
            msg.should.have.property('payload', true);
            helper.getNode('webio1').emitter.emit('webioGet', 'output', 2, STATUS.OK);  // same message again -> should not generate output
            helper.getNode('webio1').emitter.emit('webioGet', 'output', 1, STATUS.OK);  // expect message with payload false to be sent
            break;
          case 3:
            msg.should.have.property('payload', false);
            done();
            break;
        }
      });

      helper.getNode('webio1').emitter.emit('webioGet', 'output', 0, STATUS.OK); // expect message with payload false to be sent
    });
  });

  it('should process input data correctly', done => {
    helper.load([testNode, webioNode], getTestFlow('', 1), () => {
      const node = helper.getNode('testNode');
      const emitter = helper.getNode('webio1').emitter;

      const setData = [];
      emitter.addListener('webioSet', (type, number, value) => {
        setData.push({ type, number, value });
      });

      node.receive({}); // empty message -> expect warning
      node.warn.callCount.should.equal(1);

      node.receive({ payload: true }); // valid message -> no warning, but webioSet message
      node.warn.callCount.should.equal(1);
      const expect = JSON.stringify([{ type: 'digitalout', number: 1, value: true }]);
      JSON.stringify(setData).should.equal(expect);

      emitter.emit('webioLabels', {}); // set isValidClamp to false
      node.receive({ payload: true }); // valid message, but invalid clamp -> expect warning
      node.warn.callCount.should.equal(2);

      done();
    });
  });

  it('should pass on custom clamp labels', done => {
    helper.load([testNode, webioNode], getTestFlow(null, 3), () => {
      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ payload: true });
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
      emitter.emit('webioGet', 'output', 8, STATUS.OK); // do not expect clampData (mask = 8 -> payload true)

      data[portinfoType2] = { 3: 'foo bar' }; // portinfoType2 should still override data
      emitter.emit('webioLabels', data); // expect retriggered output message

      emitter.emit('webioLabels', {}); // expect retriggered output message
    });
  });

  it('should handle invalid webio information properly', done => {
    helper.load([testNode, webioNode], getTestFlow(), () => {
      const emitter = helper.getNode('webio1').emitter;

      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ topic: 'Digital OUT', payload: null, clampName: 0 });
        switch (++msgCount) {
          case 1:
            emitter.emit('webioGet', 'invalidtype', 1, STATUS.OK); // -> invalid type -> don't do anything (no output message)
            emitter.emit('webioLabels', {}); // set isValidClamp to false (will resend payload null)
            break;
          case 2:
            emitter.emit('webioGet', 'invalidtype', 1, STATUS.OK); // -> error 'invalid clamp' (no output message)
            done();
            break;
        }
      });

      emitter.emit('webioGet', 'output', 1, 'unknown_status'); // -> error 'unknown status' (send payload null)
    });
  });
});
