let nforce = require('../');
let should = require('should');

describe('index', function () {
  describe('#createConnection', function () {
    it('should throw on no clientId', function () {
      (function () {
        let org = nforce.createConnection({
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback'
        });
      }.should.throw('invalid or missing clientId'));
    });

    it('should throw on no redirectUri', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S'
        });
      }.should.throw('invalid or missing redirectUri'));
    });

    it('should not throw on id, secret, and redirectUri', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback'
        });
      }.should.not.throw());
    });

    it('should not accept the number v24 for apiVersion', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          apiVersion: 24
        });
      }.should.throw());
    });

    it('should not accept the string 24 for apiVersion', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          apiVersion: '24'
        });
      }.should.throw());
    });

    it('should not throw for apiVersion v45.0', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          apiVersion: 'v45.0'
        });
      }.should.not.throw());
    });

    it('should accept production for environment', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          environment: 'production'
        });
      }.should.not.throw());
    });

    it('should accept sandbox for environment', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          environment: 'sandbox'
        });
      }.should.not.throw());
    });

    it('should not accept playground for environment', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          environment: 'playground'
        });
      }.should.throw());
    });

    it('should throw on invalid timeout', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          timeout: '5555'
        });
      }.should.throw('timeout must be a number'));
    });

    it('should accept number for timeout', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'ADFJSD234ADF765SFG55FD54S',
          clientSecret: 'ADFJSD234ADF765SFG55FD54S',
          redirectUri: 'http://localhost:3000/oauth/_callback',
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

    it('should clear the cache after calling _reset', function () {
      let obj = nforce.createSObject('Test_Object__c', {
        Name: 'Test Me',
        Custom_Field__c: 'Blah',
        Id: 'asalesforceid'
      });
      obj._reset();
      obj._getPayload(true).should.not.have.keys('name', 'custom_field__c');
    });
  });

  describe('#getAuthUri', function () {
    it('should return the correct authuri for production', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        environment: 'production'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^https:\/\/login.salesforce.*/);
    });

    it('should return the correct authuri for sandbox', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        environment: 'sandbox'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^https:\/\/test.salesforce.*/);
    });

    it('should allow for setting display', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        environment: 'production'
      });
      let uri = org.getAuthUri({ display: 'popup' });
      uri.should.match(/.*display\=popup*/);
    });

    it('should allow for setting immediate', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        environment: 'production'
      });
      let uri = org.getAuthUri({ immediate: true });
      uri.should.match(/.*immediate\=true*/);
    });

    it('should allow for setting scope', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        environment: 'production'
      });
      let uri = org.getAuthUri({ scope: ['visualforce', 'web'] });
      uri.should.match(/.*scope=visualforce\%20web.*/);
    });

    it('should allow for setting state', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        environment: 'production'
      });
      let uri = org.getAuthUri({ state: 'something' });
      uri.should.match(/.*state=something.*/);
    });

    it('should allow for custom auth endpoint', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        authEndpoint: 'http://foo.com',
        testAuthEndpoint: 'http://test.foo.com',
        environment: 'production'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^http:\/\/foo\.com/);
    });

    it('should allow for custom test auth endpoint', function () {
      let org = nforce.createConnection({
        clientId: 'ADFJSD234ADF765SFG55FD54S',
        clientSecret: 'ADFJSD234ADF765SFG55FD54S',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        authEndpoint: 'http://foo.com',
        testAuthEndpoint: 'http://test.foo.com',
        environment: 'sandbox'
      });
      let uri = org.getAuthUri();
      uri.should.match(/^http:\/\/test\.foo\.com/);
    });
  });
});
