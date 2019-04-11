'use strict';

const fetch = require('node-fetch');
const qs = require('querystring');
const _ = require('lodash');
const Record = require('./lib/record');
const FDCStream = require('./lib/fdcstream');
const util = require('./lib/util');
const errors = require('./lib/errors');
const multipart = require('./lib/multipart');
const optionHelper = require('./lib/optionhelper')();
const CONST = require('./lib/constants');

/*****************************
 * constants
 *****************************/

const plugins = {};

/*****************************
 * connection object
 *****************************/

// TODO turn into facturoy function with
const Connection = function(opts) {
  var self = this;

  opts = _.defaults(opts || {}, CONST.defaultOptions);

  // convert option values
  opts.environment = opts.environment.toLowerCase();
  opts.mode = opts.mode.toLowerCase();

  self = _.assign(this, opts);

  // validate options
  if (!_.isString(this.clientId)) throw new Error('invalid or missing clientId');
  if (!_.isString(this.redirectUri)) throw new Error('invalid or missing redirectUri');
  if (!_.isString(this.authEndpoint)) throw new Error('invalid or missing authEndpoint');
  if (!_.isString(this.testAuthEndpoint)) throw new Error('invalid or missing testAuthEndpoint');
  if (!_.isString(this.loginUri)) throw new Error('invalid or missing loginUri');
  if (!_.isString(this.testLoginUri)) throw new Error('invalid or missing testLoginUri');
  if (!_.isBoolean(this.gzip)) throw new Error('gzip must be a boolean');
  if (!_.isString(this.environment) || _.indexOf(CONST.ENVS, this.environment) === -1) {
    throw new Error('invalid environment, only ' + CONST.ENVS.join(' and ') + ' are allowed');
  }
  if (!_.isString(this.mode) || _.indexOf(CONST.MODES, this.mode) === -1) {
    throw new Error('invalid mode, only ' + CONST.MODES.join(' and ') + ' are allowed');
  }
  if (this.onRefresh && !_.isFunction(this.onRefresh)) throw new Error('onRefresh must be a function');
  if (this.timeout && !_.isNumber(this.timeout)) throw new Error('timeout must be a number');

  // Validate API version format
  const apiRegEx = /v[0-9][0-9]\.0/i;
  if (this.apiVersion && !this.apiVersion.match(apiRegEx)) {
    throw new Error('invalid apiVersion [' + this.apiVersion + '] number, use v99.0 format');
  }

  // parse timeout into integer in case it's a floating point.
  this.timeout = parseInt(this.timeout, 10);

  // load plugins
  if (opts.plugins && _.isArray(opts.plugins)) {
    opts.plugins.forEach(function(pname) {
      if (!plugins[pname]) throw new Error('plugin ' + pname + ' not found');
      // clone the object
      self[pname] = _.clone(plugins[pname]._fns);

      // now bind to the connection object
      _.forOwn(self[pname], function(fn, key) {
        self[pname][key] = _.bind(self[pname][key], self);
      });
    });
  }
};

/*****************************
 * auth getters/setters
 *****************************/

Connection.prototype.getOAuth = function() {
  return this.oauth;
};

Connection.prototype.setOAuth = function(oauth) {
  this.oauth = oauth;
};

Connection.prototype.getUsername = function() {
  return this.username;
};

Connection.prototype.setUsername = function(username) {
  this.username = username;
};

Connection.prototype.getPassword = function() {
  return this.password;
};

Connection.prototype.setPassword = function(password) {
  this.password = password;
};

Connection.prototype.getSecurityToken = function() {
  return this.securityToken;
};

Connection.prototype.setSecurityToken = function(token) {
  this.securityToken = token;
};

/*****************************
 * helper methods
 *****************************/

Connection.prototype._getOpts = function(d, c, opts) {
  var data, cb, dt;

  opts = opts || {};

  if (_.isFunction(d)) {
    cb = d;
    dt = null;
  } else {
    cb = c;
    dt = d;
  }

  if (opts.singleProp && dt && !_.isObject(dt)) {
    data = {};
    data[opts.singleProp] = dt;
  } else if (_.isObject(dt)) {
    data = dt;
  } else {
    data = {};
  }

  data.callback = cb;

  if (this.mode === 'single' && !data.oauth) {
    data.oauth = this.oauth;
  }

  if (opts.defaults && _.isObject(opts.defaults)) {
    data = _.defaults(data, opts.defaults);
  }
  return data;
};

