'use strict';

const EventEmitter = require('events');

const BAYEUX_VERSION = '1.0';
const MINIMUM_VERSION = '1.0';
const DEFAULT_TIMEOUT = 110000; // Salesforce default long-poll timeout
const DEFAULT_RETRY_INTERVAL = 1000;
const DEFAULT_WS_RESPONSE_TIMEOUT = 10000;
const DEFAULT_MAX_RETRY_INTERVAL = 30000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Lightweight CometD/Bayeux client for Salesforce Streaming API.
 * Supports long-polling (fetch) and WebSocket transports.
 * @extends EventEmitter
 */
class CometDClient extends EventEmitter {
  /**
   * @param {string} endpoint - The CometD endpoint URL (e.g. https://instance.salesforce.com/cometd/58.0).
   * @param {object} [opts] - Options: timeout, retry.
   */
  constructor(endpoint, opts = {}) {
    super();
    this._endpoint = endpoint;
    this._timeout = opts.timeout || DEFAULT_TIMEOUT;
    this._retryInterval = opts.retry || DEFAULT_RETRY_INTERVAL;
    this._wsResponseTimeout = opts.wsResponseTimeout || DEFAULT_WS_RESPONSE_TIMEOUT;
    this._maxRetryInterval = opts.maxRetryInterval || DEFAULT_MAX_RETRY_INTERVAL;
    this._maxReconnectAttempts = opts.maxReconnectAttempts || DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this._reconnectAttempts = 0;
    this._headers = { 'Content-Type': 'application/json' };
    this._extensions = [];
    this._subscriptions = new Map(); // topic → callback
    this._clientId = null;
    this._messageId = 0;
    this._advice = { reconnect: 'retry', interval: 0, timeout: this._timeout };
    this._connected = false;
    this._disconnecting = false;
    this._transport = null; // 'long-polling' or 'websocket'
    this._ws = null;
    this._connectTimer = null;
    this._pendingConnectResolve = null;
    this._wsMessageBuffer = []; // buffered responses for WebSocket
  }

  /**
   * Set an HTTP header sent with every request.
   * @param {string} name - Header name.
   * @param {string} value - Header value.
   */
  setHeader(name, value) {
    this._headers[name] = value;
  }

  /**
   * Add a Bayeux extension for message processing.
   * @param {{incoming?: Function, outgoing?: Function}} extension
   */
  addExtension(extension) {
    this._extensions.push(extension);
  }

  /** @returns {number} Next unique message ID. */
  _nextId() {
    return String(++this._messageId);
  }

  /**
   * Run outgoing extensions on a message.
   * @param {object} message - Bayeux message.
   * @returns {Promise<object>} Processed message.
   */
  async _applyOutgoing(message) {
    let msg = message;
    for (const ext of this._extensions) {
      if (ext.outgoing) {
        msg = await new Promise((resolve) => ext.outgoing(msg, resolve));
      }
    }
    return msg;
  }

  /**
   * Run incoming extensions on a message.
   * @param {object} message - Bayeux message.
   * @returns {Promise<object>} Processed message.
   */
  async _applyIncoming(message) {
    let msg = message;
    for (const ext of this._extensions) {
      if (ext.incoming) {
        msg = await new Promise((resolve) => ext.incoming(msg, resolve));
      }
    }
    return msg;
  }

  /**
   * Send a Bayeux message via the active transport.
   * @param {object|object[]} messages - One or more Bayeux messages.
   * @returns {Promise<object[]>} Response messages.
   */
  async _send(messages) {
    const msgs = Array.isArray(messages) ? messages : [messages];
    const processed = [];
    for (const m of msgs) {
      processed.push(await this._applyOutgoing(m));
    }

    if (
      this._transport === 'websocket' &&
      this._ws &&
      this._ws.readyState === WebSocket.OPEN
    ) {
      return this._sendWs(processed);
    }
    return this._sendHttp(processed);
  }

