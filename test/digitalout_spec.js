/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const http = require('http');
const testNode = require("../src/digitalout.js");
const webioNode = require('../src/webio.js');
const { STATUS } = require('../src/util/status');

const portinfoType = '3';
const portinfoType2 = '5';
const getTestFlow = (nodeName, clampNumber) => {
  return [
    { id: 'helperNode', type: 'helper' },
    { id: 'testNode', type: 'Digital OUT', name: nodeName, webio: 'webio1', number: (clampNumber || 0), wires: [['helperNode']] },
    { id: 'webio1', type: 'Web-IO', host: '127.0.0.1', port: '8008', protocol: 'http' }
  ];
};

helper.init(require.resolve('node-red'));

describe('Digital OUT Node', () => {
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
          default:
            done(new Error('Unexpected input message', msg));
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

      let setData = [];
      emitter.addListener('webioSet', (type, number, value) => {
        setData.push({ type, number, value });
      });

      const testData = [
        [{}, []], // empty message -> expect warning
        [{ payload: true }, [{ type: 'digitalout', number: 1, value: true }]],
        [{ payload: 'true' }, [{ type: 'digitalout', number: 1, value: true }]],
        [{ payload: 1 }, [{ type: 'digitalout', number: 1, value: true }]],
        [{ payload: '1' }, [{ type: 'digitalout', number: 1, value: true }]],
        [{ payload: 'on' }, [{ type: 'digitalout', number: 1, value: true }]],
        [{ payload: false }, [{ type: 'digitalout', number: 1, value: false }]],
        [{ payload: 'false' }, [{ type: 'digitalout', number: 1, value: false }]],
        [{ payload: 0 }, [{ type: 'digitalout', number: 1, value: false }]],
        [{ payload: '0' }, [{ type: 'digitalout', number: 1, value: false }]],
        [{ payload: 'off' }, [{ type: 'digitalout', number: 1, value: false }]],
        // special handling: set isValidClamp to false
        [{ payload: true }, []], // valid message, but invalid clamp -> expect warning
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
          default:
            done(new Error('Unexpected input message', msg));
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
          default:
            done(new Error('Unexpected input message', msg));
            break;
        }
      });

      emitter.emit('webioGet', 'output', 1, 'unknown_status'); // -> error 'unknown status' (send payload null)
    });
  });
});
