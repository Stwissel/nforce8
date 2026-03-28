'use strict';

const CONST = require('./constants');
const util = require('./util');

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

/** Validate API version format (Salesforce REST: major.minor, e.g. v45.0) */
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

/**
 * Validate all connection options, throwing on invalid/missing values.
 * Checks clientId, redirectUri, endpoints, environment, mode, apiVersion, timeout, and onRefresh.
 * @param {object} con - The connection object with merged defaults and user options.
 * @throws {Error} On any invalid or missing required option.
 */
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
  validateConnectionOptions
};
