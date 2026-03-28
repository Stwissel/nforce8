'use strict';

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

const _authEndpoint = function (opts = {}) {
  if (opts.authEndpoint) return opts.authEndpoint;
  return this.environment === 'sandbox' ? this.testAuthEndpoint : this.authEndpoint;
};

const _loginEndpoint = function () {
  return this.environment === 'sandbox' ? this.testLoginUri : this.loginUri;
};

const _revokeEndpoint = function () {
  return this.environment === 'sandbox' ? this.testRevokeUri : this.revokeUri;
};

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
 * Use after a token refresh operation.
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
 * Resolve with OAuth without notifying the onRefresh callback.
 * Use after initial authentication (not a refresh).
 */
const _resolveOAuth = function (newOauth) {
  return Promise.resolve(newOauth);
};

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
    if (this.mode === 'single') {
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
    return this._resolveOAuth(newOauth);
  });
};

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
  _resolveOAuth,
  authenticate,
  refreshToken,
  revokeToken,
  autoRefreshToken,
};
