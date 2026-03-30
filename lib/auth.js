'use strict';

const CONST = require('./constants');
const SAML_ASSERTION_TYPE = 'urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser';

const getOAuth = function () {
  return this.oauth;
};

const setOAuth = function (oauth) {
  this.oauth = oauth;
};

const getUsername = function () {
  return this.username;
};

const setUsername = function (username) {
  this.username = username;
};

const getPassword = function () {
  return this.password;
};

const setPassword = function (password) {
  this.password = password;
};

const getSecurityToken = function () {
  return this.securityToken;
};

const setSecurityToken = function (token) {
  this.securityToken = token;
};

/**
 * Select the production or sandbox URL based on the environment setting.
 * @param {string} environment - The connection environment (e.g. 'sandbox' or 'production').
 * @param {string} prod - The production URL.
 * @param {string} test - The sandbox/test URL.
 * @returns {string} The appropriate URL for the current environment.
 */
function resolveEndpoint(environment, prod, test) {
  return environment === CONST.SANDBOX ? test : prod;
}

const _authEndpoint = function (opts = {}) {
  if (opts.authEndpoint) return opts.authEndpoint;
  return resolveEndpoint(this.environment, this.authEndpoint, this.testAuthEndpoint);
};

const _loginEndpoint = function () {
  return resolveEndpoint(this.environment, this.loginUri, this.testLoginUri);
};

const _revokeEndpoint = function () {
  return resolveEndpoint(this.environment, this.revokeUri, this.testRevokeUri);
};

/**
 * Build the full OAuth2 authorization URI for redirecting the user to Salesforce login.
 * @param {object} [opts] - Options: responseType, display, immediate, scope, state, nonce, prompt, loginHint, urlOpts.
 * @returns {string} The complete authorization URL with query parameters.
 */
const getAuthUri = function (opts = {}) {
  let urlOpts = {
    response_type: opts.responseType || 'code',
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
  };

  if (opts.display) {
    urlOpts.display = opts.display.toLowerCase();
  }

  if (opts.immediate) {
    urlOpts.immediate = opts.immediate;
  }

  if (opts.scope) {
    if (Array.isArray(opts.scope)) {
      urlOpts.scope = opts.scope.join(' ');
    } else {
      urlOpts.scope = opts.scope;
    }
  }

  if (opts.state) {
    urlOpts.state = opts.state;
  }

  if (opts.nonce) {
    urlOpts.nonce = opts.nonce;
  }

  if (opts.prompt) {
    if (Array.isArray(opts.prompt)) {
      urlOpts.prompt = opts.prompt.join(' ');
    } else {
      urlOpts.prompt = opts.prompt;
    }
  }

  if (opts.loginHint) {
    urlOpts.login_hint = opts.loginHint;
  }

  if (opts.urlOpts) {
    Object.assign(urlOpts, opts.urlOpts);
  }

  return this._authEndpoint(opts) + '?' + new URLSearchParams(urlOpts).toString();
};

/**
 * Notify the onRefresh callback if configured, then resolve with the updated OAuth.
 * Used after a token refresh operation.
 * @param {object} newOauth - The newly obtained OAuth credentials.
 * @param {object} oldOauth - The previous OAuth credentials (passed to onRefresh).
 * @returns {Promise<object>} Resolves with `newOauth`.
 */
const _notifyAndResolve = function (newOauth, oldOauth) {
  if (this.onRefresh) {
    return new Promise((resolve, reject) => {
      this.onRefresh.call(this, newOauth, oldOauth, (err) => {
        if (err) reject(err);
        else resolve(newOauth);
      });
    });
  }
  return Promise.resolve(newOauth);
};

/**
 * Authenticate with Salesforce using authorization code, SAML assertion, or username/password.
 * @param {object} data - Auth options: code, assertion, username, password, securityToken, oauth.
 * @returns {Promise<object>} Resolves with the OAuth credentials object.
 */
