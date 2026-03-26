"use strict";

const Record = require("./lib/record");
const util = require("./lib/util");
const CONST = require("./lib/constants");
const { validateConnectionOptions } = require("./lib/connection");
const { plugin, plugins } = require("./lib/plugin");
const httpMethods = require("./lib/http");
const authMethods = require("./lib/auth");
const apiMethods = require("./lib/api");

/*****************************
 * connection object
 *****************************/

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
        pname === "__proto__" ||
        pname === "constructor" ||
        pname === "prototype"
      ) {
        throw new Error("invalid plugin name: " + pname);
      }
      if (!plugins[pname]) throw new Error("plugin " + pname + " not found");
      this[pname] = { ...plugins[pname]._fns };
      for (const key of Object.keys(this[pname])) {
        this[pname][key] = this[pname][key].bind(this);
      }
    });
  }
};

// Mix in prototype methods from domain modules
Object.assign(Connection.prototype, httpMethods, authMethods, apiMethods);

/*****************************
 * exports
 *****************************/

const createConnection = (opts) => new Connection(opts);

const createSObject = function (type, fields) {
  const data = fields || {};
  data.attributes = {
    type: type,
  };
  const rec = new Record(data);
  return rec;
};

const version = require("./package.json").version;
const API_VERSION = require("./package.json").sfdx.api;
module.exports = {
  util: util,
  plugin: plugin,
  Record: Record,
  version: version,
  API_VERSION: API_VERSION,
  createConnection: createConnection,
  createSObject: createSObject,
};
