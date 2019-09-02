/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const comserverNode = require("../src/comserver.js");

helper.init(require.resolve('node-red'));

describe('Com-Server Node', function () {

  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload().then(() => helper.stopServer(done));
  });

  it('should be loaded', function (done) {
    const flow = [{ id: "n1", type: "Com-Server", name: "Demo Com-Server" }];
    helper.load(comserverNode, flow, function () {
      const n1 = helper.getNode("n1");
      n1.should.have.property('name', 'Demo Com-Server');
      done();
    });
  });
});