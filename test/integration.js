'use strict';
/* End to End Tests - if environment parameters are found pointing to a Salesforce instance */
const nforce = require('../');
const should = require('should');

// The SFDC Client instance
let client = undefined;

describe('Integration Test against an actual Salesforce instance', () => {
  before(() => {
    let creds = checkEnvCredentials();
    if (creds == null) {
      // Can't run integration tests
      this.skip();
    } else {
      // TODO: fix the creds
      client = nforce.createConnection(creds);
    }
  });

  after(() => {
    if (client != undefined) {
      client.logout();
    }
  });

  describe('Client session check', () => {
    it('should have a valid client session', () => {
      should.exists(client);
    });
  });
});

/* Checking if the environment has SFDC credentials, so we
 * can run an integration test
 */

function checkEnvCredentials() {
  let user = process.env.SFDC_USER;
  let pwd = process.env.SFDC_PASSWORD;
  let clientid = process.env.SFDC_CLIENTID;
  let envType = process.env.SFDC_ENVIRONMENT;

  if (user && pwd && clientid && envType) {
    return {
      user: user,
      pwd: pwd,
      clientid: clientid,
      envType: envType
    };
  }
  /*
    let x = {
        clientId: "ADFJSD234ADF765SFG55FD54S",
        clientSecret: "adsfkdsalfajdskfa",
        redirectUri: "http://localhost:" + port + "/oauth/_callback",
        loginUri: "http://localhost:" + port + "/login/uri",
        apiVersion: opts.apiVersion || apiVersion,
        mode: "multi",
        autoRefresh: opts.autoRefresh || false,
        onRefresh: opts.onRefresh || undefined
    }
    */
  return null;
}
