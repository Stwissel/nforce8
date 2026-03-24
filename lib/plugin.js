'use strict';

const util = require('./util');

const plugins = {};

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

module.exports = { plugin, plugins, Plugin };
