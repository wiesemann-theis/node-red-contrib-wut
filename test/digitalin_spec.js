/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const digitalInNode = require("../src/digitalin.js");

helper.init(require.resolve('node-red'));

describe('Digital IN Node', function () {

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(() => helper.stopServer(done));
  });

  it('should be loaded', function (done) {
    const flow = [{ id: "n1", type: "Digital IN", name: "Demo Digital IN" }];
    helper.load(digitalInNode, flow, function () {
      const n1 = helper.getNode("n1");
      n1.should.have.property('name', 'Demo Digital IN');
      done();
    });
  });
});