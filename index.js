'use strict';

const Record = require('./lib/record');
const FDCStream = require('./lib/fdcstream');
const util = require('./lib/util');
const errors = require('./lib/errors');
const multipart = require('./lib/multipart');
const optionHelper = require('./lib/optionhelper')();
const CONST = require('./lib/constants');
const { validateConnectionOptions } = require('./lib/connection');

/*****************************
 * constants
 *****************************/

const plugins = {};

/*****************************
 * connection object
 *****************************/

// TODO turn into ES6 class
const Connection = function (opts) {
  let self = this;

  opts = Object.assign({}, CONST.defaultOptions, opts || {});

  // convert option values
  opts.environment = opts.environment.toLowerCase();
  opts.mode = opts.mode.toLowerCase();

  Object.assign(this, opts);

  // validate options
  validateConnectionOptions(this);

  // parse timeout into integer in case it's a floating point.
  this.timeout = parseInt(this.timeout, 10);

  // load plugins
  if (opts.plugins && Array.isArray(opts.plugins)) {
    opts.plugins.forEach(function (pname) {
      if (!plugins[pname]) throw new Error('plugin ' + pname + ' not found');
      // clone the object
      self[pname] = { ...plugins[pname]._fns };

      // now bind to the connection object
      for (const key of Object.keys(self[pname])) {
        self[pname][key] = self[pname][key].bind(self);
      }
    });
  }
};

/*****************************
 * auth getters/setters
 *****************************/

Connection.prototype.getOAuth = function () {
  return this.oauth;
};

Connection.prototype.setOAuth = function (oauth) {
  this.oauth = oauth;
};

Connection.prototype.getUsername = function () {
  return this.username;
};

Connection.prototype.setUsername = function (username) {
  this.username = username;
};

Connection.prototype.getPassword = function () {
  return this.password;
};

Connection.prototype.setPassword = function (password) {
  this.password = password;
};

Connection.prototype.getSecurityToken = function () {
  return this.securityToken;
};

Connection.prototype.setSecurityToken = function (token) {
  this.securityToken = token;
};

/*****************************
 * helper methods
 *****************************/

Connection.prototype._getOpts = function (d, c, opts = {}) {
  let data = {};
  let callback;
  let dataTransfer;

  if (util.isFunction(d)) {
    callback = d;
    dataTransfer = null;
  } else {
    callback = c;
    dataTransfer = d;
  }

  if (opts.singleProp && dataTransfer && !util.isObject(dataTransfer)) {
    data[opts.singleProp] = dataTransfer;
  } else if (util.isObject(dataTransfer)) {
    data = dataTransfer;
  }

  data.callback = callback;

  if (this.mode === 'single' && !data.oauth) {
    data.oauth = this.oauth;
  }

  if (opts.defaults && util.isObject(opts.defaults)) {
    data = Object.assign({}, opts.defaults, data);
  }
  return data;
};

/*****************************
 * authentication methods
 *****************************/

Connection.prototype.getAuthUri = function (opts = {}) {
  const self = this;

  let urlOpts = {
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
    if (Array.isArray(opts.scope)) {
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
    if (Array.isArray(opts.prompt)) {
      urlOpts.prompt = opts.prompt.join(' ');
    } else {
      urlOpts.prompt = opts.prompt;
    }
  }

  if (opts.loginHint) {
    urlOpts.login_hint = opts.loginHint;
  }

  if (opts.urlOpts) {
    Object.assign(urlOpts, opts.urlOpts);
  }

  let endpoint;

  if (opts.authEndpoint) {
    endpoint = opts.authEndpoint;
  } else if (self.environment === 'sandbox') {
    endpoint = this.testAuthEndpoint;
  } else {
    endpoint = this.authEndpoint;
  }

  return endpoint + '?' + new URLSearchParams(urlOpts).toString();
};

Connection.prototype._resolveWithRefresh = function (opts, oldOauth) {
  if (this.onRefresh && opts.executeOnRefresh === true) {
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, opts.oauth, oldOauth, (err) => {
        if (err) reject(err);
        else resolve(opts.oauth);
      });
    });
  }
  return Promise.resolve(opts.oauth);
};

