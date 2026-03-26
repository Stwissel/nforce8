'use strict';

/* Checks if a header exists (case insensitive) and contains a value */
const checkHeaderCaseInsensitive = (headers, key, searchfor) => {
  if (!headers) return false;
  const lower = key.toLowerCase();
  let headerContent;
  if (typeof headers.get === 'function') {
    headerContent = headers.get(lower) || headers.get(key);
  } else {
    const k = Object.keys(headers).find((x) => x.toLowerCase() === lower);
    headerContent = k ? headers[k] : undefined;
  }
  return headerContent ? headerContent.includes(searchfor) : false;
};

const isJsonResponse = (res) => {
  return (
    res.headers &&
    checkHeaderCaseInsensitive(res.headers, 'content-type', 'application/json')
  );
};

const isFunction = (candidate) => typeof candidate === 'function';

const isString = (candidate) => typeof candidate === 'string';

const isBoolean = (candidate) => typeof candidate === 'boolean';

const isNumber = (candidate) => typeof candidate === 'number';

const isObject = (candidate) => candidate !== null && typeof candidate === 'object';

// Too many flavours of ID around: function and capitaliztion
const findId = (data) => {
  if (data) {
    if (data.getId && isFunction(data.getId)) {
      return data.getId();
    }

    const flavors = ['Id', 'id', 'ID'];

    for (let flavor of flavors) {
      if (data[flavor]) {
        return data[flavor];
      }
    }
  }
  return undefined;
};

const validateOAuth = (oauth) => {
  return oauth && oauth.instance_url && oauth.access_token;
};

const getHeader = (headers, key) => {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const val = headers.get(key);
    return val === null ? undefined : val;
  }
  const lower = key.toLowerCase();
  const found = Object.keys(headers).find((k) => k.toLowerCase() === lower);
  return found ? headers[found] : undefined;
};

module.exports = {
  isJsonResponse,
  isFunction,
  isString,
  isBoolean,
  isObject,
  isNumber,
  findId,
  validateOAuth,
  getHeader
};
