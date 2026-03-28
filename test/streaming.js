'use strict';

const should = require('should');
const CometDClient = require('../lib/cometd');
const FDCStream = require('../lib/fdcstream');
const MockCometDServer = require('./mock/cometd-server');

const PORT = 34444;

describe('CometD Client', function () {
  this.timeout(10000);

  let server;

  before(async () => {
    server = new MockCometDServer(PORT);
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  describe('#handshake (long-polling)', () => {
    it('should negotiate a clientId via handshake', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();
      should.exist(client._clientId);
      client._clientId.should.startWith('mock-client-');
      client._transport.should.equal('long-polling');
      await client.disconnect();
    });

    it('should prefer websocket when server supports it', async () => {
      server.setSupportedTypes(['long-polling', 'websocket']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();
      client._transport.should.equal('websocket');
      await client.disconnect();
    });
  });

  describe('#setHeader', () => {
    it('should include custom headers in requests', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      client.setHeader('Authorization', 'Bearer test-token');
      await client.handshake();
      should.exist(client._clientId);
      await client.disconnect();
    });
  });

  describe('#addExtension', () => {
    it('should apply outgoing extensions to messages', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);

      let outgoingCalled = false;
      client.addExtension({
        outgoing: (msg, cb) => {
          if (msg.channel === '/meta/subscribe') {
            outgoingCalled = true;
            msg.ext = msg.ext || {};
            msg.ext.replay = { '/topic/Test': -1 };
          }
          cb(msg);
        },
        incoming: (msg, cb) => cb(msg),
      });

      await client.handshake();
      await client.connect();

      const sub = await client.subscribe('/topic/Test', () => {});
      outgoingCalled.should.be.true();

      sub.cancel();
      await client.disconnect();
    });
  });

  describe('#subscribe and event delivery (long-polling)', () => {
    it('should receive events pushed to a subscribed topic', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();
      await client.connect();

      const received = [];
      await client.subscribe('/topic/TestTopic', (data) => {
        received.push(data);
      });

      // Push an event from the mock server
      server.pushEvent('/topic/TestTopic', { id: '001', name: 'Test' });

      // Wait for the event to be delivered
      await new Promise((resolve) => setTimeout(resolve, 200));

      received.length.should.equal(1);
      received[0].id.should.equal('001');
      received[0].name.should.equal('Test');

      await client.disconnect();
    });

    it('should not receive events after unsubscribe', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();
      await client.connect();

      const received = [];
      const sub = await client.subscribe('/topic/UnsubTest', (data) => {
        received.push(data);
      });

      await sub.cancel();

      server.pushEvent('/topic/UnsubTest', { id: '002' });
      await new Promise((resolve) => setTimeout(resolve, 200));

      received.length.should.equal(0);

      await client.disconnect();
    });
  });

  describe('#disconnect', () => {
    it('should clean up resources on disconnect', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();
      await client.connect();

      await client.subscribe('/topic/DisconnectTest', () => {});
      client._subscriptions.size.should.equal(1);

      await client.disconnect();
      should.not.exist(client._clientId);
      client._subscriptions.size.should.equal(0);
    });
  });

  describe('transport events', () => {
    it('should emit transport:up when connected', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();

      let transportUp = false;
      client.on('transport:up', () => { transportUp = true; });

      await client.connect();
      transportUp.should.be.true();

      await client.disconnect();
    });
  });

  describe('#subscribe error handling', () => {
    it('should throw on subscribe with invalid clientId', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      // Don't handshake — no valid clientId
      client._clientId = 'invalid-client';
      client._connected = true;
      client._transport = 'long-polling';

      try {
        await client.subscribe('/topic/Fail', () => {});
        throw new Error('should have thrown');
      } catch (err) {
        err.message.should.match(/subscribe failed/);
      }

      client._connected = false;
    });
  });

  describe('handshake error', () => {
    it('should throw when server is unreachable', async () => {
      const client = new CometDClient('http://localhost:19999/cometd');
      try {
        await client.handshake();
        throw new Error('should have thrown');
      } catch (err) {
        should.exist(err);
      }
    });
  });

  describe('replay extension', () => {
    it('should inject replay IDs on subscribe messages', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);

      // Add replay extension like fdcstream does
      const replayMap = { '/topic/Replay': -2 };
      client.addExtension({
        incoming: (msg, cb) => cb(msg),
        outgoing: (msg, cb) => {
          if (msg.channel === '/meta/subscribe') {
            msg.ext = msg.ext || {};
            msg.ext.replay = replayMap;
          }
          cb(msg);
        },
      });

      // Capture extension runs after replay extension
      const capturedExt = [];
      client.addExtension({
        outgoing: (msg, cb) => {
          if (msg.ext) capturedExt.push(msg.ext);
          cb(msg);
        },
      });

      await client.handshake();
      await client.connect();
      await client.subscribe('/topic/Replay', () => {});

      capturedExt.some((ext) => ext.replay && ext.replay['/topic/Replay'] === -2)
        .should.be.true();

      await client.disconnect();
    });
  });

  describe('multiple subscriptions', () => {
    it('should deliver events to the correct subscription', async () => {
      server.setSupportedTypes(['long-polling']);
      const client = new CometDClient(server.endpoint);
      await client.handshake();
      await client.connect();

      const receivedA = [];
      const receivedB = [];

      await client.subscribe('/topic/A', (data) => receivedA.push(data));
      await client.subscribe('/topic/B', (data) => receivedB.push(data));

      server.pushEvent('/topic/A', { val: 'a1' });
      await new Promise((resolve) => setTimeout(resolve, 200));

      server.pushEvent('/topic/B', { val: 'b1' });
      await new Promise((resolve) => setTimeout(resolve, 200));

      receivedA.length.should.equal(1);
      receivedA[0].val.should.equal('a1');
      receivedB.length.should.equal(1);
      receivedB[0].val.should.equal('b1');

      await client.disconnect();
    });
  });
});

