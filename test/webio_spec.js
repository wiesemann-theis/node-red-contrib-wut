/* eslint-env mocha */
const helper = require('node-red-node-test-helper');
const webioNode = require('../src/webio.js');
const http = require('http');

helper.init(require.resolve('node-red'));

describe('Web-IO Node', () => {

  let demoServer;
  let httpRequestCallback = () => { };

  const demoHost = '127.0.0.1';
  const demoPort = 8008;

  beforeEach(done => {
    httpRequestCallback = (req, res) => {
      res.writeHead(500);
      res.end();
    };
    demoServer = http.createServer((req, res) => httpRequestCallback(req, res)).listen(demoPort);
    helper.startServer(done);
  });

  afterEach(done => {
    helper.unload().then(() => {
      helper.stopServer(() => {
        demoServer.close(() => {
          done();
        });
      });
    });
  });

  it('should be loaded', done => {
    const flow = [{ id: 'n1', type: 'Web-IO', name: 'Demo Web-IO' }];
    helper.load(webioNode, flow, () => {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Demo Web-IO');
      done();
    });
  });

  it('should be loaded', done => {
    const flow = [{ id: 'n1', type: 'Web-IO', name: 'Demo Web-IO', host: demoHost, port: demoPort, protocol: 'http' }];

    httpRequestCallback = (req, res) => {
      req.url.should.equal('/portinfo');
      res.writeHead(200);
      res.end();
      done();
    };

    helper.load(webioNode, flow, () => {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'Demo Web-IO');

      // n1.emitter.addListener('webioLabels', data => {
      //   console.log('webioLabels', { data });
      // });
    });
  });
});