/*****************************
 * authentication methods
 *****************************/

Connection.prototype.getAuthUri = function(opts) {
  if (!opts) opts = {};

  const self = this;

  var urlOpts = {
    response_type: opts.responseType || 'code',
    client_id: self.clientId,
    redirect_uri: self.redirectUri
  };

  if (opts.display) {
    urlOpts.display = opts.display.toLowerCase();
  }

  if (opts.immediate) {
    urlOpts.immediate = opts.immediate;
  }

  if (opts.scope) {
    if (_.isArray(opts.scope)) {
      urlOpts.scope = opts.scope.join(' ');
    } else {
      urlOpts.scope = opts.scope;
    }
  }

  if (opts.state) {
    urlOpts.state = opts.state;
  }

  if (opts.nonce) {
    urlOpts.nonce = opts.nonce;
  }

  if (opts.prompt) {
    if (_.isArray(opts.prompt)) {
      urlOpts.prompt = opts.prompt.join(' ');
    } else {
      urlOpts.prompt = opts.prompt;
    }
  }

  if (opts.loginHint) {
    urlOpts.login_hint = opts.loginHint;
  }

  if (opts.urlOpts) {
    urlOpts = _.assign(urlOpts, opts.urlOpts);
  }

  var endpoint;

  if (opts.authEndpoint) {
    endpoint = opts.authEndpoint;
  } else if (self.environment == 'sandbox') {
    endpoint = this.testAuthEndpoint;
  } else {
    endpoint = this.authEndpoint;
  }

  return endpoint + '?' + qs.stringify(urlOpts);
};

