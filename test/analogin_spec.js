/* eslint-env mocha */
const helper = require('node-red-node-test-helper');
const testNode = require('../src/analogin.js');
const webioNode = require('../src/webio.js');
const { STATUS } = require('../src/util/status');

const portinfoType = 1;
const getTestFlow = (nodeName, clampNumber) => {
  return [
    { id: 'helperNode', type: 'helper' },
    { id: 'testNode', type: 'Analog IN', name: nodeName, webio: 'webio1', number: (clampNumber || 1), wires: [['helperNode']] },
    { id: 'webio1', type: 'Web-IO', host: 'i n va l i d', port: '80', protocol: 'http' }
  ];
}

helper.init(require.resolve('node-red'));

describe('Analog IN Node', () => {

  beforeEach(done => { helper.startServer(done); });

  afterEach(done => { helper.unload().then(() => helper.stopServer(done)); });

  it('should be loaded', done => {
    const flow = [{ id: 'testNode', type: 'Analog IN', name: 'DEMO Analog IN' }];
    helper.load(testNode, flow, () => {
      helper.getNode('testNode').should.have.property('name', 'DEMO Analog IN');
      done();
    });
  });

  it('should generate output messages when data is received', done => {
    const nodeName = 'Demo Analog IN';
    helper.load([testNode, webioNode], getTestFlow(nodeName, 2), () => {
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ topic: nodeName, payload: 45.3, unit: '%', clampName: 2 });
        done();
      });

      helper.getNode('webio1').emitter.emit('webioGet', 'single', ['23,4°C', '45,3%'], STATUS.OK); // expect message to be sent
    });
  });

  it('should pass on additional analog clamp data', done => {
    helper.load([testNode, webioNode], getTestFlow(null, 2), () => {
      let wasCalled = false;
      helper.getNode('helperNode').on('input', msg => {
        if (!wasCalled) {
          wasCalled = true;
          msg.should.have.properties({ payload: 45.3, unit: '%' });
        } else {
          msg.should.have.properties({ payload: 54.7, unit: 'customUnit', min: 42, max: 73 });
          done();
        }
      });

      const emitter = helper.getNode('webio1').emitter;
      let data = {};
      emitter.emit('webioData', data);
      emitter.emit('webioGet', 'single', ['23,4°C', '45,3%'], STATUS.OK); // do not expect clampData

      data[portinfoType] = { 2: { min: 42, max: 73, unit: 'customUnit' } };
      emitter.emit('webioData', data);
      emitter.emit('webioGet', 'single', ['23,4°C', '54,7%'], STATUS.OK); // expect clampData 
    });
  });

  it('should pass on custom clamp labels', done => {
    helper.load([testNode, webioNode], getTestFlow(null, 3), () => {
      let msgCount = 0;
      helper.getNode('helperNode').on('input', msg => {
        msg.should.have.properties({ payload: 34.5, unit: '°C' });
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
      emitter.emit('webioGet', 'single', ['12,3°C', '23,4°C', '34,5°C'], STATUS.OK); // do not expect clampData

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
        msg.should.have.properties({ topic: 'Analog IN', payload: null, unit: '', clampName: 1 });
        switch (++msgCount) {
          case 1:
            emitter.emit('webioGet', 'single', null, STATUS.OK); // -> error 'invalid clamp' (no output message)
            emitter.emit('webioGet', 'single', [], STATUS.OK); // -> error 'invalid clamp' (no output message)
            emitter.emit('webioGet', 'single', ['abc'], STATUS.OK); // -> error 'no value' (no output message)
            emitter.emit('webioGet', 'invalidtype', ['23,4°C'], STATUS.OK); // -> invalid type -> don't do anything (no output message)

            emitter.emit('webioLabels', {}); // set isValidClamp to false (will resend payload null)
            break;
          case 2:
            emitter.emit('webioGet', 'invalidtype', ['23,4°C'], STATUS.OK); // -> error 'invalid clamp' (no output message)
            done();
            break;
        }
      });

      emitter.emit('webioGet', 'single', ['23,4°C'], 'unknown_status'); // -> error 'unknown status' (send payload null)
    });
  });
});