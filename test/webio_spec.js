/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const webioNode = require("../src/webio.js");

helper.init(require.resolve('node-red'));

describe('Web-IO Node', function () {

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
  });

  it('should be loaded', function (done) {
    const flow = [{ id: "n1", type: "Web-IO", name: "Demo Web-IO" }];
    helper.load(webioNode, flow, function () {
      const n1 = helper.getNode("n1");
      n1.should.have.property('name', 'Demo Web-IO');
      done();
    });
  });
});