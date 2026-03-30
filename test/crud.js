const nforce = require('../');
const should = require('should');
const CONST = require('../lib/constants');
const apiVersion = CONST.API;

const { MockSfdcApi } = require('./mock/sfdc-rest-api');
const port = process.env.PORT || 33333;
const api = new MockSfdcApi(port);

let org = nforce.createConnection(api.getClient());

let oauth = api.getOAuth();

describe('api-mock-crud', () => {
  // set up mock server
  before((done) => api.start(port, done));

  describe('#insert', () => {
    it('should set the id on sobject after insert', (done) => {
      let insertResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '001DEADBEEF', success: true })
      };
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account'
      });
      api
        .getGoodServerInstance(insertResponse)
        .then(() => org.insert({ sobject: obj, oauth: oauth }))
        .then((res) => {
          should.exist(res);
          res.id.should.equal('001DEADBEEF');
          obj.getId().should.equal('001DEADBEEF');
        })
        .then(() => done())
        .catch((err) => done(err));
    });

    it('should throw when sobject is missing', () => {
      (() => org.insert({ oauth: oauth })).should.throw(/requires opts\.sobject/);
    });

    it('should create a proper request on insert', () => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      let hs = {
        'sforce-auto-assign': '1'
      };
      return org
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
        });
    });
  });

  describe('#update', () => {
    it('should create a proper request on update', () => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      obj.setId('someid');
      return org
        .update({ sobject: obj, oauth: oauth })
        .then((res) => {
          should.exist(res);
          api
            .getLastRequest()
            .url.should.equal(
              '/services/data/' + apiVersion + '/sobjects/account/someid'
            );
          api.getLastRequest().method.should.equal('PATCH');
        });
    });
  });

  describe('#upsert', () => {
    it('should create a proper request on upsert', () => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      obj.setExternalId('My_Ext_Id__c', 'abc123');
      return org
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
        });
    });

    it('should send multipart/form-data for ContentVersion upsert', (done) => {
      let upsertResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '068DEADBEEF', success: true })
      };
      let obj = nforce.createSObject('ContentVersion', {
        Title: 'TestFile',
        PathOnClient: 'test.txt'
      });
      obj.setAttachment('test.txt', Buffer.from('binary content'));
      obj.setExternalId('My_Ext_Id__c', 'ext123');
      api
        .getGoodServerInstance(upsertResponse)
        .then(() => org.upsert({ sobject: obj, oauth: oauth }))
        .then((res) => {
          should.exist(res);
          res.id.should.equal('068DEADBEEF');
          let ct = api.getLastRequest().headers['content-type'];
          ct.should.startWith('multipart/form-data');
          ct.should.containEql('boundary');
          api.getLastRequest().method.should.equal('PATCH');
        })
        .then(() => done())
        .catch((err) => done(err));
    });
  });

  describe('#delete', () => {
    it('should create a proper request on delete', () => {
      let obj = nforce.createSObject('Account', {
        Name: 'Test Account',
        Test_Field__c: 'blah'
      });
      obj.setId('someid');
      return org
        .delete({ sobject: obj, oauth: oauth })
        .then((res) => {
          should.exist(res);
          api
            .getLastRequest()
            .url.should.equal(
              '/services/data/' + apiVersion + '/sobjects/account/someid'
            );
          api.getLastRequest().method.should.equal('DELETE');
        });
    });
  });

  describe('#multipart', () => {
    it('should omit binary part when attachment body is missing (metadata-only)', () => {
      const multipart = require('../lib/multipart');
      const obj = nforce.createSObject('Document', {
        Name: 'MetaOnly',
        FolderId: '005DEADBEEF'
      });
      obj.setId('015DEADBEEF');
      const form = multipart({ sobject: obj, method: 'PATCH' });
      const entries = Array.from(form.entries());
      entries.length.should.equal(1);
      entries[0][0].should.startWith('entity_');
    });

    it('should send multipart/form-data content-type with boundary for Document insert', (done) => {
      let insertResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '015DEADBEEF', success: true })
      };
      let obj = nforce.createSObject('Document', {
        Name: 'TestDoc',
        FolderId: '005DEADBEEF'
      });
      obj.setAttachment('test.txt', Buffer.from('hello world'));
      api
        .getGoodServerInstance(insertResponse)
        .then(() => org.insert({ sobject: obj, oauth: oauth }))
        .then((res) => {
          should.exist(res);
          res.id.should.equal('015DEADBEEF');
          let ct = api.getLastRequest().headers['content-type'];
          ct.should.startWith('multipart/form-data');
          ct.should.containEql('boundary');
          api.getLastRequest().method.should.equal('POST');
        })
        .then(() => done())
        .catch((err) => done(err));
    });
  });

  describe('#getVersions', () => {
    it('should use instance_url from oauth instead of hardcoded na1', (done) => {
      let versionsResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ version: '45.0', url: '/services/data/v45.0' }])
      };
      api
        .getGoodServerInstance(versionsResponse)
        .then(() => org.getVersions({ oauth: oauth }))
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal('/services/data/');
          api.getLastRequest().method.should.equal('GET');
        })
        .then(() => done())
        .catch((err) => done(err));
    });
  });

  describe('#apexRest', () => {
    it('should create a proper request for a custom Apex REST endpoint', () => {
      return org
        .apexRest({ uri: 'sample', oauth: oauth })
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal('/services/apexrest/sample');
          api.getLastRequest().method.should.equal('GET');
        });
    });

    it('should strip leading slash from uri', () => {
      return org
        .apexRest({ uri: '/sample', oauth: oauth })
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal('/services/apexrest/sample');
        });
    });
  });

  describe('#getBinaryContent', () => {
    it('should reject on invalid type', () => {
      return org
        .getBinaryContent({ sobject: nforce.createSObject('Account'), oauth: oauth })
        .then(() => { throw new Error('should have rejected'); })
        .catch((err) => {
          err.message.should.match(/invalid type/);
        });
    });
  });

  describe('#getBody deprecation shim', () => {
    it('should delegate to getBinaryContent and emit a warning', (done) => {
      let warned = false;
      const listener = (warning) => {
        if (warning.code === 'NFORCE8_DEPRECATED_GETBODY') {
          warned = true;
        }
      };
      process.on('warning', listener);
      org
        .getBody({ sobject: nforce.createSObject('Account'), oauth: oauth })
        .catch(() => {})
        .finally(() => {
          process.removeListener('warning', listener);
          warned.should.be.true();
          done();
        });
    });
  });

  // reset the lastRequest
  afterEach(() => api.reset());

  // close mock server
  after((done) => api.stop(done));
});
