
const nonJsonResponse = function () {
  return new Error('Non-JSON response from Salesforce');
};

const invalidJson = function () {
  return new Error('Invalid JSON response from Salesforce');
};

const emptyResponse = function () {
  return new Error('Unexpected empty response');
};

export { nonJsonResponse, invalidJson, emptyResponse };
