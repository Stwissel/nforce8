'use strict';

const Record = require('./record');
const FDCStream = require('./fdcstream');
const util = require('./util');
const errors = require('./errors');
const multipart = require('./multipart');
const CONST = require('./constants');

/**
 * Normalize API method input into a data object with OAuth credentials.
 * Handles single-property shorthand, default merging, and single-mode OAuth injection.
 * @param {object|string} input - User-provided data object or single property value.
 * @param {object} [opts] - Config: `singleProp` (field name for non-object input), `defaults`.
 * @returns {object} Normalized data object with `oauth` attached.
 * @throws {Error} If in single-user mode and no OAuth token has been set.
 */
const _getOpts = function (input, opts = {}) {
  let data = {};

  if (opts.singleProp && input && !util.isObject(input)) {
    data[opts.singleProp] = input;
  } else if (util.isObject(input)) {
    data = input;
  }

  if (this.mode === CONST.SINGLE_MODE && !data.oauth) {
    if (!this.oauth) {
      throw new Error(
        'Connection is in single-user mode but no OAuth token has been set. ' +
        'Call authenticate() first.'
      );
    }
    data.oauth = this.oauth;
  }

  if (opts.defaults && util.isObject(opts.defaults)) {
    data = Object.assign({}, opts.defaults, data);
  }
  return data;
};

/**
 * Build a /sobjects/... resource path from segments.
 */
const sobjectPath = (...segments) =>
  '/sobjects/' + segments.filter(Boolean).join('/');

/**
 * Resolve the Salesforce record ID from either an sobject or a plain opts hash.
 * Uses util.findId so all ID casing variants (Id, id, ID) are handled uniformly.
 */
function resolveId(opts) {
  return opts.sobject ? util.findId(opts.sobject) : opts.id;
}

/**
 * Resolve the Salesforce record type from either an sobject or a plain opts hash.
 */
function resolveType(opts) {
  return opts.sobject ? opts.sobject.getType() : opts.type;
}

/**
 * Get the password expiration status for a user.
 * @param {object|string} data - Options with `id` (user ID), or the ID string directly.
 * @returns {Promise<object>} Password status response.
 */
const getPasswordStatus = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'id',
  });

  const id = resolveId(opts);
  opts.resource = sobjectPath('user', id, 'password');
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/**
 * Update (reset) a user's password.
 * @param {object} data - Options with `id` (user ID) and `newPassword`.
 * @returns {Promise<object>} API response.
 */
const updatePassword = function (data) {
  const opts = this._getOpts(data);
  const id = resolveId(opts);
  opts.resource = sobjectPath('user', id, 'password');
  opts.method = 'POST';
  opts.body = JSON.stringify({ newPassword: opts.newPassword });
  return this._apiRequest(opts);
};

/**
 * Retrieve the identity information for the authenticated user.
 * @param {object} data - Options with `oauth` (must include `access_token` and `id` URL).
 * @returns {Promise<object>} Identity response from Salesforce.
 */
const getIdentity = function (data) {
  const opts = this._getOpts(data);
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

/**
 * List available Salesforce REST API versions.
 * @param {object} data - Options with `oauth`.
 * @returns {Promise<object[]>} Array of version descriptors.
 */
const getVersions = function (data) {
  const opts = this._getOpts(data);
  if (opts.oauth && opts.oauth.instance_url) {
    opts.uri = opts.oauth.instance_url + '/services/data/';
  } else {
    opts.uri = new URL(this.loginUri).origin + '/services/data/';
  }
  opts.method = 'GET';
  return this._apiAuthRequest(opts);
};

/**
 * List available REST API resources for the configured API version.
 * @param {object} data - Options with `oauth`.
 * @returns {Promise<object>} Map of resource names to URI paths.
 */
const getResources = function (data) {
  const opts = this._getOpts(data);
  opts.resource = '/';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/**
 * List all SObject types available in the org.
 * @param {object} data - Options with `oauth`.
 * @returns {Promise<object>} Response with `sobjects` array.
 */
const getSObjects = function (data) {
  const opts = this._getOpts(data);
  opts.resource = '/sobjects';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/**
 * Get basic metadata for an SObject type.
 * @param {object|string} data - Options with `type`, or the type string directly.
 * @returns {Promise<object>} SObject metadata.
 */
const getMetadata = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'type',
  });
  opts.resource = sobjectPath(opts.type);
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/**
 * Get the full describe (fields, relationships, etc.) for an SObject type.
 * @param {object|string} data - Options with `type`, or the type string directly.
 * @returns {Promise<object>} Full SObject describe result.
 */
const getDescribe = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'type',
  });
  opts.resource = sobjectPath(opts.type, 'describe');
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/**
 * Get the org's API usage limits.
 * @param {object} data - Options with `oauth`.
 * @returns {Promise<object>} Limits keyed by limit name.
 */
const getLimits = function (data) {
  const opts = this._getOpts(data);
  opts.resource = '/limits';
  opts.method = 'GET';
  return this._apiRequest(opts);
};

