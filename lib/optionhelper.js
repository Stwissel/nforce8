'use strict';

const CONST = require('./constants');
/**
 * Create an immutable helper providing utilities for building API request options and full URIs.
 * @returns {{getApiRequestOptions: function, getFullUri: function}} An immutable object exposing helper functions for constructing request options and full URLs.
 */

/**
 * Build request options suitable for an API call by applying defaults and merging provided values.
 * @param {Object} opts - Input options used to construct the request.
 * @param {string} [opts.uri] - Full request URI; when present, used as-is instead of constructing from oauth/resource.
 * @param {string} [opts.resource] - API resource path; will be prefixed with '/' if missing when used to build a URI.
 * @param {Object} [opts.oauth] - OAuth info; when provided, its `instance_url` and `access_token` are used for URI and Authorization header.
 * @param {string} [opts.apiVersion] - API version to use when constructing a URI; falls back to module default if omitted.
 * @param {string} [opts.method] - HTTP method; defaults to 'GET'.
 * @param {Object|FormData} [opts.multipart] - Multipart body; when present it is assigned to the request body.
 * @param {*} [opts.body] - Request body used when `multipart` is not provided.
 * @param {Object} [opts.headers] - Additional headers to merge into the generated headers.
 * @param {Object} [opts.qs] - Query string parameters to attach to the request options.
 * @param {Object} [opts.requestOpts] - Additional request-level options to merge into the resulting options object.
 * @returns {Object} A request options object containing at least `uri`, `method`, `headers` and any applicable `body`, `qs`, and merged request options.
 */

/**
 * Create a URL instance from opts.uri and append query parameters from opts.qs.
 * @param {Object} opts - Input containing the URI and optional query parameters.
 * @param {string} opts.uri - Base URI to convert into a URL instance.
 * @param {Object} [opts.qs] - Key/value pairs to append to the URL's search parameters.
 * @returns {URL} A URL instance with the provided query parameters appended.
 */

function OptionHelper() {
  // Defaults if needed

  /**
   * Build and normalize HTTP request options for Salesforce API calls.
   *
   * Constructs a request options object containing a resolved `uri`, HTTP `method`,
   * default and merged `headers`, request `body` (or multipart body), optional query
   * parameters (`qs`), and any additional `requestOpts`.
   *
   * @param {Object} opts - Input options.
   * @param {string} [opts.apiVersion] - API version to use when composing the URI.
   * @param {string} [opts.uri] - Full request URI; when present it is used as-is.
   * @param {string} [opts.resource] - Resource path appended to the instance URL when `uri` is not provided.
   * @param {Object} [opts.oauth] - OAuth credentials object; used to build the URI and Authorization header.
   * @param {string} [opts.oauth.instance_url] - Salesforce instance base URL.
   * @param {string} [opts.oauth.access_token] - OAuth access token for the Authorization header.
   * @param {string} [opts.method] - HTTP method (defaults to `GET`).
   * @param {Object|FormData} [opts.multipart] - Multipart body; when present it becomes the request `body`.
   * @param {*} [opts.body] - Request body used when `multipart` is not provided.
   * @param {Object} [opts.headers] - Additional headers to merge into the default headers.
   * @param {Object} [opts.qs] - Query-string parameters to attach to the request.
   * @param {Object} [opts.requestOpts] - Extra request option properties to merge into the result.
   * @returns {Object} Normalized request options including `uri`, `method`, `headers`, `body` (if set), `qs` (if set), and any merged `requestOpts`.
   */
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

  /**
   * Builds a URL object from the provided URI and appends any query-string parameters.
   * @param {Object} opts - Options for constructing the URL.
   * @param {string} opts.uri - The base URI to convert into a URL instance.
   * @param {Object.<string, (string|number|boolean)>} [opts.qs] - Key/value pairs to append as query parameters.
   * @returns {URL} The constructed URL with query parameters applied.
   */
  function getFullUri(opts) {
    let result = new URL(opts.uri);
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