Connection.prototype.authenticate = function(data) {
  const self = this;
  const opts = _.defaults(this._getOpts(data), {
    executeOnRefresh: false,
    oauth: {}
  });

  opts.uri = self.environment == 'sandbox' ? this.testLoginUri : this.loginUri;
  opts.method = 'POST';
  opts.headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  var bopts = {
    client_id: self.clientId,
    client_secret: self.clientSecret
  };

  //TODO: Add JWT authentication
  if (opts.code) {
    bopts.grant_type = 'authorization_code';
    bopts.code = opts.code;
    bopts.redirect_uri = self.redirectUri;
  } else if (opts.assertion) {
    bopts.grant_type = 'assertion';
    bopts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';
    bopts.assertion = opts.assertion;
  } else if (opts.username || this.username) {
    bopts.grant_type = 'password';
    bopts.username = opts.username || this.getUsername();
    bopts.password = opts.password || this.getPassword();
    if (opts.securityToken || this.getSecurityToken()) {
      bopts.password += opts.securityToken || this.getSecurityToken();
    }
    if (this.mode === 'single') {
      this.setUsername(bopts.username);
      this.setPassword(bopts.password);
      this.setSecurityToken(bopts.securityToken);
    }
  }

  opts.body = qs.stringify(bopts);

  const result = new Promise((resolve, reject) => {
    try {
      this._apiAuthRequest(opts)
        .then((res) => {
          var old = _.clone(opts.oauth);
          _.assign(opts.oauth, res);
          if (opts.assertion) {
            opts.oauth.assertion = opts.assertion;
          }
          if (self.onRefresh && opts.executeOnRefresh === true) {
            self.onRefresh.call(self, opts.oauth, old, function(err3) {
              if (err3) {
                reject(err3);
              } else {
                resolve(opts.oauth);
              }
            });
          } else {
            resolve(opts.oauth);
          }
        })
        .catch((err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
  return result;
};

Connection.prototype.refreshToken = function(data) {
  const self = this;

  const opts = this._getOpts(data, null, {
    defaults: {
      executeOnRefresh: true
    }
  });

  opts.uri = this.environment == 'sandbox' ? this.testLoginUri : this.loginUri;
  opts.method = 'POST';

  const refreshOpts = {
    client_id: this.clientId,
    redirect_uri: this.redirectUri
  };

  // support for SAML-based token refreshes
  if (!opts.oauth.refresh_token && (opts.oauth.assertion || opts.assertion)) {
    refreshOpts.grant_type = 'assertion';
    refreshOpts.assertion_type = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';
    refreshOpts.assertion = opts.assertion || opts.oauth.assertion;
  } else {
    refreshOpts.grant_type = 'refresh_token';
    refreshOpts.refresh_token = opts.oauth.refresh_token;
  }

  // check for clientSecret and include if found
  if (this.clientSecret) {
    refreshOpts.client_secret = this.clientSecret;
  }

  opts.body = qs.stringify(refreshOpts);
  opts.headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const result = new Promise((resolve, reject) => {
    this._apiAuthRequest(opts)
      .then((res) => {
        var old = _.clone(opts.oauth);
        _.assign(opts.oauth, res);
        if (opts.assertion) {
          opts.oauth.assertion = opts.assertion;
        }
        if (self.onRefresh && opts.executeOnRefresh === true) {
          // TODO: remove callback from onRefresh call
          self.onRefresh.call(self, opts.oauth, old, function(err3) {
            if (err3) {
              reject(err3);
            } else {
              resolve(opts.oauth);
            }
          });
        } else {
          resolve(opts.oauth);
        }
      })
      .catch((err) => reject(err));
  });

  return result;
};

Connection.prototype.revokeToken = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'token'
  });

  if (this.environment === 'sandbox') {
    opts.uri = 'https://test.salesforce.com/services/oauth2/revoke';
  } else {
    opts.uri = 'https://login.salesforce.com/services/oauth2/revoke';
  }
  opts.uri += '?token=' + opts.token;
  if (opts.callbackParam) {
    opts.uri += '&callback=' + opts.callbackParam;
  }
  return this._apiAuthRequest(opts);
};

Connection.prototype.getPasswordStatus = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'id'
  });

  var id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.updatePassword = function(data) {
  var opts = this._getOpts(data);
  var id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'POST';
  opts.body = JSON.stringify({ newPassword: opts.newPassword });
  return this._apiRequest(opts);
};

Connection.prototype.getIdentity = function(data) {
  var opts = this._getOpts(data);
  opts.uri = opts.oauth.id;
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/*****************************
 * system api methods
 *****************************/

Connection.prototype.getVersions = function() {
  var opts = this._getOpts(null);
  opts.uri = 'http://na1.salesforce.com/services/data/';
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};

Connection.prototype.getResources = function(data) {
  var opts = this._getOpts(data);
  opts.resource = '/';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getSObjects = function(data) {
  //TODO: fix me! var self = this;
  var opts = this._getOpts(data);
  opts.resource = '/sobjects';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getMetadata = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'type'
  });
  opts.resource = '/sobjects/' + opts.type;
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getDescribe = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'type'
  });
  opts.resource = '/sobjects/' + opts.type + '/describe';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getLimits = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'type'
  });
  opts.resource = '/limits';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/*****************************
 * crud methods
 *****************************/

Connection.prototype.insert = function(data) {
  var opts = this._getOpts(data);
  var type = opts.sobject.getType();
  opts.resource = '/sobjects/' + type;
  opts.method = 'POST';
  if (type === 'document' || type === 'attachment' || type === 'contentversion') {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(opts.sobject._getPayload(false));
  }
  return this._apiRequest(opts);
};

Connection.prototype.update = function(data) {
  var opts = this._getOpts(data);
  var type = opts.sobject.getType();
  var id = opts.sobject.getId();
  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'PATCH';
  if (type === 'document' || type === 'attachment' || type === 'contentversion') {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(opts.sobject._getPayload(true));
  }
  return this._apiRequest(opts);
};

Connection.prototype.upsert = function(data) {
  var opts = this._getOpts(data);
  var type = opts.sobject.getType();
  var extIdField = opts.sobject.getExternalIdField();
  var extId = opts.sobject.getExternalId();
  opts.resource = '/sobjects/' + type + '/' + extIdField + '/' + extId;
  opts.method = 'PATCH';
  opts.body = JSON.stringify(opts.sobject._getPayload(false));
  return this._apiRequest(opts);
};

