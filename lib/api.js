'use strict';

const Record = require('./record');
const FDCStream = require('./fdcstream');
const util = require('./util');
const errors = require('./errors');
const multipart = require('./multipart');
const CONST = require('./constants');

const _getOpts = function (d, opts = {}) {
  let data = {};

  if (opts.singleProp && d && !util.isObject(d)) {
    data[opts.singleProp] = d;
  } else if (util.isObject(d)) {
    data = d;
  }

  if (this.mode === 'single' && !data.oauth) {
    data.oauth = this.oauth;
  }

  if (opts.defaults && util.isObject(opts.defaults)) {
    data = Object.assign({}, opts.defaults, data);
  }
  return data;
};

/*
 * System API methods
 */

const getPasswordStatus = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'id',
  });

  let id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const updatePassword = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? opts.sobject.getId() : opts.id;
  opts.resource = '/sobjects/user/' + id + '/password';
  opts.method = 'POST';
  opts.body = JSON.stringify({ newPassword: opts.newPassword });
  return this._apiRequest(opts);
};

const getIdentity = function (data) {
  let opts = this._getOpts(data);
  if (!opts.oauth || !opts.oauth.access_token) {
    return Promise.reject(
      new Error('getIdentity requires oauth including access_token'),
    );
  }
  if (!opts.oauth.id) {
    return Promise.reject(
      new Error('getIdentity requires oauth.id (identity URL)'),
    );
  }
  opts.uri = opts.oauth.id;
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const getVersions = function (data) {
  const opts = this._getOpts(data);
  if (opts.oauth && opts.oauth.instance_url) {
    opts.uri = opts.oauth.instance_url + '/services/data/';
  } else {
    opts.uri = this.loginUri.replace('/oauth2/token', '') + '/services/data/';
  }
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};

const getResources = function (data) {
  let opts = this._getOpts(data);
  opts.resource = '/';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const getSObjects = function (data) {
  let opts = this._getOpts(data);
  opts.resource = '/sobjects';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const getMetadata = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'type',
  });
  opts.resource = '/sobjects/' + opts.type;
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const getDescribe = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'type',
  });
  opts.resource = '/sobjects/' + opts.type + '/describe';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

const getLimits = function (data) {
  let opts = this._getOpts(data);
  opts.resource = '/limits';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/*
 * CRUD methods
 */

const insert = function (data) {
  let opts = this._getOpts(data);
  if (!opts.sobject) {
    throw new Error('insert requires opts.sobject');
  }
  let type = opts.sobject.getType();
  opts.resource = '/sobjects/' + type;
  opts.method = 'POST';
  if (CONST.MULTIPART_TYPES.includes(type)) {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(opts.sobject._getFullPayload());
  }
  return this._apiRequest(opts);
};

const update = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  let id = opts.sobject.getId();
  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'PATCH';
  if (CONST.MULTIPART_TYPES.includes(type)) {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(opts.sobject._getChangedPayload());
  }
  return this._apiRequest(opts);
};

const upsert = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  let extIdField = opts.sobject.getExternalIdField();
  let extId = opts.sobject.getExternalId();
  opts.resource = '/sobjects/' + type + '/' + extIdField + '/' + extId;
  opts.method = 'PATCH';
  opts.body = JSON.stringify(opts.sobject._getFullPayload());
  return this._apiRequest(opts);
};

const _delete = function (data) {
  let opts = this._getOpts(data);
  let type = opts.sobject.getType();
  let id = opts.sobject.getId();
  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};

const getRecord = function (data) {
  const opts = this._getOpts(data);
  const type = opts.sobject ? opts.sobject.getType() : opts.type;
  const id = opts.sobject ? opts.sobject.getId() : opts.id;

  opts.resource = '/sobjects/' + type + '/' + id;
  opts.method = 'GET';

  if (opts.fields) {
    if (typeof opts.fields === 'string') {
      opts.fields = [opts.fields];
    }
    opts.resource +=
      '?' + new URLSearchParams({ fields: opts.fields.join() }).toString();
  }

  return this._apiRequest(opts).then((resp) => {
    if (!opts.raw) {
      resp = new Record(resp);
      resp._reset();
    }
    return resp;
  });
};

/*
 * Blob/binary methods
 */

const BODY_GETTER_MAP = {
  document: 'getDocumentBody',
  attachment: 'getAttachmentBody',
  contentversion: 'getContentVersionData',
};

