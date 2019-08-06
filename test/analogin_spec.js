/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const analogInNode = require("../src/analogin.js");

helper.init(require.resolve('node-red'));

describe('Analog IN Node', function () {

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
  });

  it('should be loaded', function (done) {
    const flow = [{ id: "n1", type: "Analog IN", name: "Demo Analog IN" }];
    helper.load(analogInNode, flow, function () {
      const n1 = helper.getNode("n1");
      n1.should.have.property('name', 'Demo Analog IN');
      done();
    });
  });
});