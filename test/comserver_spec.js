/* eslint-env mocha */
const helper = require("node-red-node-test-helper");
const testNode = require("../src/comserver.js");
const net = require('net');

helper.init(require.resolve('node-red'));

describe('Com-Server Node', () => {

  let tcpServer;
  let configServer;
  let testSocket;

  const demoHost = '127.0.0.1';
  const demoPort = 8008;

  beforeEach(done => {
    testSocket = null;
    configServer = null;
    tcpServer = net.createServer(socket => { testSocket = socket; });
    tcpServer.maxConnections = 1; // allow only one connection
    tcpServer.listen(demoPort, demoHost);
    helper.startServer(done);
  });

  afterEach(done => {
    helper.unload().then(() => {
      helper.stopServer(() => {
        tcpServer.close(() => {
          testSocket = null;
          if (configServer) {
            configServer.close(() => { done(); });
          } else {
            done();
          }
        });
      });
    });
  });

  it('should be loaded', done => {
    const flow = [{ id: 'n1', type: 'Com-Server', name: 'DEMO Com-Server' }];
    helper.load(testNode, flow, () => {
      helper.getNode('n1').should.have.property('name', 'DEMO Com-Server');
      done();
    });
  });

  it('should connect to the configured tcp server', done => {
    const flow = [{ id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort }];

    helper.load(testNode, flow, () => {
      setTimeout(() => {
        const args = helper.getNode('n1').status.args;
        args[args.length - 1][0].text.should.equal('status.connected');
        done();
      }, 10); // short timeout for connection establishment
    });
  });

  it('should generate output messages when data is received', done => {
    const nodeName = 'Demo Node';
    const testMsg = 'Test, Test, 123, äÖüß!';
    const flow = [
      { id: 'h1', type: 'helper' },
      { id: 'n1', type: 'Com-Server', name: nodeName, host: demoHost, port: demoPort, wires: [['h1']] }
    ];

    helper.load(testNode, flow, () => {
      setTimeout(() => {
        if (testSocket) {
          helper.getNode('h1').on('input', msg => {
            msg.should.have.properties({ topic: nodeName, payload: testMsg });
            done();
          });
          testSocket.write(testMsg);
        } else {
          throw new Error('TCP connection not established.');
        }
      }, 10); // short timeout for connection establishment
    });
  });

  it('should be able to group received data based on a delimiter', done => {
    const nodeName = 'Demo äÖüß!';
    const flow = [
      { id: 'h1', type: 'helper' },
      { id: 'n1', type: 'Com-Server', name: nodeName, host: demoHost, port: demoPort, delimiter: '\n', wires: [['h1']] }
    ];

    helper.load(testNode, flow, () => {
      setTimeout(() => {
        if (testSocket) {
          // first send some messages
          testSocket.write('abc');
          testSocket.write('d\nef');
          testSocket.write('gh\nijkl\n');
          testSocket.write('mno');
          testSocket.write('p\nqrst');

          setTimeout(() => {
            const n1 = helper.getNode('n1');
            const args = n1.send.args;
            args.length.should.equal(4); // expect four complete blocks
            args[0][0].should.have.properties({ topic: nodeName, payload: 'abcd' });
            args[1][0].should.have.properties({ topic: nodeName, payload: 'efgh' });
            args[2][0].should.have.properties({ topic: nodeName, payload: 'ijkl' });
            args[3][0].should.have.properties({ topic: nodeName, payload: 'mnop' });

            testSocket.destroy(); // close connection

            setTimeout(() => {
              const args2 = n1.send.args;
              args2.length.should.equal(5); // expect one additional message!
              args2[4][0].should.have.properties({ topic: nodeName, payload: 'qrst' });
              done();
            }, 10);
          }, 5);
        } else {
          throw new Error('TCP connection not established.');
        }
      }, 5); // short timeout for connection establishment
    });
  });

  it('should be able to send delimiter itself', done => {
    const nodeName = 'Demo äÖüß!';
    const flow = [
      { id: 'h1', type: 'helper' },
      { id: 'n1', type: 'Com-Server', name: nodeName, host: demoHost, port: demoPort, delimiter: '\n', sendDelimiter: true, wires: [['h1']] }
    ];

    helper.load(testNode, flow, () => {
      setTimeout(() => {
        if (testSocket) {
          testSocket.write('abc');
          testSocket.write('d\nef');
          testSocket.write('gh\nijkl');

          setTimeout(() => {
            const args = helper.getNode('n1').send.args;
            args.length.should.equal(2); // expect two complete blocks
            args[0][0].should.have.properties({ topic: nodeName, payload: 'abcd\n' });
            args[1][0].should.have.properties({ topic: nodeName, payload: 'efgh\n' });
            // NOTE: another message is sent when socket is closed, but that is not tested here
            done();
          }, 5);
        } else {
          throw new Error('TCP connection not established.');
        }
      }, 5); // short timeout for connection establishment
    });
  });

  it('should be able to process received data as buffer object', done => {
    const nodeName = 'Demo Node';
    const testMsg = 'Test, Test, 123, äÖüß!';
    const flow = [
      { id: 'h1', type: 'helper' },
      { id: 'n1', type: 'Com-Server', name: nodeName, host: demoHost, port: demoPort, format: 'buffer', wires: [['h1']] }
    ];

    helper.load(testNode, flow, () => {
      setTimeout(() => {
        if (testSocket) {
          helper.getNode('h1').on('input', msg => {
            Buffer.isBuffer(msg.payload).should.equal(true);
            msg.payload.toString().should.equal(testMsg);
            done();
          });
          testSocket.write(Buffer.from(testMsg));
        } else {
          throw new Error('TCP connection not established.');
        }
      }, 10); // short timeout for connection establishment
    });
  });

  it('should process input data correctly', done => {
    const testMsg = 'Test, Test, 123, äÖüß!';
    const flow = [{ id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort }];

    helper.load(testNode, flow, () => {
      setTimeout(() => {
        if (testSocket) {
          const n1 = helper.getNode('n1');
          let wasCalled = false;
          testSocket.on('data', data => {
            data.toString().should.equal(testMsg);
            if (wasCalled) {
              done();
            } else {
              wasCalled = true;
              n1.receive({ payload: Buffer.from(testMsg) }); // valid message with Buffer object
            }
          });
          n1.receive({}); // empty message -> expect warning
          n1.warn.callCount.should.equal(1);

          n1.receive({ payload: testMsg }); // valid message with string -> no warning, but webioSet message
          n1.warn.callCount.should.equal(1);
        } else {
          throw new Error('TCP connection not established.');
        }
      }, 10); // short timeout for connection establishment
    });
  });

  it('should automatically reconnect when connection is lost', done => {
    const flow = [{ id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort }];

    helper.settings({ socketReconnectTime: 1 }); // reconnect immediately
    helper.load(testNode, flow, () => {
      setTimeout(() => {
        if (testSocket) {
          testSocket.destroy(); // close connection
          setTimeout(() => {
            const n1 = helper.getNode('n1');
            const args = n1.status.args;
            args.length.should.equal(5);
            args[args.length - 3][0].text.should.equal('status.disconnected');
            args[args.length - 1][0].text.should.equal('status.connected');

            n1.error.callCount.should.equal(1);

            done();
          }, 15);  // short timeout for connection re-establishment
        } else {
          throw new Error('TCP connection not established.');
        }
      }, 5); // short timeout for connection establishment
    });
  });

  const configServerSetupHelper = (onDataCallback, flow) => {
    flow = flow || [{ id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort, setuart: true }];
    configServer = net.createServer(socket => { socket.on('data', data => onDataCallback(socket, data)); });
    configServer.listen(demoPort + 1094, demoHost);
    helper.load(testNode, flow, () => { });
  };

  it('should set up uart parameters', done => {
    let wasCalled = false;
    const onDataCallback = (socket, data) => {
      if (wasCalled) {
        data[9].should.equal(0xE3); // default parameter baudrate = 3
        data[10].should.equal(0x03); // default parameters: parity = 0, stopbits = 1, databits = 8
        data[24].should.equal(0xF1); // default parameter eepromUpdate = false
        socket.write(data); // just mirror response as confirmation

        setTimeout(() => {
          helper.getNode('n1').log.lastCall.args[0].should.equal('logging.config.success');
          done();
        }, 5);
      } else {
        wasCalled = true;
        data.toString().should.equal('\u0000');
        const sendData = [0];
        for (let i = 0; i < 28; ++i) sendData.push(0xFF);
        sendData.push(0);
        socket.write(Buffer.from(sendData));
      }
    };

    configServerSetupHelper(onDataCallback);
  });

  it('should set up custom uart parameters', done => {
    const flow = [{
      id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort, setuart: true,
      baudrate: 12, parity: 5, stopbits: 2, databits: 5, permupdate: true
    }];

    let wasCalled = false;
    const onDataCallback = (socket, data) => {
      if (wasCalled) {
        data[9].should.equal(0xEC); // custom parameter baudrate = 12
        data[10].should.equal(0x2C); // custom parameters: parity = 5, stopbits = 2, databits = 5
        data[24].should.equal(0xF2); // custom  parameter eepromUpdate = true
        socket.write(data); // just mirror response as confirmation

        setTimeout(() => {
          helper.getNode('n1').log.lastCall.args[0].should.equal('logging.config.success');
          done();
        }, 5);
      } else {
        wasCalled = true;
        data.toString().should.equal('\u0000');
        const sendData = [0];
        for (let i = 0; i < 28; ++i) sendData.push(0xFF);
        sendData.push(0);
        socket.write(Buffer.from(sendData));
      }
    };

    configServerSetupHelper(onDataCallback, flow);
  });

  it('should warn if seting up uart parameters failed (I)', done => {
    let wasCalled = false;
    const onDataCallback = (socket, data) => {
      if (wasCalled) {
        data[10] += 1; // send wrong reponse
        socket.write(data);

        setTimeout(() => {
          helper.getNode('n1').warn.lastCall.args[0].should.equal('logging.config.invaliddata');
          done();
        }, 10);
      } else {
        wasCalled = true;
        data.toString().should.equal('\u0000');
        socket.write(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 0]));
      }
    };

    configServerSetupHelper(onDataCallback);
  });

  it('should warn if seting up uart parameters failed (II)', done => {
    const onDataCallback = (socket, data) => {
      data.toString().should.equal('\u0000');

      socket.write(Buffer.from([1, 2, 3])); // send wrong data format

      setTimeout(() => {
        helper.getNode('n1').warn.lastCall.args[0].should.equal('logging.config.unexpecteddata');
        done();
      }, 10);
    };

    configServerSetupHelper(onDataCallback);
  });

  it('should warn if seting up uart parameters failed (III)', done => {
    const onDataCallback = (socket, data) => {
      data.toString().should.equal('\u0000');

      socket.write(Buffer.from('PaSSwd?\u0000')); // send password error response

      setTimeout(() => {
        helper.getNode('n1').log.lastCall.args[0].should.equal('logging.config.passworderror');
        done();
      }, 10);
    };

    configServerSetupHelper(onDataCallback);
  });

  it('should handle connection rejection', done => {
    // NOTE: this test does not trigger 'error' event but 'connect' + 'close'
    const flow = [{ id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort }];

    // block server with one dummy connection
    const testClient = net.connect(demoPort, demoHost);
    testClient.on('connect', () => {
      helper.load(testNode, flow, () => {
        setTimeout(() => {
          helper.getNode('n1').error.args.length.should.be.aboveOrEqual(1);
          testClient.destroy();
          done();
        }, 10);
      });
    });
  });

  // TODO: this test runs fine locally but fails on travis-ci.com -> fix that
  // it('should handle connection rejection (config client)', done => {
  //   const flow = [{ id: 'n1', type: 'Com-Server', name: null, host: demoHost, port: demoPort, setuart: true }];

  //   configServer = net.createServer();
  //   configServer.maxConnections = 1; // allow only one connection
  //   configServer.listen(demoPort + 1094, demoHost);

  //   // block server with one dummy connection
  //   const testClient = net.connect(demoPort + 1094, demoHost);
  //   testClient.on('connect', () => {
  //     helper.load(testNode, flow, () => {
  //       setTimeout(() => {
  //         helper.getNode('n1').error.args.length.should.be.aboveOrEqual(1);
  //         testClient.destroy();
  //         done();
  //       }, 50);
  //     });
  //   });
  // });

});
