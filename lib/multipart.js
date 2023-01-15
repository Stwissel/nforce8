const mime = require('mime');

const multipart = function (opts) {
  let type = opts.sobject.getType();
  let entity = type === 'contentversion' ? 'content' : type;
  let name = type === 'contentversion' ? 'VersionData' : 'Body';
  let fileName = opts.sobject.getFileName();
  let isPatch = opts.method === 'PATCH' ? true : false;
  let multipart = [];

  multipart.push({
    'content-type': 'application/json',
    'content-disposition': 'form-data; name="entity_' + entity + '"',
    body: JSON.stringify(opts.sobject._getPayload(isPatch))
  });

  multipart.push({
    'content-type': mime.lookup(fileName),
    'content-disposition':
      'form-data; name="' + name + '"; filename="' + fileName + '"',
    body: opts.sobject.getBody()
  });

  return multipart;
};

// Require syntax for Node < 10
module.exports = multipart;
