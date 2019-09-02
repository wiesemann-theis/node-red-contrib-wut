/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const analogOutNode = require("../src/analogout.js");

helper.init(require.resolve('node-red'));

describe('Analog OUT Node', function () {

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(() => helper.stopServer(done));
  });

  it('should be loaded', function (done) {
    const flow = [{ id: "n1", type: "Analog OUT", name: "Demo Analog OUT" }];
    helper.load(analogOutNode, flow, function () {
      const n1 = helper.getNode("n1");
      n1.should.have.property('name', 'Demo Analog OUT');
      done();
    });
  });
});