Connection.prototype.delete = function(data) {
  var opts = this._getOpts(data);
  var type = opts.sobject.getType();
  var id = opts.sobject.getId();
  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};

Connection.prototype.getRecord = function(data) {
  const opts = this._getOpts(data);
  const type = opts.sobject ? opts.sobject.getType() : opts.type;
  const id = opts.sobject ? opts.sobject.getId() : opts.id;

  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'GET';

  if (opts.fields) {
    if (_.isString(opts.fields)) {
      opts.fields = [opts.fields];
    }
    opts.resource += '?' + qs.stringify({ fields: opts.fields.join() });
  }

  const result = new Promise((resolve, reject) => {
    this._apiRequest(opts)
      .then((resp) => {
        if (!opts.raw) {
          resp = new Record(resp);
          resp._reset();
        }
        resolve(resp);
      })
      .catch((err) => reject(err));
  });

  return result;
};

/*****************************
 * blob/binary methods
 *****************************/

Connection.prototype.getBody = function(data) {
  const opts = this._getOpts(data);
  const type = (opts.sobject ? opts.sobject.getType() : opts.type).toLowerCase();

  if (type === 'document') {
    return this.getDocumentBody(opts);
  } else if (type === 'attachment') {
    return this.getAttachmentBody(opts);
  } else if (type === 'contentversion') {
    return this.getContentVersionData(opts);
  } else {
    return Promise.reject(new Error('invalid type: ' + type));
  }
};

Connection.prototype.getAttachmentBody = function(data) {
  var opts = this._getOpts(data);
  var id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/attachment/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

Connection.prototype.getDocumentBody = function(data) {
  var opts = this._getOpts(data);
  var id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/document/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

Connection.prototype.getContentVersionBody = function(data) {
  var opts = this._getOpts(data);
  var id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/contentversion/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

Connection.prototype.getContentVersionData = function(data) {
  var opts = this._getOpts(data);
  var id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/contentversion/' + id + '/versiondata';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

/*****************************
 * query
 *****************************/

Connection.prototype.query = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      includeDeleted: false,
      raw: false
    }
  });
  return this._queryHandler(opts);
};

Connection.prototype.queryAll = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      raw: false
    }
  });
  opts.includeDeleted = true;
  return this._queryHandler(opts);
};

Connection.prototype._queryHandler = function(data) {
  const self = this;
  const recs = [];
  const opts = this._getOpts(data);

  opts.method = 'GET';
  opts.resource = '/query';

  if (opts.includeDeleted) {
    opts.resource += 'All';
  }

  opts.qs = {
    q: opts.query
  };

  const result = new Promise((resolve, reject) => {
    // Separate function definition
    // since it might get called recursive
    function handleResponse(resp) {
      if (resp.records && resp.records.length > 0) {
        _.each(resp.records, function(r) {
          if (opts.raw) {
            recs.push(r);
          } else {
            var rec = new Record(r);
            rec._reset();
            recs.push(rec);
          }
        });
      }
      if (opts.fetchAll && resp.nextRecordsUrl) {
        self
          .getUrl({ url: resp.nextRecordsUrl, oauth: opts.oauth })
          .then((res2) => handleResponse(res2))
          .catch((err) => reject(err));
      } else {
        resp.records = recs;
        return resolve(resp);
      }
    }

    this._apiRequest(opts)
      .then((resp) => handleResponse(resp))
      .catch((err) => reject(err));
  });

  return result;
};

/*****************************
 * search
 *****************************/

Connection.prototype.search = function(data) {
  const opts = this._getOpts(data, null, {
    singleProp: 'search',
    defaults: {
      raw: false
    }
  });

  opts.resource = '/search';
  opts.method = 'GET';
  opts.qs = { q: opts.search };

  const result = new Promise((resolve, reject) => {
    this._apiRequest(opts)
      .then((resp) => {
        if (opts.raw || !resp.length) {
          resolve(resp);
        } else {
          var recs = [];
          resp.forEach(function(r) {
            recs.push(new Record(r));
          });
          resolve(resp);
        }
      })
      .catch((err) => reject(err));
  });

  return result;
};

