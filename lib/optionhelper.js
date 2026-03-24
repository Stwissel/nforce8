'use strict';

const CONST = require('./constants');
const url = require('url');
/**
 * Utility function to transfer incoming options into complete options
 * based on default values
 *
 */

function OptionHelper() {
  // Defaults if needed

  // Cleanup the options for an API Request
  function getApiRequestOptions(opts) {
    // The resulting options
    const ropts = {};

    const apiVersion = opts.apiVersion || CONST.defaultOptions.apiVersion;

    // Define the URI to call
    if (opts.uri) {
      ropts.uri = opts.uri;
    } else {
      if (!opts.resource || opts.resource.charAt(0) !== '/') {
        opts.resource = '/' + (opts.resource || '');
      }
      ropts.uri = [
        opts.oauth.instance_url,
        '/services/data/',
        apiVersion,
        opts.resource
      ].join('');
    }

    ropts.method = opts.method || 'GET';

    // set accept headers
    ropts.headers = {
      Accept: 'application/json;charset=UTF-8'
    };

    // set oauth header
    if (opts.oauth) {
      ropts.headers.Authorization = 'Bearer ' + opts.oauth.access_token;
    }

    // set content-type and body
    if (opts.multipart) {
      ropts.body = opts.multipart;
    } else {
      ropts.headers['content-type'] = 'application/json';
      if (opts.body) {
        ropts.body = opts.body;
      }
    }

    // set additional user-supplied headers
    if (opts.headers) {
      Object.assign(ropts.headers, opts.headers);
    }

    // process qs
    if (opts.qs) {
      ropts.qs = opts.qs;
    }

    // process request opts
    if (opts.requestOpts) {
      Object.assign(ropts, opts.requestOpts);
    }

    return ropts;
  }

  function getFullUri(opts) {
    let result = new url.URL(opts.uri);
    if (opts.qs) {
      let params = opts.qs;
      Object.keys(params).forEach((key) =>
        result.searchParams.append(key, params[key])
      );
    }
    return result;
  }

  return Object.freeze({ getApiRequestOptions, getFullUri });
}

module.exports = OptionHelper;
