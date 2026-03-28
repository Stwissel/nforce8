'use strict';

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

Record.fromResponse = function (data) {
  const rec = new Record(data);
  rec.reset();
  return rec;
};

Record.prototype.get = function (field) {
  field = field.toLowerCase();
  if (field && this._fields[field] !== undefined) {
    return this._fields[field];
  }
};

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

Record.prototype.hasChanged = function (field) {
  if (!this._changed || this._changed.size === 0) return false;
  if (!field) return true;
  return this._changed.has(field.toLowerCase());
};

Record.prototype.changed = function () {
  const changed = {};
  this._changed.forEach((field) => {
    changed[field] = this._fields[field];
  });
  return changed;
};

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

Record.prototype.toJSON = function () {
  let data = this.toPayload();
  if (!data.id && this.getId()) {
    data.id = this.getId();
  }
  return data;
};

Record.prototype.reset = function () {
  this._changed = new Set();
  this._previous = {};
};

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

Record.prototype.toPayload = function () {
  return this._getPayload(false);
};

Record.prototype.toChangedPayload = function () {
  return this._getPayload(true);
};

module.exports = Record;