Connection.prototype.authenticate = function (data) {
  const self = this;
  const opts = Object.assign({ executeOnRefresh: false, oauth: {} }, this._getOpts(data));

  opts.uri = self.environment === 'sandbox' ? this.testLoginUri : this.loginUri;
  opts.method = 'POST';
  opts.headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const bopts = {
    client_id: self.clientId,
    client_secret: self.clientSecret
  };

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

  opts.body = new URLSearchParams(bopts).toString();

  return this._apiAuthRequest(opts).then((res) => {
    let old = { ...opts.oauth };
    Object.assign(opts.oauth, res);
    if (opts.assertion) {
      opts.oauth.assertion = opts.assertion;
    }
    return self._resolveWithRefresh(opts, old);
  });
};

Connection.prototype.refreshToken = function (data) {
  const self = this;

  const opts = this._getOpts(data, null, {
    defaults: {
      executeOnRefresh: true
    }
  });

  opts.uri = this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;
  opts.method = 'POST';

  const refreshOpts = {
    client_id: this.clientId,
    redirect_uri: this.redirectUri
  };

  // support for SAML-based token refreshes
  if (!opts.oauth.refresh_token && (opts.oauth.assertion || opts.assertion)) {
    refreshOpts.grant_type = 'assertion';
    refreshOpts.assertion_type =
      'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';
    refreshOpts.assertion = opts.assertion || opts.oauth.assertion;
  } else {
    refreshOpts.grant_type = 'refresh_token';
    refreshOpts.refresh_token = opts.oauth.refresh_token;
  }

  // check for clientSecret and include if found
  if (this.clientSecret) {
    refreshOpts.client_secret = this.clientSecret;
  }

  opts.body = new URLSearchParams(refreshOpts).toString();
  opts.headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  return this._apiAuthRequest(opts).then((res) => {
    let old = { ...opts.oauth };
    Object.assign(opts.oauth, res);
    if (opts.assertion) {
      opts.oauth.assertion = opts.assertion;
    }
    return self._resolveWithRefresh(opts, old);
  });
};

Connection.prototype.revokeToken = function (data) {
  let opts = this._getOpts(data, null, {
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

Connection.prototype.getPasswordStatus = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'id'
  });

  let id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.updatePassword = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'POST';
  opts.body = JSON.stringify({ newPassword: opts.newPassword });
  return this._apiRequest(opts);
};

Connection.prototype.getIdentity = function (data) {
  let opts = this._getOpts(data);
  opts.uri = opts.oauth.id;
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/*****************************
 * system api methods
 *****************************/

Connection.prototype.getVersions = function () {
  let opts = this._getOpts(null);
  opts.uri = 'http://na1.salesforce.com/services/data/';
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};

Connection.prototype.getResources = function (data) {
  let opts = this._getOpts(data);
  opts.resource = '/';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getSObjects = function (data) {
  let opts = this._getOpts(data);
  opts.resource = '/sobjects';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getMetadata = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'type'
  });
  opts.resource = '/sobjects/' + opts.type;
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getDescribe = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'type'
  });
  opts.resource = '/sobjects/' + opts.type + '/describe';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.getLimits = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'type'
  });
  opts.resource = '/limits';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/*****************************
 * crud methods
 *****************************/

Connection.prototype.insert = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  opts.resource = '/sobjects/' + type;
  opts.method = 'POST';
  if (CONST.MULTIPART_TYPES.includes(type)) {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(opts.sobject._getPayload(false));
  }
  return this._apiRequest(opts);
};