const getBody = function (data) {
  const opts = this._getOpts(data);
  const type = (
    opts.sobject ? opts.sobject.getType() : opts.type
  ).toLowerCase();
  const getter = BODY_GETTER_MAP[type];
  if (getter) {
    return this[getter](opts);
  }
  return Promise.reject(new Error('invalid type: ' + type));
};

const getAttachmentBody = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/attachment/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

const getDocumentBody = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/document/' + id + '/body';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

const getContentVersionData = function (data) {
  let opts = this._getOpts(data);
  let id = opts.sobject ? util.findId(opts.sobject) : opts.id;
  opts.resource = '/sobjects/contentversion/' + id + '/versiondata';
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

/*
 * Query
 */

const query = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      includeDeleted: false,
      raw: false,
    },
  });
  return _queryHandler.call(this, opts);
};

const queryAll = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      raw: false,
    },
  });
  opts.includeDeleted = true;
  return _queryHandler.call(this, opts);
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

const _queryHandler = function (data) {
  const recs = [];
  const opts = this._getOpts(data);

  opts.method = 'GET';
  opts.resource = '/query';

  if (opts.includeDeleted) {
    opts.resource += 'All';
  }

  opts.qs = {
    q: opts.query,
  };

  const handleResponse = (respCandidate) => {
    let resp = respToJson(respCandidate);
    if (resp.records && resp.records.length > 0) {
      resp.records.forEach((r) => {
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
      return this.getUrl({ url: resp.nextRecordsUrl, oauth: opts.oauth }).then(
        (res2) => handleResponse(res2),
      );
    }
    resp.records = recs;
    return resp;
  };

  return this._apiRequest(opts).then((resp) => handleResponse(resp));
};

/*
 * Search
 */

const search = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'search',
    defaults: {
      raw: false,
    },
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
    return {
      ...resp,
      searchRecords: records.map((r) => {
        const rec = new Record(r);
        rec._reset();
        return rec;
      }),
    };
  });
};

/**
 * Ensure a URI or path fragment begins with a leading forward slash.
 * @param {string} uri - The URI or path fragment to normalize; may be falsy.
 * @returns {string} A URI that starts with `'/'` (returns `'/'` when `uri` is falsy).
 */

function requireForwardSlash(uri) {
  if (!uri) return '/';
  if (uri.charAt(0) !== '/') {
    return '/' + uri;
  }
  return uri;
}

const _urlRequest = function (data, method) {
  let opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = method;
  if ((method === 'PUT' || method === 'POST') &&
      opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

const getUrl = function (data) {
  return _urlRequest.call(this, data, 'GET');
};

const putUrl = function (data) {
  return _urlRequest.call(this, data, 'PUT');
};

const postUrl = function (data) {
  return _urlRequest.call(this, data, 'POST');
};

const deleteUrl = function (data) {
  return _urlRequest.call(this, data, 'DELETE');
};

/*
 * Apex REST
 */

const apexRest = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'uri',
  });
  const apexPath = opts.uri.startsWith('/') ? opts.uri.substring(1) : opts.uri;
  opts.uri = opts.oauth.instance_url + '/services/apexrest/' + apexPath;
  opts.method = opts.method || 'GET';
  if (opts.urlParams) {
    opts.qs = opts.urlParams;
  }
  return this._apiRequest(opts);
};

/*
 * Streaming API
 */

const createStreamClient = function (data) {
  let opts = this._getOpts(data, {
    defaults: {
      apiVersion: this.apiVersion,
      timeout: null,
      retry: null,
    },
  });
  return new FDCStream.Client(opts);
};

const subscribe = function (data) {
  let opts = this._getOpts(data, {
    singleProp: 'topic',
    defaults: {
      timeout: null,
      retry: null,
    },
  });

  let client = this.createStreamClient(opts);
  return client.subscribe(opts);
};

/**
 * @deprecated Use subscribe() instead. Will be removed in the next major version.
 * @param {*} data - Subscription options (passed through to subscribe()).
 * @returns {Subscription}
 */
const stream = function (data) {
  return this.subscribe(data);
};

module.exports = {
  _getOpts,
  getPasswordStatus,
  updatePassword,
  getIdentity,
  getVersions,
  getResources,
  getSObjects,
  getMetadata,
  getDescribe,
  getLimits,
  insert,
  update,
  upsert,
  delete: _delete,
  getRecord,
  getBody,
  getAttachmentBody,
  getDocumentBody,
  getContentVersionData,
  query,
  queryAll,
  search,
  getUrl,
  putUrl,
  postUrl,
  deleteUrl,
  apexRest,
  createStreamClient,
  subscribe,
  stream,
};
