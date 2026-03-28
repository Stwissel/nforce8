'use strict';

const EventEmitter = require('events');
const CometDClient = require('./cometd');

/**
 * A Streaming API subscription that emits 'data', 'connect', and 'error' events.
 * @extends EventEmitter
 */
class Subscription extends EventEmitter {
  /**
   * @param {object} opts - Subscription options: `topic`, optional `replayId`.
   * @param {Client} client - The parent streaming Client.
   */
  constructor(opts, client) {
    super();
    this.client = client;
    opts = opts || {};

    this._topic = opts.topic;

    if (opts.replayId) {
      this.client.addReplayId(this._topic, opts.replayId);
    }

    // Subscribe asynchronously and emit events
    this._initSubscription();
  }

  async _initSubscription() {
    try {
      this._sub = await this.client._cometd.subscribe(this._topic, (d) => {
        this.emit('data', d);
      });
      this.emit('connect');
    } catch (err) {
      this.emit('error', err);
    }
  }

  /** Cancel this subscription and stop receiving events. */
  cancel() {
    if (this._sub) {
      this._sub.cancel();
    }
  }
}

/**
 * CometD-based Streaming API client with replay support.
 * Emits 'connect' and 'disconnect' events for transport state changes.
 * @extends EventEmitter
 */
class Client extends EventEmitter {
  /**
   * @param {object} opts - Options: `oauth` (with instance_url and access_token),
   *   `apiVersion`, optional `timeout` and `retry`.
   */
  constructor(opts) {
    super();
    opts = opts || {};

    this._endpoint =
      opts.oauth.instance_url + '/cometd/' + opts.apiVersion.substring(1);
    this._cometd = new CometDClient(this._endpoint, {
      timeout: opts.timeout,
      retry: opts.retry
    });
    this._cometd.setHeader(
      'Authorization',
      'Bearer ' + opts.oauth.access_token
    );

    this._cometd.on('transport:up', () => {
      this.emit('connect');
    });

    this._cometd.on('transport:down', () => {
      this.emit('disconnect');
    });

    this._replayFromMap = {};
    const replayExtension = {
      incoming: (message, callback) => {
        callback(message);
      },
      outgoing: (message, callback) => {
        if (message && message.channel === '/meta/subscribe') {
          message.ext = message.ext || {};
          message.ext['replay'] = this._replayFromMap;
        }
        callback(message);
      }
    };

    this._cometd.addExtension(replayExtension);

    // Auto-handshake and connect
    this._ready = this._init();
  }

  async _init() {
    await this._cometd.handshake();
    await this._cometd.connect();
  }

  /**
   * Subscribe to a Streaming API topic.
   * @param {object} opts - Options with `topic` and optional `replayId`.
   * @returns {Subscription}
   */
  subscribe(opts) {
    opts = opts || {};
    return new Subscription(opts, this);
  }

  /** Disconnect and close the CometD connection. */
  disconnect() {
    this._cometd.disconnect();
  }

  /**
   * Register a replay ID for a topic (used by the replay extension on next subscribe).
   * @param {string} topic - The topic channel path.
   * @param {number} replayId - The replay ID to resume from.
   */
  addReplayId(topic, replayId) {
    this._replayFromMap[topic] = replayId;
  }
}

module.exports = {
  Subscription: Subscription,
  Client: Client
};
