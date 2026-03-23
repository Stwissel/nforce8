const invalidJson = function () {
  const err = new Error('Invalid JSON response from Salesforce');
  err.type = 'invalid-json';
  return err;
};

const emptyResponse = function () {
  return new Error('Unexpected empty response');
};

module.exports = { invalidJson, emptyResponse };
