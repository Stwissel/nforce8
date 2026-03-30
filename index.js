'use strict';

const Record = require('./lib/record');
const util = require('./lib/util');
const CONST = require('./lib/constants');
const { validateConnectionOptions } = require('./lib/connection');
const { plugin, plugins } = require('./lib/plugin');
const httpMethods = require('./lib/http');
const authMethods = require('./lib/auth');
const apiMethods = require('./lib/api');

/**
 * Salesforce REST API connection. Holds configuration, credentials, and exposes
 * all API methods (auth, CRUD, query, streaming) on its prototype.
 * @param {object} opts - Connection options: clientId, clientSecret, redirectUri,
 *   environment, mode, apiVersion, autoRefresh, onRefresh, timeout, plugins, etc.
 */
const Connection = function (opts) {
  opts = Object.assign({}, CONST.defaultOptions, opts || {});

  Object.assign(this, opts);

  validateConnectionOptions(this);

  this.environment = this.environment.toLowerCase();
  this.mode = this.mode.toLowerCase();

  // parse timeout into integer in case it's a floating point.
  this.timeout = parseInt(this.timeout, 10);

  // load plugins
  if (opts.plugins && Array.isArray(opts.plugins)) {
    opts.plugins.forEach((pname) => {
      // Prevent prototype pollution via malicious plugin names
      if (
        pname === '__proto__' ||
        pname === 'constructor' ||
        pname === 'prototype'
      ) {
        throw new Error('invalid plugin name: ' + pname);
      }
      if (!plugins[pname]) throw new Error('plugin ' + pname + ' not found');
      this[pname] = { ...plugins[pname]._fns };
      for (const key of Object.keys(this[pname])) {
        this[pname][key] = this[pname][key].bind(this);
      }
    });
  }
};

// Mix in prototype methods from domain modules
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);

// Deprecation shim for renamed method
Connection.prototype.getBody = function (data) {
  process.emitWarning(
    'getBody() is deprecated. Use getBinaryContent() instead.',
    { code: 'NFORCE8_DEPRECATED_GETBODY', type: 'DeprecationWarning' }
  );
  return this.getBinaryContent(data);
};

/*****************************
 * exports
 *****************************/

/**
 * Create a new Salesforce connection instance.
 * @param {object} opts - Connection options (see Connection constructor).
 * @returns {Connection}
 */
const createConnection = (opts) => new Connection(opts);

/**
 * Create a new SObject Record instance.
 * @param {string} type - SObject type name (e.g. 'Account', 'ContentVersion').
 * @param {object} [fields] - Initial field values.
 * @returns {Record}
 */
const createSObject = (type, fields) => {
  const data = fields || {};
  data.attributes = {
    type: type,
  };
  return new Record(data);
};

const version = require('./package.json').version;
const API_VERSION = CONST.API;
module.exports = {
  util: util,
  plugin: plugin,
  Record: Record,
  version: version,
  API_VERSION: API_VERSION,
  createConnection: createConnection,
  createSObject: createSObject,
};
