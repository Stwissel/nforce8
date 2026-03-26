'use strict';

const mimeTypes = require('mime-types');

const multipart = function (opts) {
  const type = opts.sobject.getType();
  const entity = type === 'contentversion' ? 'content' : type;
  const name = type === 'contentversion' ? 'VersionData' : 'Body';
  const fileName = opts.sobject.getFileName();
  const isPatch = opts.method === 'PATCH';

  const form = new FormData();

  form.append(
    'entity_' + entity,
    new Blob([JSON.stringify(isPatch ? opts.sobject._getChangedPayload() : opts.sobject._getFullPayload())], {
      type: 'application/json'
    }),
    'entity'
  );

  const attachmentBody = opts.sobject.getBody();
  if (
    attachmentBody != null &&
    attachmentBody !== '' &&
    !(Buffer.isBuffer(attachmentBody) && attachmentBody.length === 0) &&
    !(attachmentBody instanceof Uint8Array && attachmentBody.byteLength === 0) &&
    !(attachmentBody instanceof ArrayBuffer && attachmentBody.byteLength === 0)
  ) {
    form.append(
      name,
      new Blob([attachmentBody], {
        type: mimeTypes.lookup(fileName) || 'application/octet-stream'
      }),
      fileName
    );
  }

  return form;
};

module.exports = multipart;
