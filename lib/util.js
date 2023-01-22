/* Checks if a header exists (case insensitive) and contains a value */
const checkHeaderCaseInsensitive = (headers, key, searchfor) => {
  const lower = key.toLowerCase;
  const headerContent =
    headers[Object.keys(headers).find((k) => k.toLowerCase() === lower)];
  return headerContent ? headerContent.includes(searchfor) : false;
};

const isJsonResponse = (res) => {
  return (
    res.headers &&
    checkHeaderCaseInsensitive(res.headers, 'content-type', 'application/json')
  );
};

const isChunkedEncoding = (res) => {
  return (
    res.headers &&
    checkHeaderCaseInsensitive(res.headers, 'transfer-encoding', 'chunked')
  );
};

const isFunction = (candidate) => typeof candidate === 'function';

const isString = (candidate) => typeof candidate === 'string';

const isBoolean = (candidate) => typeof candidate === 'boolean';

const isNumber = (candidate) => typeof candidate === 'number';

const isObject = (candidate) => typeof candidate === 'object';

// Too many flavours of ID around: function and capitaliztion
const findId = (data) => {
  if (data) {
    if (data.getId && isFunction(data.getId)) {
      return data.getId();
    }

    const flavors = ['Id', 'id', 'ID'];

    for (let flavor in flavors) {
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

module.exports = {
  isJsonResponse,
  isChunkedEncoding,
  isFunction,
  isString,
  isBoolean,
  isObject,
  isNumber,
  findId,
  validateOAuth
};
