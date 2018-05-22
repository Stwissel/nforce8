const EventEmitter = require('events');
const faye = require('faye');

class Subscription extends EventEmitter {

  constructor(opts, client) {
    super();
    var self = this;
    self.client = client;
    opts = opts || {};

    // Our version requires a full topic 
    this._topic = opts.topic;

    this._sub = client._fayeClient.subscribe(this._topic, function (d) {
      self.emit('data', d);
    });

    this._sub.callback(function () {
      self.emit('connect');
    });

    this._sub.errback(function (err) {
      self.emit('error', err);
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
    var self = this;
    opts = opts || {};

    this._endpoint = opts.oauth.instance_url + '/cometd/' + opts.apiVersion.substring(1);
    this._fayeClient = new faye.Client(this._endpoint, {
      timeout: opts.timeout,
      retry: opts.retry
    });
    this._fayeClient.setHeader('Authorization', 'Bearer ' + opts.oauth.access_token);

    this._fayeClient.on('transport:up', function () {
      self.emit('connect');
    });

    this._fayeClient.on('transport:down', function () {
      self.emit('disconnect');
    });
  }

  subscribe(opts) {
    opts = opts || {};
    return new Subscription(opts, this);
  }

  disconnect(/*opts*/) {
    this._fayeClient.disconnect();
  }

}

// Require syntax for Node < 10
module.exports = {
  Subscription: Subscription,
  Client: Client
};