  /**
   * Send messages via HTTP long-polling (fetch POST).
   * @param {object[]} messages
   * @returns {Promise<object[]>}
   */
  async _sendHttp(messages) {
    const res = await fetch(this._endpoint, {
      method: 'POST',
      headers: this._headers,
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      throw new Error('CometD HTTP error: ' + res.status);
    }
    const responses = await res.json();
    const incoming = [];
    for (const r of responses) {
      incoming.push(await this._applyIncoming(r));
    }
    return incoming;
  }

  /**
   * Send messages via WebSocket.
   * @param {object[]} messages
   * @returns {Promise<object[]>}
   */
  _sendWs(messages) {
    return new Promise((resolve, reject) => {
      const expectedId = messages[0].id;
      const isConnect = messages[0].channel === '/meta/connect';

      // For /meta/connect, the response is deferred (long-poll style)
      if (isConnect) {
        this._pendingConnectResolve = resolve;
      }

      this._ws.send(JSON.stringify(messages));

      if (!isConnect) {
        // Non-connect messages get immediate responses
        const handler = async (event) => {
          const data = JSON.parse(event.data);
          const responses = Array.isArray(data) ? data : [data];
          const matching = responses.filter(
            (r) => r.id === expectedId || !r.id,
          );
          if (matching.length > 0) {
            this._ws.removeEventListener('message', handler);
            const incoming = [];
            for (const r of responses) {
              incoming.push(await this._applyIncoming(r));
            }
            resolve(incoming);
          }
        };
        this._ws.addEventListener('message', handler);

        // Timeout safety
        setTimeout(() => {
          this._ws.removeEventListener('message', handler);
          reject(new Error('CometD WebSocket response timeout'));
        }, this._wsResponseTimeout);
      }
    });
  }

  /**
   * Perform the Bayeux handshake to obtain a clientId and negotiate transport.
   * @returns {Promise<void>}
   */
  async handshake() {
    // Always handshake over HTTP
    const msg = {
      channel: '/meta/handshake',
      version: BAYEUX_VERSION,
      minimumVersion: MINIMUM_VERSION,
      supportedConnectionTypes: ['long-polling', 'websocket'],
      id: this._nextId(),
    };

    const responses = await this._sendHttp([await this._applyOutgoing(msg)]);
    const response = responses.find((r) => r.channel === '/meta/handshake');

    if (!response || !response.successful) {
      const errMsg = response ? response.error : 'No handshake response';
      throw new Error('CometD handshake failed: ' + errMsg);
    }

    this._clientId = response.clientId;

    if (response.advice) {
      Object.assign(this._advice, response.advice);
    }

    // Negotiate transport: prefer websocket if server supports it
    const serverTypes = response.supportedConnectionTypes || ['long-polling'];
    if (serverTypes.includes('websocket')) {
      this._transport = 'websocket';
    } else {
      this._transport = 'long-polling';
    }
  }

  /**
   * Establish WebSocket connection to the CometD endpoint.
   * @returns {Promise<void>}
   */
  _connectWebSocket() {
    return new Promise((resolve) => {
      const wsUrl = this._endpoint.replace(/^http/, 'ws');
      this._ws = new WebSocket(wsUrl, ['cometd'], {
        headers: this._headers,
      });

      this._ws.addEventListener('open', () => {
        resolve();
      });

      this._ws.addEventListener('close', () => {
        if (!this._disconnecting) {
          this._connected = false;
          this.emit('transport:down');
          this._scheduleReconnect();
        }
      });

      this._ws.addEventListener('error', () => {
        if (!this._connected) {
          // Failed to connect — fall back to long-polling
          this._transport = 'long-polling';
          this._ws = null;
          resolve();
        }
      });

      this._ws.addEventListener('message', async (event) => {
        const data = JSON.parse(event.data);
        const messages = Array.isArray(data) ? data : [data];

        for (const msg of messages) {
          const processed = await this._applyIncoming(msg);
          this._handleMessage(processed);
        }
      });
    });
  }

  /**
   * Handle an incoming Bayeux message — dispatch events or resolve pending connect.
   * @param {object} msg - Processed Bayeux message.
   */
  _handleMessage(msg) {
    if (msg.channel === '/meta/connect') {
      if (msg.advice) {
        Object.assign(this._advice, msg.advice);
      }
      if (this._pendingConnectResolve) {
        const resolve = this._pendingConnectResolve;
        this._pendingConnectResolve = null;
        resolve([msg]);
      }
      return;
    }

    // Data messages — dispatch to subscription callback
    if (msg.data !== undefined && msg.channel) {
      const callback = this._subscriptions.get(msg.channel);
      if (callback && typeof callback === 'function') {
        callback(msg.data);
      }
    }
  }

  /**
   * Start the CometD connect loop (long-polling or WebSocket).
   * Must call handshake() first.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this._transport === 'websocket') {
      try {
        await this._connectWebSocket();
      } catch {
        // Fall back to long-polling
        this._transport = 'long-polling';
        this._ws = null;
      }
    }

    this._connected = true;
    this._reconnectAttempts = 0;
    this.emit('transport:up');
    this._connectLoop();
  }

  /**
   * The persistent connect loop — sends /meta/connect and waits for response.
   */
  async _connectLoop() {
    while (this._connected && !this._disconnecting) {
      try {
        const msg = {
          channel: '/meta/connect',
          clientId: this._clientId,
          connectionType: this._transport,
          id: this._nextId(),
        };

        const responses = await this._send(msg);
        const response = responses.find((r) => r.channel === '/meta/connect');

        if (response) {
          if (response.advice) {
            Object.assign(this._advice, response.advice);
          }

          if (!response.successful) {
            if (this._advice.reconnect === 'handshake') {
              await this._rehandshake();
              continue;
            }
            if (this._advice.reconnect === 'none') {
              this._connected = false;
              this.emit('transport:down');
              return;
            }
          }

          // Dispatch any data messages piggybacked on the connect response
          for (const r of responses) {
            if (r.data !== undefined && r.channel) {
              const callback = this._subscriptions.get(r.channel);
              if (callback) {
                callback(r.data);
              }
            }
          }
        }

        // Apply advice interval before next connect
        if (this._advice.interval > 0) {
          await this._delay(this._advice.interval);
        }
      } catch {
        if (this._disconnecting) return;
        this._connected = false;
        this.emit('transport:down');
        this._scheduleReconnect();
        return;
      }
    }
  }

  /**
   * Re-handshake after server requests it, then resume connect loop.
   */
  async _rehandshake() {
    try {
      await this.handshake();
      // Re-subscribe all active subscriptions
      for (const topic of this._subscriptions.keys()) {
        await this._sendSubscribe(topic);
      }
    } catch {
      this._connected = false;
      this.emit('transport:down');
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  _scheduleReconnect() {
    if (this._disconnecting) return;

    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      if (this._connectTimer) {
        clearTimeout(this._connectTimer);
        this._connectTimer = null;
      }
      this.emit('error', new Error('CometD max reconnect attempts reached'));
      return;
    }

    const delay = Math.min(
      this._retryInterval * Math.pow(2, this._reconnectAttempts),
      this._maxRetryInterval,
    );
    this._reconnectAttempts++;

    this._connectTimer = setTimeout(async () => {
      try {
        await this.handshake();
        this._reconnectAttempts = 0;
        // Re-subscribe all active subscriptions
        for (const topic of this._subscriptions.keys()) {
          await this._sendSubscribe(topic);
        }
        await this.connect();
      } catch {
        this._scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Send a /meta/subscribe message for a topic.
   * @param {string} topic
   * @returns {Promise<object>} Subscribe response.
   */
  async _sendSubscribe(topic) {
    const msg = {
      channel: '/meta/subscribe',
      clientId: this._clientId,
      subscription: topic,
      id: this._nextId(),
    };

    const responses = await this._send(msg);
    return responses.find((r) => r.channel === '/meta/subscribe');
  }

  /**
   * Subscribe to a CometD channel.
   * @param {string} topic - Channel path (e.g. '/topic/MyPushTopic').
   * @param {Function} callback - Called with event data for each message.
   * @returns {Promise<{successful: boolean, cancel: Function}>}
   */
  async subscribe(topic, callback) {
    this._subscriptions.set(topic, callback);
    const response = await this._sendSubscribe(topic);

    if (!response || !response.successful) {
      this._subscriptions.delete(topic);
      const errMsg = response ? response.error : 'No subscribe response';
      throw new Error('CometD subscribe failed: ' + errMsg);
    }

    return {
      successful: true,
      cancel: () => this.unsubscribe(topic),
    };
  }

  /**
   * Unsubscribe from a CometD channel.
   * @param {string} topic - Channel path.
   * @returns {Promise<void>}
   */
  async unsubscribe(topic) {
    this._subscriptions.delete(topic);

    if (!this._connected || this._disconnecting) return;

    const msg = {
      channel: '/meta/unsubscribe',
      clientId: this._clientId,
      subscription: topic,
      id: this._nextId(),
    };

    await this._send(msg);
  }

  /**
   * Disconnect from the CometD server and clean up resources.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._disconnecting = true;
    this._connected = false;

    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }

    if (this._clientId) {
      try {
        const msg = {
          channel: '/meta/disconnect',
          clientId: this._clientId,
          id: this._nextId(),
        };

        if (this._transport === 'long-polling') {
          await this._sendHttp([await this._applyOutgoing(msg)]);
        }
      } catch {
        // Best-effort disconnect
      }
    }

    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }

    this._clientId = null;
    this._subscriptions.clear();
  }

  /**
   * Delay for a specified number of milliseconds.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = CometDClient;
