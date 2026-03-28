'use strict';

/**
 * Create an error indicating the Salesforce response was not valid JSON.
 * @returns {Error} Error with `type` set to `'invalid-json'`.
 */
const invalidJson = () => {
  const err = new Error('Invalid JSON response from Salesforce');
  err.type = 'invalid-json';
  return err;
};

/**
 * Create an error indicating the Salesforce response was unexpectedly empty.
 * @returns {Error} Error with `type` set to `'empty-response'`.
 */
const emptyResponse = () => {
  const err = new Error('Unexpected empty response');
  err.type = 'empty-response';
  return err;
};

module.exports = { invalidJson, emptyResponse };