/*
 * CRUD methods
 */

/**
 * Attach either a multipart form or a JSON body to the request options,
 * based on whether the SObject type requires multipart (document, attachment, contentversion).
 * @param {object} opts - Request options (mutated in place).
 * @param {string} type - Lowercased SObject type string.
 * @param {Function} payloadFn - Zero-argument function returning the payload object.
 */
function applyBody(opts, type, payloadFn) {
  if (CONST.MULTIPART_TYPES.includes(type)) {
    opts.multipart = multipart(opts);
  } else {
    opts.body = JSON.stringify(payloadFn());
  }
}

/**
 * Insert a new SObject record.
 * @param {object} data - Options with `sobject` (Record instance) and `oauth`.
 * @returns {Promise<object>} Response with `id` and `success`.
 * @throws {Error} If `sobject` is missing.
 */
const insert = function (data) {
  const opts = this._getOpts(data);
  if (!opts.sobject) {
    throw new Error('insert requires opts.sobject');
  }
  const type =opts.sobject.getType();
  opts.resource = sobjectPath(type);
  opts.method = 'POST';
  applyBody(opts, type, () => opts.sobject.toPayload());
  return this._apiRequest(opts);
};

/**
 * Update an existing SObject record (sends only changed fields).
 * @param {object} data - Options with `sobject` (Record instance with ID set) and `oauth`.
 * @returns {Promise<object>} API response.
 */
const update = function (data) {
  const opts = this._getOpts(data);
  const type =opts.sobject.getType();
  const id =opts.sobject.getId();
  opts.resource = sobjectPath(type, id);
  opts.method = 'PATCH';
  applyBody(opts, type, () => opts.sobject.toChangedPayload());
  return this._apiRequest(opts);
};

/**
 * Upsert an SObject record using an external ID field.
 * @param {object} data - Options with `sobject` (Record with external ID set) and `oauth`.
 * @returns {Promise<object>} API response.
 */
const upsert = function (data) {
  const opts = this._getOpts(data);
  const type =opts.sobject.getType();
  const extIdField = opts.sobject.getExternalIdField();
  const extId =opts.sobject.getExternalId();
  opts.resource = sobjectPath(type, extIdField, extId);
  opts.method = 'PATCH';
  applyBody(opts, type, () => opts.sobject.toPayload());
  return this._apiRequest(opts);
};

/**
 * Delete an SObject record.
 * @param {object} data - Options with `sobject` (Record with ID set) and `oauth`.
 * @returns {Promise<object>} API response.
 */
const _delete = function (data) {
  const opts = this._getOpts(data);
  const type =opts.sobject.getType();
  const id =opts.sobject.getId();
  opts.resource = sobjectPath(type, id);
  opts.method = 'DELETE';
  return this._apiRequest(opts);
};

/**
 * Retrieve a single SObject record by type and ID.
 * @param {object} data - Options: `type`/`sobject`, `id`, optional `fields` (string or array), `raw`.
 * @returns {Promise<Record|object>} A Record instance, or raw response if `raw: true`.
 */
