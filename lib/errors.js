
const nonJsonResponse = function () {
  return new Error('Non-JSON response from Salesforce');
};

const invalidJson = function () {
  const err = new Error('Invalid JSON response from Salesforce');
  err.type = 'invalid-json';
  return err;
};

const emptyResponse = function () {
  return new Error('Unexpected empty response');
};

// Require syntax for Node < 10
module.exports = {
  nonJsonResponse: nonJsonResponse,
  invalidJson: invalidJson,
  emptyResponse: emptyResponse
};
