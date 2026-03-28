'use strict';

const EventEmitter = require('events');
const faye = require('faye');

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

    // Our version requires a full topic
    this._topic = opts.topic;

    if (opts.replayId) {
      this.client.addReplayId(this._topic, opts.replayId);
    }

    this._sub = client._fayeClient.subscribe(this._topic, (d) => {
      this.emit('data', d);
    });

    this._sub.callback(() => {
      this.emit('connect');
    });

    this._sub.errback((err) => {
      this.emit('error', err);
    });
  }

  /** Cancel this subscription and stop receiving events. */
  cancel() {
    if (this._sub) {
      this._sub.cancel();
    }
  }
}

/**
 * Faye-based Streaming API client with replay support.
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
    this._fayeClient = new faye.Client(this._endpoint, {
      timeout: opts.timeout,
      retry: opts.retry
    });
    this._fayeClient.setHeader(
      'Authorization',
      'Bearer ' + opts.oauth.access_token
    );

    this._fayeClient.on('transport:up', () => {
      this.emit('connect');
    });

    this._fayeClient.on('transport:down', () => {
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

    this._fayeClient.addExtension(replayExtension);
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

  /** Disconnect the Faye client and close the CometD connection. */
  disconnect(/*opts*/) {
    this._fayeClient.disconnect();
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
