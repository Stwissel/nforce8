"use strict";

const util = require("./util");

const plugins = Object.create(null);

/**
 * Create a plugin instance for a specific namespace.
 * @param {Object} opts - Initialization options.
 * @param {string} opts.namespace - The plugin's unique namespace.
 */
function Plugin(opts) {
  this.namespace = opts.namespace;
  this._fns = Object.create(null);
  this.util = { ...util };
}

const RESERVED_NAMES = ["__proto__", "constructor", "prototype"];

Plugin.prototype.fn = function (fnName, fn) {
  if (typeof fn !== "function") {
    throw new Error("invalid function provided");
  }
  if (typeof fnName !== "string") {
    throw new Error("invalid function name provided");
  }
  if (RESERVED_NAMES.includes(fnName)) {
    throw new Error("invalid function name: " + fnName);
  }
  this._fns[fnName] = fn;

  return this;
};

const plugin = (opts) => {
  if (typeof opts === "string") {
    opts = { namespace: opts };
  }
  if (!opts || !opts.namespace) {
    throw new Error("no namespace provided for plugin");
  }
  opts = Object.assign({ override: false }, opts);
  if (plugins[opts.namespace] && opts.override !== true) {
    throw new Error(
      "a plugin with namespace " + opts.namespace + " already exists",
    );
  }
  plugins[opts.namespace] = new Plugin(opts);
  return plugins[opts.namespace];
};

module.exports = { plugin, plugins, Plugin };