const authenticate = function (data) {
  const opts = Object.assign(
    { oauth: {} },
    this._getOpts(data),
  );

  opts.uri = this._loginEndpoint();
  opts.method = 'POST';
  opts.headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const bopts = {
    client_id: this.clientId,
    client_secret: this.clientSecret,
  };

  if (opts.code) {
    bopts.grant_type = 'authorization_code';
    bopts.code = opts.code;
    bopts.redirect_uri = this.redirectUri;
  } else if (opts.assertion) {
    bopts.grant_type = 'assertion';
    bopts.assertion_type = SAML_ASSERTION_TYPE;
    bopts.assertion = opts.assertion;
  } else if (opts.username || this.username) {
    bopts.grant_type = 'password';
    bopts.username = opts.username || this.username;
    bopts.password = opts.password || this.password;
    if (opts.securityToken || this.securityToken) {
      bopts.password += opts.securityToken || this.securityToken;
    }
    if (this.mode === CONST.SINGLE_MODE) {
      this.username = opts.username || this.username;
      this.password = opts.password || this.password;
      if (opts.securityToken) {
        this.securityToken = opts.securityToken;
      }
    }
  }

  opts.body = new URLSearchParams(bopts).toString();

  return this._apiAuthRequest(opts).then((res) => {
    const newOauth = { ...opts.oauth, ...res };
    if (opts.assertion) newOauth.assertion = opts.assertion;
    return newOauth;
  });
};

/**
 * Refresh the OAuth access token using a refresh_token or SAML assertion.
 * Calls the onRefresh callback if configured on the connection.
 * @param {object} data - Options including `oauth` with `refresh_token` or `assertion`.
 * @returns {Promise<object>} Resolves with updated OAuth credentials.
 */
const refreshToken = function (data) {
  const opts = this._getOpts(data);

  opts.uri = this._loginEndpoint();
  opts.method = 'POST';

  const refreshOpts = {
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
  };

  const oauthRefreshToken = opts.oauth.refresh_token;
  const oauthAssertion = opts.oauth.assertion;
  const optsAssertion = opts.assertion;

  if (!oauthRefreshToken && (oauthAssertion || optsAssertion)) {
    refreshOpts.grant_type = 'assertion';
    refreshOpts.assertion_type = SAML_ASSERTION_TYPE;
    refreshOpts.assertion = optsAssertion || oauthAssertion;
  } else if (oauthRefreshToken) {
    refreshOpts.grant_type = 'refresh_token';
    refreshOpts.refresh_token = oauthRefreshToken;
  } else {
    return Promise.reject(
      new Error(
        'refreshToken requires opts.oauth.refresh_token or opts.oauth.assertion / opts.assertion',
      ),
    );
  }

  if (this.clientSecret) {
    refreshOpts.client_secret = this.clientSecret;
  }

  opts.body = new URLSearchParams(refreshOpts).toString();
  opts.headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  return this._apiAuthRequest(opts).then((res) => {
    const old = { ...opts.oauth };
    const newOauth = { ...opts.oauth, ...res };
    if (opts.assertion) newOauth.assertion = opts.assertion;
    return this._notifyAndResolve(newOauth, old);
  });
};

/**
 * Revoke an OAuth access or refresh token.
 * @param {object|string} data - Options with `token` property, or the token string directly.
 * @returns {Promise<object>} Resolves with the revocation response.
 */
const revokeToken = function (data) {
  const opts = this._getOpts(data, {
    singleProp: 'token'
  });

  opts.uri = this._revokeEndpoint();
  const params = { token: opts.token };
  if (opts.callbackParam) {
    params.callback = opts.callbackParam;
  }
  opts.uri += '?' + new URLSearchParams(params).toString();
  return this._apiAuthRequest(opts);
};

/**
 * Automatically refresh the token, choosing between refreshToken() and authenticate()
 * based on whether a refresh_token or assertion is available in the OAuth credentials.
 * @param {object} data - Options including `oauth`.
 * @returns {Promise<object>} Resolves with refreshed OAuth credentials.
 */
const autoRefreshToken = function (data) {
  const opts = this._getOpts(data);

  const refreshOpts = {
    oauth: opts.oauth,
  };

  if (opts.oauth.refresh_token || opts.oauth.assertion) {
    return this.refreshToken(refreshOpts);
  }
  return this.authenticate(refreshOpts);
};

module.exports = {
  getOAuth,
  setOAuth,
  getUsername,
  setUsername,
  getPassword,
  setPassword,
  getSecurityToken,
  setSecurityToken,
  _authEndpoint,
  _loginEndpoint,
  _revokeEndpoint,
  getAuthUri,
  _notifyAndResolve,
  authenticate,
  refreshToken,
  revokeToken,
  autoRefreshToken,
};
