// ES6 Version of Connection object
const CONST = require('./constants');
const util = require('./util');

class Connection {
  constructor(opts) {
    opts = Object.assign({}, CONST.defaultOptions, opts);
    opts.environment = opts.environment.toLowerCase();
    opts.mode = opts.mode.toLowerCase();
    Object.assign(this, opts);
    validateConnectionOptions(this);
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

// returning a Function returning true when the arrray contains the string
const stringAndArray = (arr) => {
  return (val) => util.isString(val) && arr.includes(val);
};

// Validate API version format
const apiMatch = (apiVersion) => {
  const apiRegEx = /v[0-9][0-9]\.0/i;
  return apiVersion.match(apiRegEx);
};

// Validates connection Options based on data type
const validateConnectionOptions = (con) => {
  optionTest(util.isString, con.clientId, 'invalid or missing clientId');
  optionTest(util.isString, con.redirectUri, 'invalid or missing redirectUri');
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
  optionTest(util.isBoolean, con.gzip, 'gzip must be a boolean');
  optionTest(
    stringAndArray(CONST.ENVS),
    con.environment,
    `invalid environment, only ${CONST.ENVS.join(' and ')} are allowed`
  );
  optionTest(
    stringAndArray(CONST.MODES),
    con.mode,
    `invalid mode, only ${CONST.MODES.join(' and ')} are allowed`
  );
  optionTestIfPresent(
    util.isFunction,
    con.onRefresh,
    'onRefresh must be a function'
  );
  optionTestIfPresent(util.isNumber, con.timeout, 'timeout must be a number');

  optionTestIfPresent(
    apiMatch,
    con.apiVersion,
    `invalid apiVersion [${con.apiVersion}] number, use v99.0 format`
  );
};

module.exports = {
  Connection,
  validateConnectionOptions
};
