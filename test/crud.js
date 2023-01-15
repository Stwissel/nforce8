const nforce = require('../');
const should = require('should');
const CONST = require('../lib/constants');
const apiVersion = CONST.API;

const api = require('./mock/sfdc-rest-api');
const port = process.env.PORT || 3000;

let org = nforce.createConnection(api.getClient());

let oauth = api.getOAuth();

describe('api-mock-crud', () => {
  // set up mock server
  before((done) => api.start(port, done));

  describe('#insert', () => {
    it('should create a proper request on insert', (done) => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      let hs = {
        'sforce-auto-assign': '1'
      };
      org
        .insert({ sobject: obj, oauth: oauth, headers: hs })
        .then((res) => {
          should.exist(res);
          let body = JSON.parse(api.getLastRequest().body);
          should.exist(body.name);
          should.exist(body.test_field__c);
          api
            .getLastRequest()
            .url.should.equal(
              '/services/data/' + apiVersion + '/sobjects/account'
            );
          api.getLastRequest().method.should.equal('POST');
          let hKey = Object.keys(hs)[0];
          should.exist(api.getLastRequest().headers[hKey]);
          api.getLastRequest().headers[hKey].should.equal(hs[hKey]);
        })
        .catch((err) => {
          should.not.exist(err);
        })
        .finally(() => done());
    });
  });

  describe('#update', () => {
    it('should create a proper request on update', (done) => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      obj.setId('someid');
      org
        .update({ sobject: obj, oauth: oauth })
        .then((res) => {
          should.exist(res);
          api
            .getLastRequest()
            .url.should.equal(
              '/services/data/' + apiVersion + '/sobjects/account/someid'
            );
          api.getLastRequest().method.should.equal('PATCH');
        })
        .catch((err) => {
          should.not.exist(err);
        })
        .finally(() => done());
    });
  });

  describe('#upsert', () => {
    it('should create a proper request on upsert', (done) => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      obj.setExternalId('My_Ext_Id__c', 'abc123');
      org
        .upsert({ sobject: obj, oauth: oauth })
        .then((res) => {
          should.exist(res);
          let body = JSON.parse(api.getLastRequest().body);
          should.exist(body.name);
          should.exist(body.test_field__c);
          api
            .getLastRequest()
            .url.should.equal(
              '/services/data/' +
                apiVersion +
                '/sobjects/account/my_ext_id__c/abc123'
            );
          api.getLastRequest().method.should.equal('PATCH');
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });
  });

  describe('#delete', () => {
    it('should create a proper request on delete', (done) => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      obj.setId('someid');
      org
        .delete({ sobject: obj, oauth: oauth })
        .then((res) => {
          should.exist(res);
          api
            .getLastRequest()
            .url.should.equal(
              '/services/data/' + apiVersion + '/sobjects/account/someid'
            );
          api.getLastRequest().method.should.equal('DELETE');
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });
  });

  describe('#apexRest', () => {
    it('should create a proper request for a custom Apex REST endpoint', (done) => {
      org
        .apexRest({ uri: 'sample', oauth: oauth })
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal('/services/apexrest/sample');
          api.getLastRequest().method.should.equal('GET');
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });
  });

  // reset the lastRequest
  afterEach(() => api.reset());

  // close mock server
  after((done) => api.stop(done));
});
