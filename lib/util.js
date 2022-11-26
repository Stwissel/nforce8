const util = {};

util.isJsonResponse = function(res) {
  if (res.headers) {
    const headers = res.headers;
    if (headers.get('content-type') == undefined) return false; // no content-type header    
    const h = headers.get('content-type').toLowerCase();
    if (h.toLowerCase().indexOf('application/json') > -1) {
      return true;
    }
  }
  return false;
};

util.isChunkedEncoding = function(res) {
  return (
    res.headers && res.headers['transfer-encoding'] && res.headers['transfer-encoding'].toLowerCase() === 'chunked'
  );
};

util.isFunction = function(candidate) {
  return typeof candidate === 'function';
};

util.isString = (candidate) => {
  return typeof candidate === 'string';
};

util.isBoolean = (candidate) => {
  return typeof candidate === 'boolean';
};

util.findId = function(data) {
  if (data) {
    if (data.getId && util.isFunction(data.getId)) {
      return data.getId();
    }

    return data.Id ? data.Id : data.id ? data.id : data.ID;
  }
  return undefined;
};

util.validateOAuth = function(oauth) {
  if (!oauth || !oauth.instance_url || !oauth.access_token) {
    return false;
  } else {
    return true;
  }
};

// Require syntax for Node < 10
module.exports = util;