function requireForwardSlash(uri) {
  if (!uri) return '/';
  if (uri.charAt(0) !== '/') {
    return '/' + uri;
  }
  return uri;
}

Connection.prototype.getUrl = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.putUrl = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'PUT';
  if (opts.body) {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

Connection.prototype.postUrl = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'POST';
  if (opts.body) {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

Connection.prototype.deleteUrl = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};

/*****************************
 * apex rest
 *****************************/

Connection.prototype.apexRest = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'uri'
  });
  // Allow for data.uri to start with or without a /
  opts.uri =
    opts.oauth.instance_url +
    '/services/apexrest/' +
    (data.uri.substring(0, 1) === '/' ? data.uri.substring(1) : data.uri);
  opts.method = opts.method || 'GET';
  if (opts.urlParams) {
    opts.qs = opts.urlParams;
  }
  return this._apiRequest(opts);
};

/*****************************
 * streaming api
 *****************************/

Connection.prototype.createStreamClient = function(data) {
  var self = this;
  var opts = this._getOpts(data, null, {
    defaults: {
      apiVersion: self.apiVersion,
      timeout: null,
      retry: null
    }
  });
  return new FDCStream.Client(opts);
};

Connection.prototype.subscribe = function(data) {
  var opts = this._getOpts(data, null, {
    singleProp: 'topic',
    defaults: {
      timeout: null,
      retry: null
    }
  });

  var client = this.createStreamClient(opts);
  return client.subscribe(opts);
};

// keeping this method for backwards compatibility
// proxies to connection.subscribe now
Connection.prototype.stream = function(data) {
  return this.subscribe(data);
};

/*****************************
 * auto-refresh
 *****************************/

Connection.prototype.autoRefreshToken = function(data) {
  const self = this;

  const opts = this._getOpts(data, null, {
    defaults: {
      executeOnRefresh: true
    }
  });

  const refreshOpts = {
    oauth: opts.oauth,
    executeOnRefresh: opts.executeOnRefresh
  };

  const result = new Promise((resolve, reject) => {
    // auto-refresh: refresh token
    if (opts.oauth.refresh_token) {
      Connection.prototype.refreshToken
        .call(self, refreshOpts)
        .then((res) => resolve(res))
        .catch((err) => reject(err));
      // auto-refresh: un/pw
    } else {
      Connection.prototype.authenticate
        .call(self, refreshOpts)
        .then((res) => resolve(res))
        .catch((err) => reject(err));
    }
  });

  return result;
};

/*****************************
 * internal api methods - Promises based, no callbacks
 *****************************/