Connection.prototype.update = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  let id = opts.sobject.getId();
  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'PATCH';
  if (CONST.MULTIPART_TYPES.includes(type)) {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(opts.sobject._getPayload(true));
  }
  return this._apiRequest(opts);
};

Connection.prototype.upsert = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  let extIdField = opts.sobject.getExternalIdField();
  let extId = opts.sobject.getExternalId();
  opts.resource = '/sobjects/' + type + '/' + extIdField + '/' + extId;
  opts.method = 'PATCH';
  opts.body = JSON.stringify(opts.sobject._getPayload(false));
  return this._apiRequest(opts);
};

Connection.prototype.delete = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  let id = opts.sobject.getId();
  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};

Connection.prototype.getRecord = function (data) {
  const opts = this._getOpts(data);
  const type = opts.sobject ? opts.sobject.getType() : opts.type;
  const id = opts.sobject ? opts.sobject.getId() : opts.id;

  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'GET';

  if (opts.fields) {
    if (typeof opts.fields === 'string') {
      opts.fields = [opts.fields];
    }
    opts.resource += '?' + new URLSearchParams({ fields: opts.fields.join() }).toString();
  }

  return this._apiRequest(opts).then((resp) => {
    if (!opts.raw) {
      resp = new Record(resp);
      resp._reset();
    }
    return resp;
  });
};

/*****************************
 * blob/binary methods
 *****************************/

Connection.prototype.getBody = function (data) {
  const opts = this._getOpts(data);
  const type = (
    opts.sobject ? opts.sobject.getType() : opts.type
  ).toLowerCase();

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

Connection.prototype.getAttachmentBody = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/attachment/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

Connection.prototype.getDocumentBody = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/document/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

Connection.prototype.getContentVersionData = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/contentversion/' + id + '/versiondata';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

/*****************************
 * query
 *****************************/

Connection.prototype.query = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      includeDeleted: false,
      raw: false
    }
  });
  return this._queryHandler(opts);
};

Connection.prototype.queryAll = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      raw: false
    }
  });
  opts.includeDeleted = true;
  return this._queryHandler(opts);
};

Connection.prototype._queryHandler = function (data) {
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

  function handleResponse(respCandidate) {
    let resp = respToJson(respCandidate);
    if (resp.records && resp.records.length > 0) {
      resp.records.forEach(function (r) {
        if (opts.raw) {
          recs.push(r);
        } else {
          let rec = new Record(r);
          rec._reset();
          recs.push(rec);
        }
      });
    }
    if (opts.fetchAll && resp.nextRecordsUrl) {
      return self
        .getUrl({ url: resp.nextRecordsUrl, oauth: opts.oauth })
        .then((res2) => handleResponse(res2));
    }
    resp.records = recs;
    return resp;
  }

  return this._apiRequest(opts).then((resp) => handleResponse(resp));
};

/**
 * If it hasn't been discovered on the header, try to convert it to object here.
 * @param {string|object} respCandidate - Raw response string or already-parsed object
 * @returns {object} Parsed JSON object
 */
const respToJson = (respCandidate) => {
  if (typeof respCandidate === 'object') {
    return respCandidate;
  }
  try {
    return JSON.parse(respCandidate);
  } catch {
    throw errors.invalidJson();
  }
};

/*****************************
 * search
 *****************************/

Connection.prototype.search = function (data) {
  const opts = this._getOpts(data, null, {
    singleProp: 'search',
    defaults: {
      raw: false
    }
  });

  opts.resource = '/search';
  opts.method = 'GET';
  opts.qs = { q: opts.search };

  return this._apiRequest(opts).then((resp) => {
    if (opts.raw) {
      return resp;
    }
    const records = (resp && resp.searchRecords) || [];
    if (records.length === 0) {
      return resp;
    }
    return { ...resp, searchRecords: records.map((r) => new Record(r)) };
  });
};

function requireForwardSlash(uri) {
  if (!uri) return '/';
  if (uri.charAt(0) !== '/') {
    return '/' + uri;
  }
  return uri;
}

