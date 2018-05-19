const util = {};

util.isJsonResponse = function (res) {
  return res.headers &&
    res.headers['content-type'] &&
    res.headers['content-type'].split(';')[0].toLowerCase() === 'application/json';
};

util.isChunkedEncoding = function (res) {
  return res.headers &&
    res.headers['transfer-encoding'] &&
    res.headers['transfer-encoding'].toLowerCase() === 'chunked';
};

util.isFunction = function (candidate) {
  return (typeof candidate === 'function');

};

util.findId = function (data) {
  if (data) {
    if (data.getId && util.isFunction(data.getId)) {
      return data.getId();
    }

    return data.Id ? data.Id : (data.id ? data.id : data.ID);
  }
  return undefined;
};

util.validateOAuth = function (oauth) {
  if (!oauth || !oauth.instance_url || !oauth.access_token) {
    return false;
  } else {
    return true;
  }
};

export default util;