/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const http = require('http');
const testNode = require("../src/digitalcounter.js");
const webioNode = require('../src/webio.js');
const { STATUS } = require('../src/util/status');

const portinfoType = '4';
const getTestFlow = (nodeName, clampNumber) => {
  return [
    { id: 'helperNode', type: 'helper' },
    { id: 'testNode', type: 'Counter', name: nodeName, webio: 'webio1', number: (clampNumber || 0), wires: [['helperNode']] },
    { id: 'webio1', type: 'Web-IO', host: '127.0.0.1', port: '8008', protocol: 'http' }
  ];
};

helper.init(require.resolve('node-red'));

describe('Counter Node', () => {
  let webioServer;

  beforeEach(done => {
    // simulate webio
    webioServer = http.createServer((req, res) => {
      // do not react to http requests at all to prevent http errors from
      // interfering (test should be completed within http request timeout)
      // blame/TODO: find a better solution for that
    }).listen(8008, () => helper.startServer(done));
  });

  afterEach(done => {
    helper.unload().then(() => {
      helper.stopServer(() => {
        webioServer.close(() => {
          done();
        });
      });
    });
  });

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
          default:
            done(new Error('Unexpected input message', msg));
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

      const testData = [
        [{}, []], // empty message -> expect warning
        [{ payload: '42' }, [{ type: 'digitalcounter', number: 1, value: 42 }]],
        [{ payload: '12.34' }, [{ type: 'digitalcounter', number: 1, value: 12.34 }]],
        [{ payload: '12,34' }, [{ type: 'digitalcounter', number: 1, value: 12.34 }]],
        [{ payload: 42 }, [{ type: 'digitalcounter', number: 1, value: 42 }]],
        [{ payload: -1.2 }, [{ type: 'digitalcounter', number: 1, value: -1.2 }]],
        // special handling: set isValidClamp to false
        [{ payload: 42.73 }, []], // valid message, but invalid clamp -> expect warning
      ];

      let testIndex = 0;
      node.on('input', msg => {
        // evaluate test result
        const expectedData = testData[testIndex][1];
        JSON.stringify(setData).should.equal(JSON.stringify(expectedData));
        node.warn.callCount.should.equal(expectedData.length ? 0 : 1);

        // special handling
        if (testIndex === testData.length - 2) {
          emitter.emit('webioLabels', {}); // set isValidClamp to false
        }

        // next test
        if (++testIndex < testData.length) {
          setData = [];
          node.warn.resetHistory();
          node.receive(testData[testIndex][0]);
        } else {
          done();
        }
      });

      node.receive(testData[testIndex][0]); // initial test
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
          default:
            done(new Error('Unexpected input message', msg));
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
          default:
            done(new Error('Unexpected input message', msg));
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
