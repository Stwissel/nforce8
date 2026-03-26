'use strict';

const util = require('./util');
const errors = require('./errors');
const optionHelper = require('./optionhelper')();

/*
 * Helper functions for request checks
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

function addSObjectAndId(body, sobject) {
  if (sobject) {
    if (sobject._reset) {
      sobject._reset();
    }
    if (body && typeof body === 'object' && body.id) {
      sobject.setId(body.id);
    }
  }
  return body;
}

/*
 * Auth request — used for OAuth token endpoints
 */
const _apiAuthRequest = function (opts) {
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
      if (jBody.access_token && this.mode === 'single') {
        Object.assign(this.oauth || (this.oauth = {}), jBody);
      }
      return jBody;
    });
};

/*
 * API request — used for all Salesforce REST API calls
 */
const _apiRequest = function (opts) {
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
        this.autoRefresh === true &&
        (opts.oauth.refresh_token ||
          (this.getUsername() && this.getPassword())) &&
        !opts._retryCount
      ) {
        return this.autoRefreshToken(opts).then((res) => {
          opts._refreshResult = res;
          opts._retryCount = 1;
          return this._apiRequest(opts);
        });
      }
      throw err;
    });
};

module.exports = {
  _apiAuthRequest,
  _apiRequest
};
