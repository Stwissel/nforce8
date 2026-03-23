const mimeTypes = require('mime-types');

const multipart = function (opts) {
  const type = opts.sobject.getType();
  const entity = type === 'contentversion' ? 'content' : type;
  const name = type === 'contentversion' ? 'VersionData' : 'Body';
  const fileName = opts.sobject.getFileName();
  const isPatch = opts.method === 'PATCH';
  const multipart = [];

  multipart.push({
    'content-type': 'application/json',
    'content-disposition': 'form-data; name="entity_' + entity + '"',
    body: JSON.stringify(opts.sobject._getPayload(isPatch))
  });

  multipart.push({
    'content-type': mimeTypes.lookup(fileName) || 'application/octet-stream',
    'content-disposition':
      'form-data; name="' + name + '"; filename="' + fileName + '"',
    body: opts.sobject.getBody()
  });

  return multipart;
};

module.exports = multipart;
