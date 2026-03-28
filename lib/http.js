'use strict';

const util = require('./util');
const errors = require('./errors');
const optionHelper = require('./optionhelper');
const CONST = require('./constants');

/**
 * Validate a Fetch Response for header-reported errors and for an empty body when the status indicates failure.
 * @param {Response} res - The response object returned by fetch.
 * @returns {Response} The original response when no validation errors are found.
 * @throws {Error} If `res` is falsy; if an `error` header is present (error message set and `statusCode` assigned); or if `content-length` is `'0'` while the HTTP status is not in the 200–299 range (error message indicates no body and `statusCode` assigned).
 */

function responseFailureCheck(res) {
  if (!res) {
    throw errors.emptyResponse();
  }
  const headerError = util.getHeader(res.headers, 'error');
  if (headerError) {
    const err = new Error(headerError);
    err.statusCode = res.status;
    throw err;
  }
  const contentLength = util.getHeader(res.headers, 'content-length');
  const emptyBody =
    contentLength !== undefined &&
    contentLength !== null &&
    String(contentLength) === '0';
  const notSuccess = res.status < 200 || res.status >= 300;
  if (emptyBody && notSuccess) {
    const err = new Error(
      'Salesforce returned no body and status code ' + res.status,
    );
    err.statusCode = res.status;
    throw err;
  }

  return res;
}

/**
 * Converts a non-OK HTTP response into a structured Error or returns the response unchanged.
 *
 * @param {Response} res - Fetch Response object to check.
 * @returns {Response} The original response when `res.ok` is true.
 * @throws {Error} When `res.ok` is false. The error's `statusCode` is set to the response status. If the parsed body is a non-empty array, `message` and `errorCode` come from the first element and `body` contains the full array; if the body is a string, `message`, `errorCode`, and `body` are that string; otherwise `message` indicates an unrecognized error and `body` contains the parsed value.
 */
function unsuccessfulResponseCheck(res) {
  if (res.ok) {
    return res;
  }

  return (util.isJsonResponse(res) ? res.json() : res.text()).then((body) => {
    const e = new Error();
    e.statusCode = res.status;

    if (Array.isArray(body) && body.length > 0) {
      e.message = body[0].message;
      e.errorCode = body[0].errorCode;
      e.body = body;
    } else if (typeof body === 'string') {
      e.message = body;
      e.errorCode = body;
      e.body = body;
    } else {
      e.message = 'Salesforce returned an unrecognized error ' + res.status;
      e.body = body;
    }

    throw e;
  });
}

/**
 * If an sobject is provided, resets it (when `reset` exists) and assigns its id from `body.id`.
 * @param {*} body - The response body that may contain an `id` property.
 * @param {object} [sobject] - The sobject to operate on; if present, `reset()` will be called when available and `setId(id)` will be called with `body.id` when present.
 * @returns {*} The original `body`.
 */
function addSObjectAndId(body, sobject) {
  if (sobject) {
    if (typeof sobject.reset === 'function') {
      sobject.reset();
    }
    if (body && typeof body === 'object' && body.id) {
      sobject.setId(body.id);
    }
  }
  return body;
}

/**
 * Build an AbortSignal that fires after `timeout` ms, optionally
 * combining it with a caller-supplied signal.
 * @param {AbortSignal|undefined} existingSignal - Optional caller-provided signal.
 * @param {number|undefined} timeout - Milliseconds; falsy means no timeout.
 * @returns {AbortSignal|undefined} Combined signal, timeout-only signal, or the original.
 */
function buildSignal(existingSignal, timeout) {
  if (!timeout) return existingSignal;
  const timeoutSignal = AbortSignal.timeout(timeout);
  return existingSignal !== undefined
    ? AbortSignal.any([timeoutSignal, existingSignal])
    : timeoutSignal;
}

/**
 * Execute an HTTP request against a Salesforce OAuth token endpoint.
 * In single-user mode, caches the returned access_token on the connection.
 * @param {object} opts - Request options including `uri`, `method`, `headers`, `body`.
 * @returns {Promise<object>} Parsed JSON response body.
 */
const _apiAuthRequest = function (opts) {
  if (opts.requestOpts) {
    Object.assign(opts, opts.requestOpts);
  }

  opts.signal = buildSignal(opts.signal, this.timeout);

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
      if (jBody.access_token && this.mode === CONST.SINGLE_MODE) {
        Object.assign(this.oauth || (this.oauth = {}), jBody);
      }
      return jBody;
    });
};

/**
 * Execute an HTTP request against the Salesforce REST API.
 * Handles response validation, JSON/blob parsing, sobject ID assignment,
 * and automatic token refresh on INVALID_SESSION_ID / Bad_OAuth_Token.
 * @param {object} opts - Request options including `oauth`, `resource`, `method`, `body`.
 * @returns {Promise<object|ArrayBuffer|string>} Parsed response body.
 */
const _apiRequest = function (opts) {
  const ropts = optionHelper.getApiRequestOptions(opts);

  ropts.signal = buildSignal(ropts.signal, this.timeout);

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
        this.autoRefresh === true &&
        (opts.oauth?.refresh_token ||
          (this.username && this.password)) &&
        !opts._retryCount
      ) {
        return this.autoRefreshToken(opts).then(() => {
          opts._retryCount = 1;
          return this._apiRequest(opts);
        });
      }
      throw err;
    });
};

module.exports = {
  _apiAuthRequest,
  _apiRequest,
  _buildSignal: buildSignal,
};
