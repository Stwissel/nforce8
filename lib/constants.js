/* Constants like URLs, API versions etc */
'use strict';

const AUTH_ENDPOINT = 'https://login.salesforce.com/services/oauth2/authorize';
const TEST_AUTH_ENDPOINT = 'https://test.salesforce.com/services/oauth2/authorize';
const LOGIN_URI = 'https://login.salesforce.com/services/oauth2/token';
const TEST_LOGIN_URI = 'https://test.salesforce.com/services/oauth2/token';
const ENVS = ['sandbox', 'production'];
const MODES = ['multi', 'single'];
// This needs update for each SFDC release!
const API = process.env.SFDC_API_VERSION || 'v45.0';

const constants = {
  AUTH_ENDPOINT: AUTH_ENDPOINT,
  TEST_AUTH_ENDPOINT: TEST_AUTH_ENDPOINT,
  LOGIN_URI: LOGIN_URI,
  TEST_LOGIN_URI: TEST_LOGIN_URI,
  ENVS: ENVS,
  MODES: MODES,
  API: API,
  defaultOptions: {
    clientId: null,
    clientSecret: null,
    redirectUri: null,
    authEndpoint: AUTH_ENDPOINT,
    testAuthEndpoint: TEST_AUTH_ENDPOINT,
    loginUri: LOGIN_URI,
    testLoginUri: TEST_LOGIN_URI,
    apiVersion: API,
    environment: 'production',
    mode: 'multi',
    gzip: false,
    autoRefresh: false,
    onRefresh: undefined,
    timeout: undefined,
    oauth: undefined,
    username: undefined,
    password: undefined,
    securityToken: undefined
  }
};

module.exports = constants;
