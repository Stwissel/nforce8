'use strict';

const EventEmitter = require('events');
const faye = require('faye');

class Subscription extends EventEmitter {
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

  cancel() {
    if (this._sub) {
      this._sub.cancel();
    }
  }
}

// Client definition

class Client extends EventEmitter {
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

  subscribe(opts) {
    opts = opts || {};
    return new Subscription(opts, this);
  }

  disconnect(/*opts*/) {
    this._fayeClient.disconnect();
  }

  addReplayId(topic, replayId) {
    this._replayFromMap[topic] = replayId;
  }
}

module.exports = {
  Subscription: Subscription,
  Client: Client
};
