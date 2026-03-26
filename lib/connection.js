'use strict';

// ES6 Version of Connection object
const CONST = require('./constants');
const util = require('./util');

class Connection {
  oauth;
  username;
  password;
  securityToken;

  constructor(opts) {
    opts = Object.assign({}, CONST.defaultOptions, opts);
    Object.assign(this, opts);
    validateConnectionOptions(this);
    this.environment = this.environment.toLowerCase();
    this.mode = this.mode.toLowerCase();
  }
}

// Simplified options validation
const optionTest = (testFunction, testVar, errorText) => {
  if (testFunction(testVar) === false) {
    throw new Error(errorText);
  }
};

const optionTestIfPresent = (testFunction, testVar, errorText) => {
  if (testVar && testFunction(testVar) === false) {
    throw new Error(errorText);
  }
};

// Validate API version format (Salesforce REST: major.minor, e.g. v45.0)
const API_VERSION_RE = /^v\d+\.\d+$/;
const apiMatch = (apiVersion) =>
  typeof apiVersion === 'string' && API_VERSION_RE.test(apiVersion);

const nonEmptyString = (s) => util.isString(s) && s.trim().length > 0;

const redirectUriFormat = (uri) => {
  if (!nonEmptyString(uri)) return false;
  try {
    const u = new URL(uri);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// Validates connection Options based on data type
const validateConnectionOptions = (con) => {
  optionTest(nonEmptyString, con.clientId, 'invalid or missing clientId');
  optionTest(
    redirectUriFormat,
    con.redirectUri,
    'invalid or missing redirectUri'
  );
  optionTest(
    util.isString,
    con.authEndpoint,
    'invalid or missing authEndpoint'
  );
  optionTest(
    util.isString,
    con.testAuthEndpoint,
    'invalid or missing testAuthEndpoint'
  );
  optionTest(util.isString, con.loginUri, 'invalid or missing loginUri');
  optionTest(
    util.isString,
    con.testLoginUri,
    'invalid or missing testLoginUri'
  );
  optionTest(
    (val) =>
      util.isString(val) && CONST.ENVS.includes(val.toLowerCase()),
    con.environment,
    `invalid environment, only ${CONST.ENVS.join(' and ')} are allowed`
  );
  optionTest(
    (val) =>
      util.isString(val) && CONST.MODES.includes(val.toLowerCase()),
    con.mode,
    `invalid mode, only ${CONST.MODES.join(' and ')} are allowed`
  );
  optionTestIfPresent(
    util.isFunction,
    con.onRefresh,
    'onRefresh must be a function'
  );
  optionTestIfPresent(util.isNumber, con.timeout, 'timeout must be a number');

  optionTest(
    apiMatch,
    con.apiVersion,
    `invalid apiVersion [${con.apiVersion}], use dotted form like v45.0`
  );
};

module.exports = {
  Connection,
  validateConnectionOptions
};
