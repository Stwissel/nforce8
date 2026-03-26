'use strict';

const util = require('../lib/util');
require('should');

describe('util', function () {
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
