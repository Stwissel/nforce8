'use strict';

const nforce = require('../index');
const should = require('should');
const api = require('./mock/sfdc-rest-api');
const port = process.env.PORT || 33333;

const CONST = require('../lib/constants');
const apiVersion = CONST.API;

const orgMulti = nforce.createConnection(api.getClient());
const orgSingle = nforce.createConnection(api.getClient({ mode: 'single' }));

const testQuery = 'SELECT Id FROM Account LIMIT 1';
const oauth = api.getOAuth();

orgSingle.setOAuth(oauth);

function verifyAccessToken() {
  api
    .getLastRequest()
    .headers.should.have.property(
      'authorization',
      'Bearer ' + oauth.access_token
    );
}

describe('query', () => {
  // set up mock server
  before((done) => api.start(port, done));

  describe('#query', function () {
    let expected = `/services/data/${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;

    it('should work in multi-user mode with promises', (done) => {
      orgMulti
        .query({ query: testQuery, oauth: oauth })
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal(expected);
          api
            .getLastRequest()
            .headers.should.have.property(
              'authorization',
              'Bearer ' + oauth.access_token
            );
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });

    it('should work in single-user mode with promises', (done) => {
      orgSingle
        .query({ query: testQuery })
        .then((res) => {
          should.exist(res);
          const lr = api.getLastRequest();
          lr.url.should.equal(expected);
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });

    it('should allow a string query in single-user mode', (done) => {
      orgSingle
        .query(testQuery)
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal(expected);
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });
  });

  describe('#queryAll', function () {
    let expected =
      '/services/data/' +
      apiVersion +
      '/queryAll?q=SELECT+Id+FROM+Account+LIMIT+1';

    it('should work in multi-user mode with promises', (done) => {
      orgMulti
        .queryAll({ query: testQuery, oauth: oauth })
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal(expected);
          verifyAccessToken();
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });

    it('should work in single-user mode with promises', (done) => {
      orgSingle
        .queryAll({ query: testQuery })
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal(expected);
          verifyAccessToken();
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });

    it('should allow a string query in single-user mode', (done) => {
      orgSingle
        .queryAll(testQuery)
        .then((res) => {
          should.exist(res);
          api.getLastRequest().url.should.equal(expected);
          verifyAccessToken();
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });
  });

  describe('#search', function () {
    it('should return Record instances in searchRecords when raw is false', (done) => {
      let searchResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchRecords: [
            { attributes: { type: 'Account' }, Id: '001ABC', Name: 'Acme' },
            { attributes: { type: 'Account' }, Id: '001DEF', Name: 'Test' }
          ],
          totalSize: 2
        })
      };
      api
        .getGoodServerInstance(searchResponse)
        .then(() =>
          orgMulti.search({ search: 'FIND {Acme}', oauth: oauth })
        )
        .then((res) => {
          should.exist(res);
          res.searchRecords.length.should.equal(2);
          res.searchRecords[0].should.be.instanceOf(nforce.Record);
          res.searchRecords[0].hasChanged().should.equal(false);
          res.searchRecords[0].get('name').should.equal('Acme');
          res.totalSize.should.equal(2);
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });

    it('should return raw results when raw is true', (done) => {
      let searchResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchRecords: [
            { attributes: { type: 'Account' }, Id: '001ABC', Name: 'Acme' }
          ],
          totalSize: 1
        })
      };
      api
        .getGoodServerInstance(searchResponse)
        .then(() =>
          orgMulti.search({ search: 'FIND {Acme}', oauth: oauth, raw: true })
        )
        .then((res) => {
          should.exist(res);
          res.searchRecords.length.should.equal(1);
          res.searchRecords[0].should.not.be.instanceOf(nforce.Record);
          res.searchRecords[0].Name.should.equal('Acme');
        })
        .catch((err) => should.not.exist(err))
        .finally(() => done());
    });

    it('should return response as-is when searchRecords is empty', (done) => {
      let searchResponse = {
        code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchRecords: [],
          totalSize: 0
        })
      };
      api
        .getGoodServerInstance(searchResponse)
        .then(() =>
          orgMulti.search({ search: 'FIND {nothing}', oauth: oauth })
        )
        .then((res) => {
          should.exist(res);
          res.searchRecords.length.should.equal(0);
          res.totalSize.should.equal(0);
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
