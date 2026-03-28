'use strict';

/**
 * Represents a Salesforce SObject record with field change tracking.
 * Field names are lowercased internally. Tracks changed fields and previous values
 * to support partial updates (toChangedPayload).
 * @param {object} data - Initial field values. Keys are lowercased; `attributes` and
 *   `attachment` are handled specially.
 */
const Record = function (data) {
  this.attributes = {};
  this._changed = new Set();
  this._previous = {};

  this._fields = Object.entries(data).reduce((result, [key, val]) => {
    key = key.toLowerCase();
    if (key !== 'attributes' && key !== 'attachment') {
      result[key] = val;
      this._changed.add(key);
    } else if (key === 'attributes') {
      this.attributes = val;
    } else if (key === 'attachment') {
      this._attachment = val;
    }
    return result;
  }, {});
};

/**
 * Create a Record from an API response and reset its change-tracking state.
 * @param {object} data - Raw API response object.
 * @returns {Record} A new Record with no pending changes.
 */
Record.fromResponse = function (data) {
  const rec = new Record(data);
  rec.reset();
  return rec;
};

/**
 * Get a field value (case-insensitive).
 * @param {string} field - Field name.
 * @returns {*} The field value, or undefined.
 */
Record.prototype.get = function (field) {
  field = field.toLowerCase();
  if (field && this._fields[field] !== undefined) {
    return this._fields[field];
  }
};

/**
 * Set one or more field values, tracking changes for partial updates.
 * @param {string|object} field - Field name, or an object of key/value pairs.
 * @param {*} [value] - Field value (when `field` is a string).
 */
Record.prototype.set = function (field, value) {
  const data = (typeof field === 'object' && field !== null)
    ? Object.fromEntries(
        Object.entries(field).map(([k, v]) => [k.toLowerCase(), v])
      )
    : { [field.toLowerCase()]: value };

  Object.keys(data).forEach((key) => {
    key = key.toLowerCase();
    if (key === 'attachment') {
      this._attachment = data[key];
      return;
    }
    if (!(key in this._fields) || data[key] !== this._fields[key]) {
      this._changed.add(key);
      if (!(key in this._previous)) {
        this._previous[key] = this._fields[key];
      }
      this._fields[key] = data[key];
    }
  });
};

Record.prototype.getId = function () {
  return this._fields.id;
};

Record.prototype.setId = function (id) {
  this._fields.id = id;
};

Record.prototype.getType = function () {
  return this.attributes.type ? this.attributes.type.toLowerCase() : undefined;
};

Record.prototype.getUrl = function () {
  return this.attributes.url;
};

Record.prototype.isType = function (type) {
  if (typeof type !== 'string') return false;
  type = type.toLowerCase();
  return type === this.getType();
};

Record.prototype.getExternalId = function () {
  return this.attributes.externalId;
};

Record.prototype.getExternalIdField = function () {
  return this.attributes.externalIdField;
};

/**
 * Set the external ID field name and value (used for upsert operations).
 * @param {string} field - External ID field API name.
 * @param {string} value - External ID value.
 */
Record.prototype.setExternalId = function (field, value) {
  field = field.toLowerCase();
  this.attributes.externalIdField = field;
  this.attributes.externalId = value;
  this.set(field, value);
};

Record.prototype.getAttachment = function () {
  return this._attachment || {};
};

Record.prototype.setAttachment = function (fileName, body) {
  this._attachment = { fileName: fileName, body: body };
};

Record.prototype.getFileName = function () {
  return this._attachment ? this._attachment.fileName : undefined;
};

Record.prototype.setFileName = function (fileName) {
  this._attachment = this._attachment || {};
  this._attachment.fileName = fileName;
};

Record.prototype.getBody = function () {
  return this._attachment ? this._attachment.body : undefined;
};

Record.prototype.setBody = function (body) {
  this._attachment = this._attachment || {};
  this._attachment.body = body;
};

/**
 * Check whether any field (or a specific field) has changed since the last reset.
 * @param {string} [field] - Optional field name. If omitted, checks if anything changed.
 * @returns {boolean}
 */
Record.prototype.hasChanged = function (field) {
  if (!this._changed || this._changed.size === 0) return false;
  if (!field) return true;
  return this._changed.has(field.toLowerCase());
};

/**
 * Get all changed fields and their current values.
 * @returns {object} Map of changed field names to current values.
 */
Record.prototype.changed = function () {
  const changed = {};
  this._changed.forEach((field) => {
    changed[field] = this._fields[field];
  });
  return changed;
};

/**
 * Get the previous value(s) before the most recent change.
 * @param {string} [field] - Specific field name. If omitted, returns all previous values.
 * @returns {*|object} Previous value for one field, or map of all previous values.
 */
Record.prototype.previous = function (field) {
  if (field) field = field.toLowerCase();
  if (typeof field === 'string') {
    if (field in this._previous) {
      return this._previous[field];
    }
    return undefined;
  } else {
    return this._previous || {};
  }
};

/** Serialize the record for JSON.stringify (all fields plus id). */
Record.prototype.toJSON = function () {
  let data = this.toPayload();
  if (!data.id && this.getId()) {
    data.id = this.getId();
  }
  return data;
};

/** Clear change-tracking state (marks all fields as unchanged). */
Record.prototype.reset = function () {
  this._changed = new Set();
  this._previous = {};
};

/**
 * Build a payload object from the record's fields, excluding id and external ID.
 * @param {boolean} changedOnly - If true, include only changed fields.
 * @returns {object} Field name/value pairs suitable for API submission.
 */
Record.prototype._getPayload = function (changedOnly) {
  changedOnly = changedOnly === true;

  let data = Object.entries(this._fields).reduce((result, [key, value]) => {
    if (changedOnly && !this._changed.has(key)) return result;
    key = key.toLowerCase();
    if (key !== 'id' && key !== this.getExternalIdField()) {
      result[key] = value;
    }
    return result;
  }, {});

  return data;
};

/** Get all fields as a payload for insert. @returns {object} */
Record.prototype.toPayload = function () {
  return this._getPayload(false);
};

/** Get only changed fields as a payload for update. @returns {object} */
Record.prototype.toChangedPayload = function () {
  return this._getPayload(true);
};

module.exports = Record;