Connection.prototype.getUrl = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'GET';
  return this._apiRequest(opts);
};

Connection.prototype.putUrl = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'PUT';
  if (opts.body) {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

Connection.prototype.postUrl = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'POST';
  if (opts.body) {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

Connection.prototype.deleteUrl = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'url'
  });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};

/*****************************
 * apex rest
 *****************************/

Connection.prototype.apexRest = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'uri'
  });
  const apexPath = opts.uri.startsWith('/') ? opts.uri.substring(1) : opts.uri;
  opts.uri = opts.oauth.instance_url + '/services/apexrest/' + apexPath;
  opts.method = opts.method || 'GET';
  if (opts.urlParams) {
    opts.qs = opts.urlParams;
  }
  return this._apiRequest(opts);
};

/*****************************
 * streaming api
 *****************************/

Connection.prototype.createStreamClient = function (data) {
  let self = this;
  let opts = this._getOpts(data, null, {
    defaults: {
      apiVersion: self.apiVersion,
      timeout: null,
      retry: null
    }
  });
  return new FDCStream.Client(opts);
};

Connection.prototype.subscribe = function (data) {
  let opts = this._getOpts(data, null, {
    singleProp: 'topic',
    defaults: {
      timeout: null,
      retry: null
    }
  });

  let client = this.createStreamClient(opts);
  return client.subscribe(opts);
};

// keeping this method for backwards compatibility
// proxies to connection.subscribe now
Connection.prototype.stream = function (data) {
  return this.subscribe(data);
};

/*****************************
 * auto-refresh
 *****************************/

Connection.prototype.autoRefreshToken = function (data) {
  const opts = this._getOpts(data, null, {
    defaults: {
      executeOnRefresh: true
    }
  });

  const refreshOpts = {
    oauth: opts.oauth,
    executeOnRefresh: opts.executeOnRefresh
  };

  if (opts.oauth.refresh_token || opts.oauth.assertion) {
    return Connection.prototype.refreshToken.call(this, refreshOpts);
  }
  return Connection.prototype.authenticate.call(this, refreshOpts);
};

/*****************************
 * internal api methods - Promises based, no callbacks
 *****************************/

Connection.prototype._apiAuthRequest = function (opts) {
  if (opts.requestOpts) {
    Object.assign(opts, opts.requestOpts);
  }

  if (this.timeout) {
    const timeoutSignal = AbortSignal.timeout(this.timeout);
    opts.signal =
      opts.signal !== undefined
        ? AbortSignal.any([timeoutSignal, opts.signal])
        : timeoutSignal;
  }

  const self = this;
  const uri = opts.uri;

  return fetch(uri, opts)
    .then((res) => {
      if (!res) {
        throw errors.emptyResponse();
      }
      if (!res.ok) {
        const err = new Error('Fetch failed:' + res.statusText);
        err.statusCode = res.status;
        throw err;
      }
      return res.json().catch((e) => {
        if (e instanceof SyntaxError) throw errors.invalidJson();
        throw e;
      });
    })
    .then((jBody) => {
      if (jBody.access_token && self.mode === 'single') {
        self.oauth = jBody;
      }
      return jBody;
    });
};

