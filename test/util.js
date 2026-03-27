'use strict';

const util = require('../lib/util');
require('should');

describe('util', function () {
  describe('#getHeader', function () {
    it('should return undefined for falsy headers', function () {
      (util.getHeader(null, 'foo') === undefined).should.equal(true);
    });

    it('should get header from plain object case-insensitively', function () {
      util.getHeader({ 'Content-Type': 'text/html' }, 'content-type').should.equal('text/html');
    });

    it('should get header from object with .get method', function () {
      const headers = new Map([['error', 'something']]);
      util.getHeader(headers, 'error').should.equal('something');
    });

    it('should return undefined for missing header', function () {
      (util.getHeader({}, 'missing') === undefined).should.equal(true);
    });
  });

  describe('#isObject', function () {
    it('should return false for null', function () {
      util.isObject(null).should.equal(false);
    });

    it('should return true for a plain object', function () {
      util.isObject({ a: 1 }).should.equal(true);
    });

    it('should return false for a string', function () {
      util.isObject('hello').should.equal(false);
    });

    it('should return false for undefined', function () {
      util.isObject(undefined).should.equal(false);
    });

    it('should return true for an array', function () {
      util.isObject([1, 2]).should.equal(true);
    });
  });
});
