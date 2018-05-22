/* Constants like URLs, API versions etc */
"use strict";

const constants = {
  AUTH_ENDPOINT: "https://login.salesforce.com/services/oauth2/authorize",
  TEST_AUTH_ENDPOINT: "https://test.salesforce.com/services/oauth2/authorize",
  LOGIN_URI: "https://login.salesforce.com/services/oauth2/token",
  TEST_LOGIN_URI: "https://test.salesforce.com/services/oauth2/token",
  ENVS: ["sandbox", "production"],
  MODES: ["multi", "single"],
  API: "v43.0"
};

module.exports = constants;
