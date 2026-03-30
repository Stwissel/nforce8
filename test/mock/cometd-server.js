'use strict';

const http = require('http');

const DEFAULT_PORT = 34444;

/**
 * Mock CometD/Bayeux server for testing the CometD client.
 * Supports both long-polling (HTTP POST) and WebSocket transports.
 */
class MockCometDServer {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.server = null;
    this.wss = null;
    this._clientIdCounter = 0;
    this._clients = new Map(); // clientId → { subscriptions: Set, ws: WebSocket|null }
    this._pendingConnects = new Map(); // clientId → { res, timer }
    this._advice = { reconnect: 'retry', interval: 0, timeout: 5000 };
    this._supportedTypes = ['long-polling', 'websocket'];
    this._wsClients = new Set();
  }

  /**
   * Start the mock server.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleHttp(req, res));

      // WebSocket upgrade handling
      this.server.on('upgrade', (req, socket, head) => {
        this._handleWsUpgrade(req, socket, head);
      });

      this.server.listen(this.port, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /**
   * Stop the mock server and clean up.
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      // Clear any pending long-poll connections
      for (const [, pending] of this._pendingConnects) {
        clearTimeout(pending.timer);
        pending.res.end(JSON.stringify([{
          channel: '/meta/connect',
          successful: false,
          error: 'server shutting down'
        }]));
      }
      this._pendingConnects.clear();

      // Close WebSocket connections
      for (const ws of this._wsClients) {
        ws.close();
      }
      this._wsClients.clear();

      if (this.server) {
        this.server.closeAllConnections();
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** @returns {string} The base endpoint URL. */
  get endpoint() {
    return `http://localhost:${this.port}/cometd`;
  }

  /**
   * Push an event to all clients subscribed to a topic.
   * @param {string} topic - Channel path.
   * @param {object} data - Event data payload.
   */
  pushEvent(topic, data) {
    const eventMsg = {
      channel: topic,
      data: data,
    };

    // Push to pending long-poll connections
    for (const [clientId, pending] of this._pendingConnects) {
      const client = this._clients.get(clientId);
      if (client && client.subscriptions.has(topic)) {
        clearTimeout(pending.timer);
        this._pendingConnects.delete(clientId);

        const connectResponse = {
          channel: '/meta/connect',
          clientId: clientId,
          successful: true,
          advice: this._advice,
        };
        pending.res.writeHead(200, { 'Content-Type': 'application/json' });
        pending.res.end(JSON.stringify([connectResponse, eventMsg]));
      }
    }

    // Push to WebSocket clients
    for (const [, client] of this._clients) {
      if (client.subscriptions.has(topic) && client.ws) {
        client.ws.send(JSON.stringify([eventMsg]));
      }
    }
  }

  /**
   * Override the server advice sent in handshake/connect responses.
   * @param {object} advice
   */
  setAdvice(advice) {
    Object.assign(this._advice, advice);
  }

  /**
   * Set the supported connection types returned in handshake.
   * @param {string[]} types
   */
  setSupportedTypes(types) {
    this._supportedTypes = types;
  }

  /**
   * Handle an incoming HTTP request (Bayeux over long-polling).
   */
  _handleHttp(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let messages;
      try {
        messages = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
        return;
      }

      if (!Array.isArray(messages)) messages = [messages];

      const responses = [];
      let holdForConnect = false;

      for (const msg of messages) {
        const result = this._processMessage(msg);
        if (result === 'hold') {
          // Long-poll: hold the connection until we have data
          holdForConnect = true;
          const clientId = msg.clientId;
          const timer = setTimeout(() => {
            this._pendingConnects.delete(clientId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([{
              channel: '/meta/connect',
              clientId: clientId,
              successful: true,
              advice: this._advice,
            }]));
          }, this._advice.timeout || 30000);
          this._pendingConnects.set(clientId, { res, timer });
        } else if (result) {
          responses.push(result);
        }
      }

      if (!holdForConnect && responses.length > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responses));
      }
    });
  }

  /**
   * Handle WebSocket upgrade.
   */
  _handleWsUpgrade(req, socket) {
    // Minimal WebSocket handshake
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC65C97B')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    // Create a minimal WebSocket wrapper over the raw socket
    const ws = this._createWsWrapper(socket);
    this._wsClients.add(ws);

    ws.on('message', (data) => {
      let messages;
      try {
        messages = JSON.parse(data);
      } catch {
        return;
      }
      if (!Array.isArray(messages)) messages = [messages];

      const responses = [];
      for (const msg of messages) {
        // Track which client this WebSocket belongs to
        if (msg.channel === '/meta/handshake' || (msg.clientId && this._clients.has(msg.clientId))) {
          const client = this._clients.get(msg.clientId);
          if (client) client.ws = ws;
        }

        const result = this._processMessage(msg);
        if (result === 'hold') {
          // For WebSocket, just wait — we'll push events when they arrive
          const clientId = msg.clientId;
          // Store a pending resolve
          this._pendingConnects.set(clientId, {
            res: {
              writeHead: () => {},
              end: (body) => ws.send(body),
            },
            timer: setTimeout(() => {
              this._pendingConnects.delete(clientId);
              ws.send(JSON.stringify([{
                channel: '/meta/connect',
                clientId: clientId,
                successful: true,
                advice: this._advice,
              }]));
            }, this._advice.timeout || 30000),
          });
        } else if (result) {
          responses.push(result);
        }
      }

      if (responses.length > 0) {
        ws.send(JSON.stringify(responses));
      }
    });

    ws.on('close', () => {
      this._wsClients.delete(ws);
    });
  }

  /**
   * Create a minimal WebSocket frame wrapper around a raw TCP socket.
   * Handles text frames only (opcode 0x1) — sufficient for CometD.
   * @param {net.Socket} socket
   * @returns {EventEmitter}
   */
  _createWsWrapper(socket) {
    const emitter = new (require('events').EventEmitter)();
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const secondByte = buffer[1];
        const masked = (secondByte & 0x80) !== 0;
        let payloadLen = secondByte & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buffer.length < 4) return;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) return;
          payloadLen = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }

        const maskSize = masked ? 4 : 0;
        const totalLen = offset + maskSize + payloadLen;
        if (buffer.length < totalLen) return;

        let payload = buffer.subarray(offset + maskSize, totalLen);
        if (masked) {
          const mask = buffer.subarray(offset, offset + maskSize);
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4];
          }
        }

        const opcode = buffer[0] & 0x0f;
        buffer = buffer.subarray(totalLen);

        if (opcode === 0x1) {
          emitter.emit('message', payload.toString('utf8'));
        } else if (opcode === 0x8) {
          emitter.emit('close');
          socket.end();
          return;
        }
      }
    });

    socket.on('close', () => emitter.emit('close'));
    socket.on('error', () => emitter.emit('close'));

    emitter.send = (data) => {
      if (socket.destroyed) return;
      const payload = Buffer.from(data, 'utf8');
      let header;
      if (payload.length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text
        header[1] = payload.length;
      } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      socket.write(Buffer.concat([header, payload]));
    };

    emitter.close = () => {
      if (!socket.destroyed) {
        const closeFrame = Buffer.alloc(2);
        closeFrame[0] = 0x88; // FIN + close
        closeFrame[1] = 0;
        socket.write(closeFrame);
        socket.end();
      }
    };

    return emitter;
  }

  /**
   * Process a single Bayeux message and return the response (or 'hold' for connect).
   * @param {object} msg - Bayeux message.
   * @returns {object|string|null} Response message, 'hold', or null.
   */
  _processMessage(msg) {
    switch (msg.channel) {
    case '/meta/handshake':
      return this._handleHandshake(msg);
    case '/meta/connect':
      return this._handleConnect(msg);
    case '/meta/subscribe':
      return this._handleSubscribe(msg);
    case '/meta/unsubscribe':
      return this._handleUnsubscribe(msg);
    case '/meta/disconnect':
      return this._handleDisconnect(msg);
    default:
      return null;
    }
  }

  _handleHandshake(msg) {
    const clientId = 'mock-client-' + (++this._clientIdCounter);
    this._clients.set(clientId, { subscriptions: new Set(), ws: null });

    return {
      channel: '/meta/handshake',
      version: '1.0',
      supportedConnectionTypes: this._supportedTypes,
      clientId: clientId,
      successful: true,
      id: msg.id,
      advice: this._advice,
    };
  }

  _handleConnect(msg) {
    if (!this._clients.has(msg.clientId)) {
      return {
        channel: '/meta/connect',
        successful: false,
        error: 'Unknown client',
        id: msg.id,
        advice: { reconnect: 'handshake' },
      };
    }
    // Hold the connection (long-poll behavior)
    return 'hold';
  }

  _handleSubscribe(msg) {
    const client = this._clients.get(msg.clientId);
    if (!client) {
      return {
        channel: '/meta/subscribe',
        successful: false,
        error: 'Unknown client',
        id: msg.id,
      };
    }
    client.subscriptions.add(msg.subscription);

    return {
      channel: '/meta/subscribe',
      clientId: msg.clientId,
      subscription: msg.subscription,
      successful: true,
      id: msg.id,
    };
  }

  _handleUnsubscribe(msg) {
    const client = this._clients.get(msg.clientId);
    if (client) {
      client.subscriptions.delete(msg.subscription);
    }

    return {
      channel: '/meta/unsubscribe',
      clientId: msg.clientId,
      subscription: msg.subscription,
      successful: true,
      id: msg.id,
    };
  }

  _handleDisconnect(msg) {
    this._clients.delete(msg.clientId);
    const pending = this._pendingConnects.get(msg.clientId);
    if (pending) {
      clearTimeout(pending.timer);
      this._pendingConnects.delete(msg.clientId);
    }

    return {
      channel: '/meta/disconnect',
      clientId: msg.clientId,
      successful: true,
      id: msg.id,
    };
  }
}

module.exports = MockCometDServer;
