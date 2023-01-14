const isJsonResponse = (res) => {
  return (
    res.headers &&
    res.headers['content-type'] &&
    res.headers['content-type'].toLowerCase().indexOf('application/json') > -1
  );
};

const isChunkedEncoding = (res) => {
  return (
    res.headers &&
    res.headers['transfer-encoding'] &&
    res.headers['transfer-encoding'].toLowerCase() === 'chunked'
  );
};

const isFunction = (candidate) => typeof candidate === 'function';

const isString = (candidate) => typeof candidate === 'string';

const isBoolean = (candidate) => typeof candidate === 'boolean';

const findId = (data) => {
  if (data) {
    if (data.getId && isFunction(data.getId)) {
      return data.getId();
    }

    return data.Id ? data.Id : data.id ? data.id : data.ID;
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
  findId,
  validateOAuth
};