const getRecord = function (data) {
  const opts = this._getOpts(data);
  const type = resolveType(opts);
  const id = resolveId(opts);

  opts.resource = sobjectPath(type, id);
  opts.method = 'GET';

  if (opts.fields) {
    if (typeof opts.fields === 'string') {
      opts.fields = [opts.fields];
    }
    opts.resource +=
      '?' + new URLSearchParams({ fields: opts.fields.join() }).toString();
  }

  return this._apiRequest(opts).then((resp) => {
    return opts.raw ? resp : Record.fromResponse(resp);
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

/**
 * Retrieve binary content (attachment, document, or content version data) by SObject type.
 * Dispatches to getAttachmentBody, getDocumentBody, or getContentVersionData.
 * @param {object} data - Options with `sobject` or `type` and `id`, plus `oauth`.
 * @returns {Promise<ArrayBuffer>} The binary content.
 */
const getBinaryContent = function (data) {
  const opts = this._getOpts(data);
  const type = (resolveType(opts) || '').toLowerCase();
  const getter = BODY_GETTER_MAP[type];
  if (getter) {
    return this[getter](opts);
  }
  return Promise.reject(new Error('invalid type: ' + type));
};

/**
 * Retrieve the binary body of an Attachment record.
 * @param {object} data - Options with `id` and `oauth`.
 * @returns {Promise<ArrayBuffer>} Attachment binary data.
 */
const getAttachmentBody = function (data) {
  const opts = this._getOpts(data);
  const id = resolveId(opts);
  opts.resource = sobjectPath('attachment', id, 'body');
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

/**
 * Retrieve the binary body of a Document record.
 * @param {object} data - Options with `id` and `oauth`.
 * @returns {Promise<ArrayBuffer>} Document binary data.
 */
const getDocumentBody = function (data) {
  const opts = this._getOpts(data);
  const id = resolveId(opts);
  opts.resource = sobjectPath('document', id, 'body');
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

/**
 * Retrieve the binary version data of a ContentVersion record.
 * @param {object} data - Options with `id` and `oauth`.
 * @returns {Promise<ArrayBuffer>} ContentVersion binary data.
 */
const getContentVersionData = function (data) {
  const opts = this._getOpts(data);
  const id = resolveId(opts);
  opts.resource = sobjectPath('contentversion', id, 'versiondata');
  opts.method = 'GET';
  opts.blob = true;
  return this._apiRequest(opts);
};

/*
 * Query
 */

/**
 * Execute a SOQL query. Optionally fetches all pages when `fetchAll: true`.
 * @param {object|string} data - Options with `query` (SOQL string), or the query string directly.
 *   Optional: `fetchAll`, `includeDeleted`, `raw`, `oauth`.
 * @returns {Promise<object>} Query result with `records` array (Record instances unless `raw: true`).
 */
const query = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'query',
    defaults: {
      fetchAll: false,
      includeDeleted: false,
      raw: false,
    },
  });
  return _queryHandler.call(this, opts);
};

/**
 * Execute a SOQL query that includes deleted/archived records (queryAll).
 * @param {object|string} data - Options with `query` (SOQL string), or the query string directly.
 *   Optional: `fetchAll`, `raw`, `oauth`.
 * @returns {Promise<object>} Query result with `records` array.
 */
const queryAll = function (data) {
  const opts = this._getOpts(data, {
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
        recs.push(opts.raw ? r : Record.fromResponse(r));
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

/**
 * Execute a SOSL search.
 * @param {object|string} data - Options with `search` (SOSL string), or the search string directly.
 *   Optional: `raw`, `oauth`.
 * @returns {Promise<object>} Search result with `searchRecords` array (Record instances unless `raw: true`).
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
      searchRecords: records.map((r) => Record.fromResponse(r)),
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

/**
 * Make a raw HTTP request to a Salesforce instance URL.
 * @param {object} data - Options with `url` (path or full URL) and `oauth`.
 * @param {string} method - HTTP method (GET, PUT, POST, DELETE).
 * @returns {Promise<object|string>} Parsed response.
 */
const _urlRequest = function (data, method) {
  const opts = this._getOpts(data, { singleProp: 'url' });
  opts.uri = opts.oauth.instance_url + requireForwardSlash(opts.url);
  opts.method = method;
  if ((method === 'PUT' || method === 'POST') &&
      opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  return this._apiRequest(opts);
};

/** GET a Salesforce instance URL. @see _urlRequest */
const getUrl = function (data) {
  return _urlRequest.call(this, data, 'GET');
};

/** PUT to a Salesforce instance URL. @see _urlRequest */
const putUrl = function (data) {
  return _urlRequest.call(this, data, 'PUT');
};

/** POST to a Salesforce instance URL. @see _urlRequest */
const postUrl = function (data) {
  return _urlRequest.call(this, data, 'POST');
};

/** DELETE a Salesforce instance URL. @see _urlRequest */
const deleteUrl = function (data) {
  return _urlRequest.call(this, data, 'DELETE');
};

/**
 * Call a custom Apex REST endpoint.
 * @param {object|string} data - Options with `uri` (Apex REST path), or the path string directly.
 *   Optional: `method` (default GET), `urlParams`, `body`, `oauth`.
 * @returns {Promise<object|string>} Parsed response.
 */
const apexRest = function (data) {
  const opts = this._getOpts(data, {
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

/**
 * Create a Faye-based Streaming API client.
 * @param {object} data - Options with `oauth`, optional `apiVersion`, `timeout`, `retry`.
 * @returns {FDCStream.Client} A streaming client instance.
 */
const createStreamClient = function (data) {
  const opts = this._getOpts(data, {
    defaults: {
      apiVersion: this.apiVersion,
      timeout: null,
      retry: null,
    },
  });
  return new FDCStream.Client(opts);
};

/**
 * Subscribe to a Streaming API topic (PushTopic, Platform Event, CDC, etc.).
 * @param {object|string} data - Options with `topic`, or the topic string directly.
 *   Optional: `timeout`, `retry`, `oauth`.
 * @returns {Subscription} An EventEmitter subscription (emits 'data', 'connect', 'error').
 */
const subscribe = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'topic',
    defaults: {
      timeout: null,
      retry: null,
    },
  });

  const client =this.createStreamClient(opts);
  return client.subscribe(opts);
};

/**
 * @deprecated Use subscribe() instead. Will be removed in the next major version.
 * @param {*} data - Subscription options (passed through to subscribe()).
 * @returns {Subscription}
 */
const stream = function (data) {
  process.emitWarning(
    'nforce8: stream() is deprecated and will be removed in the next major version. ' +
    'Use subscribe() instead.',
    { code: 'NFORCE8_DEPRECATED_STREAM' }
  );
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
  getBinaryContent,
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
