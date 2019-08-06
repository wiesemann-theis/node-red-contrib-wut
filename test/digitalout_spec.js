/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const digitalOutNode = require("../src/digitalout.js");

helper.init(require.resolve('node-red'));

describe('Digital OUT Node', function () {

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
  });

  it('should be loaded', function (done) {
    const flow = [{ id: "n1", type: "Digital OUT", name: "Demo Digital OUT" }];
    helper.load(digitalOutNode, flow, function () {
      const n1 = helper.getNode("n1");
      n1.should.have.property('name', 'Demo Digital OUT');
      done();
    });
  });
});