Connection.prototype._apiRequest = function (opts) {
  const self = this;
  const ropts = optionHelper.getApiRequestOptions(opts);

  if (this.timeout) {
    const timeoutSignal = AbortSignal.timeout(this.timeout);
    ropts.signal =
      ropts.signal !== undefined
        ? AbortSignal.any([timeoutSignal, ropts.signal])
        : timeoutSignal;
  }

  const uri = optionHelper.getFullUri(ropts);
  const sobject = opts.sobject;

  return fetch(uri, ropts)
    .then((res) => responseFailureCheck(res))
    .then((res) => unsuccessfulResponseCheck(res))
    .then((res) => {
      if (opts.blob) {
        return res.arrayBuffer();
      }
      if (util.isJsonResponse(res)) {
        return res.json().catch((e) => {
          if (e instanceof SyntaxError) throw errors.invalidJson();
          throw e;
        });
      }
      return res.text();
    })
    .then((body) => addSObjectAndId(body, sobject))
    .catch((err) => {
      if (
        err.errorCode &&
        (err.errorCode === 'INVALID_SESSION_ID' ||
          err.errorCode === 'Bad_OAuth_Token') &&
        self.autoRefresh === true &&
        (opts.oauth.refresh_token ||
          (self.getUsername() && self.getPassword())) &&
        !opts._retryCount
      ) {
        return Connection.prototype.autoRefreshToken
          .call(self, opts)
          .then((res) => {
            opts._refreshResult = res;
            opts._retryCount = 1;
            return Connection.prototype._apiRequest.call(self, opts);
          });
      }
      throw err;
    });
};

/*
 *  Helperfunctions for request checks
 */

function responseFailureCheck(res) {
  if (!res) {
    throw errors.emptyResponse();
  }
  const headerError =
    res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('error')
      : res.headers && res.headers.error;
  if (headerError) {
    const err = new Error(headerError);
    err.statusCode = res.status;
    throw err;
  }
  const contentLength =
    res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('content-length')
      : res.headers && res.headers['content-length'];
  const emptyBody =
    contentLength !== undefined &&
    contentLength !== null &&
    String(contentLength) === '0';
  const notSuccess = res.status < 200 || res.status >= 300;
  if (emptyBody && notSuccess) {
    const err = new Error(
      'Salesforce returned no body and status code ' + res.status
    );
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
    if (body && typeof body === 'object' && body.id) {
      sobject.setId(body.id);
    }
  }
  // Done - finally!
  return body;
}

function unsuccessfulResponseCheck(res) {
  if (res.ok) {
    return res;
  }

  return (util.isJsonResponse(res) ? res.json() : res.text()).then((body) => {
    const e = new Error();
    e.statusCode = res.status;

    // Salesforce sends internal errors as Array
    if (Array.isArray(body) && body.length > 0) {
      e.message = body[0].message;
      e.errorCode = body[0].errorCode;
      e.body = body;
      // error: string body - Something really went wrong
    } else if (typeof body === 'string') {
      e.message = body;
      e.errorCode = body;
      e.body = body;
    } else {
      // Something went totally wrong
      e.message = 'Salesforce returned an unrecognized error ' + res.status;
      e.body = body;
    }

    throw e;
  });
}

/*****************************
 * plugin system
 *****************************/

function Plugin(opts) {
  this.namespace = opts.namespace;
  this._fns = {};
  this.util = { ...util };
}

Plugin.prototype.fn = function (fnName, fn) {
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

const plugin = function (opts) {
  if (typeof opts === 'string') {
    opts = { namespace: opts };
  }
  if (!opts || !opts.namespace) {
    throw new Error('no namespace provided for plugin');
  }
  opts = Object.assign({ override: false }, opts);
  if (plugins[opts.namespace] && opts.override !== true) {
    throw new Error(
      'a plugin with namespace ' + opts.namespace + ' already exists'
    );
  }
  plugins[opts.namespace] = new Plugin(opts);
  return plugins[opts.namespace];
};

// connection creation
const createConnection = (opts) => new Connection(opts);

const createSObject = function (type, fields) {
  const data = fields || {};
  data.attributes = {
    type: type
  };
  const rec = new Record(data);
  return rec;
};

// Reading JSON doesn't work with import
const version = require('./package.json').version;
const API_VERSION = require('./package.json').sfdx.api;
module.exports = {
  util: util,
  plugin: plugin,
  Record: Record,
  version: version,
  API_VERSION: API_VERSION,
  createConnection: createConnection,
  createSObject: createSObject
};