Connection.prototype._apiAuthRequest = function(opts) {
  const self = this;

  // set timeout
  if (this.timeout) {
    opts.timeout = this.timeout;
  }

  // process request opts
  if (opts.requestOpts) {
    _.merge(opts, opts.requestOpts);
  }

  const uri = opts.uri;

  const result = new Promise((resolve, reject) => {
    try {
      fetch(uri, opts)
        .then((res) => {
          if (!res) {
            throw errors.emptyResponse();
          } else if (!res.ok) {
            const err = new Error('Fetch failed:' + res.statusText);
            err.statusCode = res.status;
            throw err;
          }
          return res;
        })
        .then((res) => res.json())
        .then((jBody) => {
          if (jBody.access_token && self.mode === 'single') {
            self.oauth = jBody;
          }
          resolve(jBody);
        })
        .catch((err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
  return result;
};

Connection.prototype._apiRequest = function(opts) {
  /**
   * options:
   * - sobject
   * - uri
   * - oauth
   * - multipart
   * - method
   * - encoding
   * - body
   * - qs
   * - headers
   */

  const self = this;
  const ropts = optionHelper.getApiRequestOptions(opts);
  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;
  const result = new Promise((resolve, reject) => {
    try {
      fetch(uri, ropts)
        .then((res) => responseFailureCheck(res))
        .then((res) => unsucessfullResponseCheck(res, self, ropts))
        .then((res) => (util.isJsonResponse(res) ? res.json() : res.text()))
        .then((body) => addSObjectAndId(body, sobject))
        .then((body) => resolve(body))
        .catch((err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });

  return result;
};

/*
 *  Helperfunctions for request checks
 */

function responseFailureCheck(res) {
  if (!res) {
    throw errors.emptyResponse();
  } else if (res.headers && res.headers.error) {
    // Error in the header
    const err = new Error(res.headers.error);
    err.statusCode = res.status;
    throw err;
  } else if (!res.body) {
    const err = new Error('Salesforce returned no body and status code ' + res.status);
    err.statusCode = res.status;
    throw err;
  }

  return res;
}

/*
 * Process the positive response from an API call
 */
function addSObjectAndId(body, sobject) {
  // attach the id back to the sobject on insert
  if (sobject) {
    if (sobject._reset) {
      sobject._reset();
    }
    if (body && _.isObject(body) && body.id) {
      sobject._fields.id = body.id;
    }
  }
  // Done - finally!
  return body;
}

function unsucessfullResponseCheck(res, self, opts) {
  // Only interested when stuff went wrong
  if (res.ok) {
    return res;
  }

  const e = new Error();
  e.statusCode = res.status;
  const body = util.isJsonResponse(res) ? res.json() : res.txt();

  // Salesforce sends internal errors as Array
  if (_.isArray(body) && body.length > 0) {
    e.message = body[0].message;
    e.errorCode = body[0].errorCode;
    e.body = body;
    // error: string body - Something really went wrong
  } else if (_.isString(body)) {
    e.message = body;
    e.errorCode = body;
    e.body = body;
  } else {
    // Something went totally wrong
    e.message = 'Salesforce returned an unrecognized error ' + res.status;
    e.body = body;
  }

  // confirm auto-refresh support
  if (
    e.errorCode &&
    (e.errorCode === 'INVALID_SESSION_ID' || e.errorCode === 'Bad_OAuth_Token') &&
    self.autoRefresh === true &&
    (opts.oauth.refresh_token || (self.getUsername() && self.getPassword())) &&
    !opts._retryCount
  ) {
    // attempt the autorefresh
    Connection.prototype.autoRefreshToken
      .call(self, opts)
      .then((res) => {
        opts._refreshResult = res;
        opts._retryCount = 1;
        return Connection.prototype._apiRequest.call(self, opts);
      })
      .catch((err2) => {
        throw err2;
      });
  } else {
    throw e;
  }

  return res;
}

/*****************************
 * plugin system
 *****************************/

function Plugin(opts) {
  this.namespace = opts.namespace;
  this._fns = {};
  this.util = _.clone(util);
}

Plugin.prototype.fn = function(fnName, fn) {
  if (typeof fn !== 'function') {
    throw new Error('invalid function provided');
  }
  if (typeof fnName !== 'string') {
    throw new Error('invalid function name provided');
  }
  this._fns[fnName] = fn;

  return this;
};

/*****************************
 * exports
 *****************************/

const plugin = function(opts) {
  if (typeof opts === 'string') {
    opts = { namespace: opts };
  }
  if (!opts || !opts.namespace) {
    throw new Error('no namespace provided for plugin');
  }
  opts = _.defaults(opts, {
    override: false
  });
  if (plugins[opts.namespace] && opts.override !== true) {
    throw new Error('a plugin with namespace ' + opts.namespace + ' already exists');
  }
  plugins[opts.namespace] = new Plugin(opts);
  return plugins[opts.namespace];
};

// connection creation
const createConnection = function(opts) {
  return new Connection(opts);
};

const createSObject = function(type, fields) {
  const data = fields || {};
  data.attributes = {
    type: type
  };
  const rec = new Record(data);
  return rec;
};

// Reading JSON doesn't work with import
const version = require('./package.json').version;

module.exports = {
  util: util,
  plugin: plugin,
  Record: Record,
  version: version,
  createConnection: createConnection,
  createSObject: createSObject
};
