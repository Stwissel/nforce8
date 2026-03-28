'use strict';

const invalidJson = () => {
  const err = new Error('Invalid JSON response from Salesforce');
  err.type = 'invalid-json';
  return err;
};

const emptyResponse = () => {
  const err = new Error('Unexpected empty response');
  err.type = 'empty-response';
  return err;
};

module.exports = { invalidJson, emptyResponse };
