let nforce = require('../');
let should = require('should');

const FAKE_CLIENT_ID = 'ADFJSD234ADF765SFG55FD54S';
const FAKE_REDIRECT_URI = 'http://localhost:3000/oauth/_callback';

describe('index', function () {
  describe('#createConnection', function () {
    it('should throw on no clientId', function () {
      (function () {
        nforce.createConnection({
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI
        });
      }.should.throw('invalid or missing clientId'));
    });

    it('should throw on no redirectUri', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID
        });
      }.should.throw('invalid or missing redirectUri'));
    });

    it('should not throw on id, secret, and redirectUri', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI
        });
      }.should.not.throw());
    });

    it('should not accept the number v24 for apiVersion', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          apiVersion: 24
        });
      }.should.throw());
    });

    it('should not accept the string 24 for apiVersion', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          apiVersion: '24'
        });
      }.should.throw());
    });

    it('should not throw for apiVersion v45.0', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          apiVersion: 'v45.0'
        });
      }.should.not.throw());
    });

    it('should not accept bare major-only apiVersion v45', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          apiVersion: 'v45'
        });
      }.should.throw());
    });

    it('should reject whitespace-only clientId', function () {
      (function () {
        nforce.createConnection({
          clientId: '   ',
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI
        });
      }.should.throw('invalid or missing clientId'));
    });

    it('should reject non-http(s) redirectUri', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: 'ftp://localhost:3000/oauth/_callback'
        });
      }.should.throw('invalid or missing redirectUri'));
    });

    it('should normalize environment and mode to lowercase after validation', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'SandBox',
        mode: 'SINGLE'
      });
      org.environment.should.equal('sandbox');
      org.mode.should.equal('single');
    });

    it('should accept production for environment', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          environment: 'production'
        });
      }.should.not.throw());
    });

    it('should accept sandbox for environment', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          environment: 'sandbox'
        });
      }.should.not.throw());
    });

    it('should not accept playground for environment', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          environment: 'playground'
        });
      }.should.throw());
    });

    it('should throw on invalid timeout', function () {
      (function () {
        nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          timeout: '5555'
        });
      }.should.throw('timeout must be a number'));
    });

    it('should accept number for timeout', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: FAKE_CLIENT_ID,
          clientSecret: FAKE_CLIENT_ID,
          redirectUri: FAKE_REDIRECT_URI,
          timeout: 5555
        });

        org.timeout.should.equal(5555);
      }.should.not.throw());
    });
  });

  describe('#createSObject', function () {
    it('should create an SObject of type Account', function () {
      let acc = nforce.createSObject('Account');
      acc.should.have.type('object');
      acc.should.have.property('attributes');
      acc.attributes.type.should.equal('Account');
    });

    it('should create an SObject of type Test_Object__c', function () {
      let obj = nforce.createSObject('Test_Object__c');
      obj.should.have.type('object');
      obj.should.have.property('attributes');
      obj.attributes.type.should.equal('Test_Object__c');
    });

    it('should allow field values to be passed in', function () {
      let obj = nforce.createSObject('Test_Object__c', {
        Name: 'Test Me',
        Custom_Field__c: 'Blah'
      });
      obj.should.have.type('object');
      obj.should.have.property('attributes');
      obj.attributes.type.should.equal('Test_Object__c');
      obj._fields.should.have.property('name');
      obj._fields.name.should.equal('Test Me');
      obj._fields.should.have.property('custom_field__c');
      obj._fields.custom_field__c.should.equal('Blah');
      let pl = obj._getPayload(false);
      pl.should.have.property('name', 'Test Me');
      pl.should.have.property('custom_field__c', 'Blah');
    });

    it('should allow instantiation with id', function () {
      let obj = nforce.createSObject('Test_Object__c', {
        Name: 'Test Me',
        Custom_Field__c: 'Blah',
        Id: 'asalesforceid'
      });
      should.exist(obj.getId());
      obj.getId().should.equal('asalesforceid');
    });

    it('should clear the cache after calling reset', function () {
      let obj = nforce.createSObject('Test_Object__c', {
        Name: 'Test Me',
        Custom_Field__c: 'Blah',
        Id: 'asalesforceid'
      });
      obj.reset();
      obj._getPayload(true).should.not.have.keys('name', 'custom_field__c');
    });
  });

  describe('#getAuthUri', function () {
    it('should return the correct authuri for production', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^https:\/\/login.salesforce.*/);
    });

    it('should return the correct authuri for sandbox', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'sandbox'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^https:\/\/test.salesforce.*/);
    });

    it('should allow for setting display', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production'
      });
      let uri = org.getAuthUri({ display: 'popup' });
      uri.should.match(/.*display=popup/);
    });

    it('should allow for setting immediate', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production'
      });
      let uri = org.getAuthUri({ immediate: true });
      uri.should.match(/.*immediate=true/);
    });

    it('should allow for setting scope', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production'
      });
      let uri = org.getAuthUri({ scope: ['visualforce', 'web'] });
      uri.should.match(/.*scope=visualforce(\+|%20)web.*/);
    });

    it('should allow for setting state', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production'
      });
      let uri = org.getAuthUri({ state: 'something' });
      uri.should.match(/.*state=something.*/);
    });

    it('should allow for custom auth endpoint', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        authEndpoint: 'http://foo.com',
        testAuthEndpoint: 'http://test.foo.com',
        environment: 'production'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^http:\/\/foo\.com/);
    });

    it('should allow for custom test auth endpoint', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        authEndpoint: 'http://foo.com',
        testAuthEndpoint: 'http://test.foo.com',
        environment: 'sandbox'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^http:\/\/test\.foo\.com/);
    });
  });

  describe('#getIdentity', function () {
    it('should reject when oauth is missing', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production',
        mode: 'multi'
      });
      return org.getIdentity({}).then(
        () => {
          throw new Error('expected rejection');
        },
        (err) => {
          err.message.should.match(/access_token/);
        }
      );
    });

    it('should reject when oauth has access_token but no identity URL', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production',
        mode: 'multi'
      });
      return org
        .getIdentity({ oauth: { access_token: 'tok', instance_url: 'https://na1.salesforce.com' } })
        .then(
          () => {
            throw new Error('expected rejection');
          },
          (err) => {
            err.message.should.match(/oauth\.id|oauthId/);
          }
        );
    });
  });

  describe('#refreshToken', function () {
    it('should reject when oauth has no refresh_token or assertion', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        environment: 'production'
      });
      return org.refreshToken({ oauth: {} }).then(
        () => {
          throw new Error('expected rejection');
        },
        (err) => {
          err.message.should.match(/refresh_token|assertion/);
        }
      );
    });
  });

  describe('#_notifyAndResolve', function () {
    it('should resolve with oauth when no onRefresh is set', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI
      });
      return org._notifyAndResolve({ access_token: 'test123' }, {}).then((result) => {
        result.access_token.should.equal('test123');
      });
    });

    it('should call onRefresh callback when onRefresh is set', function () {
      let refreshCalled = false;
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        onRefresh: function (newOauth, oldOauth, cb) {
          refreshCalled = true;
          newOauth.access_token.should.equal('new_token');
          oldOauth.access_token.should.equal('old_token');
          cb(null);
        }
      });
      let newOauth = { access_token: 'new_token' };
      let oldOauth = { access_token: 'old_token' };
      return org._notifyAndResolve(newOauth, oldOauth).then((result) => {
        refreshCalled.should.be.true();
        result.access_token.should.equal('new_token');
      });
    });

    it('should reject when onRefresh callback returns an error', function () {
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        onRefresh: function (newOauth, oldOauth, cb) {
          cb(new Error('refresh failed'));
        }
      });
      return org._notifyAndResolve({ access_token: 'test' }, {}).then(
        () => { throw new Error('should have rejected'); },
        (err) => { err.message.should.equal('refresh failed'); }
      );
    });
  });

  describe('#_resolveOAuth', function () {
    it('should resolve with oauth without calling onRefresh', function () {
      let refreshCalled = false;
      let org = nforce.createConnection({
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_ID,
        redirectUri: FAKE_REDIRECT_URI,
        onRefresh: function (newOauth, oldOauth, cb) {
          refreshCalled = true;
          cb(null);
        }
      });
      return org._resolveOAuth({ access_token: 'test' }).then((result) => {
        refreshCalled.should.be.false();
        result.access_token.should.equal('test');
      });
    });
  });
});
