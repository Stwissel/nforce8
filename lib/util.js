'use strict';

/**
 * Check if a header exists (case-insensitive) and its value contains a substring.
 * Works with both Fetch API Headers objects and plain objects.
 * @param {Headers|object} headers - Headers collection.
 * @param {string} key - Header name to look up.
 * @param {string} substring - Substring to search for in the header value.
 * @returns {boolean} True if the header contains the substring.
 */
const headerContains = (headers, key, substring) => {
  if (!headers) return false;
  const lower = key.toLowerCase();
  let headerContent;
  if (typeof headers.get === 'function') {
    headerContent = headers.get(lower) || headers.get(key);
  } else {
    const k = Object.keys(headers).find((x) => x.toLowerCase() === lower);
    headerContent = k ? headers[k] : undefined;
  }
  return headerContent ? headerContent.includes(substring) : false;
};

/**
 * Check if a response has a JSON content-type header.
 * @param {Response} res - Fetch Response object.
 * @returns {boolean}
 */
const isJsonResponse = (res) => {
  return (
    res.headers &&
    headerContains(res.headers, 'content-type', 'application/json')
  );
};

const isFunction = (candidate) => typeof candidate === 'function';

const isString = (candidate) => typeof candidate === 'string';

const isBoolean = (candidate) => typeof candidate === 'boolean';

const isNumber = (candidate) => typeof candidate === 'number';

const isObject = (candidate) => candidate !== null && typeof candidate === 'object';

const ID_FIELD_VARIANTS = ['Id', 'id', 'ID'];

/**
 * Extract a Salesforce record ID from various sources.
 * Handles getId() methods and Id/id/ID property variants.
 * @param {object} data - A Record instance or plain object.
 * @returns {string|undefined} The extracted ID, or undefined if not found.
 */
const findId = (data) => {
  if (data) {
    if (data.getId && isFunction(data.getId)) {
      return data.getId();
    }

    for (const variant of ID_FIELD_VARIANTS) {
      if (data[variant] !== undefined) {
        return data[variant];
      }
    }
  }
  return undefined;
};

/**
 * Check that an OAuth object has the minimum required fields (instance_url and access_token).
 * @param {object} oauth - OAuth credentials object.
 * @returns {boolean} True if valid.
 */
const validateOAuth = (oauth) => {
  return oauth && oauth.instance_url && oauth.access_token;
};

/**
 * Retrieve a single header value (case-insensitive lookup).
 * Works with both Fetch API Headers objects and plain objects.
 * @param {Headers|object} headers - Headers collection.
 * @param {string} key - Header name.
 * @returns {string|undefined} The header value, or undefined if not found.
 */
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
