'use strict';

const mimeTypes = require('mime-types');

/**
 * Check if an attachment body is present and non-empty.
 * Supports strings, Buffers, Uint8Arrays, and ArrayBuffers.
 * @param {string|Buffer|Uint8Array|ArrayBuffer|null|undefined} body
 * @returns {boolean}
 */
const hasNonEmptyAttachmentBody = (body) => {
  if (body == null) return false;
  if (typeof body === 'string') return body.length > 0;
  if (Buffer.isBuffer(body)) return body.length > 0;
  if (body instanceof Uint8Array) return body.byteLength > 0;
  if (body instanceof ArrayBuffer) return body.byteLength > 0;
  return true;
};

/**
 * Build a multipart FormData for inserting/updating file-based SObjects
 * (Attachment, Document, ContentVersion).
 * @param {object} opts - Request options with `sobject` (Record instance) and `method`.
 * @returns {FormData} A FormData with the entity metadata and optional binary body.
 */
const multipart = (opts) => {
  const type = opts.sobject.getType();
  const entity = type === 'contentversion' ? 'content' : type;
  const name = type === 'contentversion' ? 'VersionData' : 'Body';
  const fileName = opts.sobject.getFileName();
  const safeFileName = fileName || 'file.bin';
  const isPatch = opts.method === 'PATCH';

  const form = new FormData();

  form.append(
    'entity_' + entity,
    new Blob(
      [
        JSON.stringify(
          isPatch
            ? opts.sobject.toChangedPayload()
            : opts.sobject.toPayload(),
        ),
      ],
      {
        type: 'application/json',
      },
    ),
    'entity',
  );

  const attachmentBody = opts.sobject.getBody();
  if (hasNonEmptyAttachmentBody(attachmentBody)) {
    form.append(
      name,
      new Blob([attachmentBody], {
        type: mimeTypes.lookup(safeFileName) || 'application/octet-stream',
      }),
      safeFileName,
    );
  }

  return form;
};

module.exports = multipart;