describe('FDCStream (fdcstream.js integration)', function () {
  this.timeout(10000);

  let server;

  before(async () => {
    server = new MockCometDServer(34445);
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  const mockOAuth = {
    instance_url: 'http://localhost:34445',
    access_token: 'mock-access-token',
  };

  describe('Client', () => {
    it('should create a stream client and emit connect', (done) => {
      server.setSupportedTypes(['long-polling']);
      const client = new FDCStream.Client({
        oauth: mockOAuth,
        apiVersion: 'v58.0',
      });

      client.on('connect', () => {
        should.exist(client._cometd);
        client.disconnect();
        done();
      });
    });
  });

  describe('Subscription', () => {
    it('should subscribe and receive events', (done) => {
      server.setSupportedTypes(['long-polling']);
      const client = new FDCStream.Client({
        oauth: mockOAuth,
        apiVersion: 'v58.0',
      });

      client.on('connect', () => {
        const sub = client.subscribe({ topic: '/topic/FDCTest' });

        sub.on('data', (data) => {
          data.msg.should.equal('hello');
          sub.cancel();
          client.disconnect();
          done();
        });

        sub.on('connect', () => {
          server.pushEvent('/topic/FDCTest', { msg: 'hello' });
        });
      });
    });

    it('should support replay IDs', (done) => {
      server.setSupportedTypes(['long-polling']);
      const client = new FDCStream.Client({
        oauth: mockOAuth,
        apiVersion: 'v58.0',
      });

      client.on('connect', () => {
        const sub = client.subscribe({
          topic: '/topic/ReplayTest',
          replayId: -2,
        });

        sub.on('connect', () => {
          // Replay ID was registered
          client._replayFromMap['/topic/ReplayTest'].should.equal(-2);
          sub.cancel();
          client.disconnect();
          done();
        });
      });
    });
  });
});
