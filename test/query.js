'use strict';

const nforce = require('../index');
const should = require('should');
const api = require('./mock/sfdc-rest-api');
const port = process.env.PORT || 3000;

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
    let expected = `/services/data/'${apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;

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

  // reset the lastRequest
  afterEach(() => api.reset());

  // close mock server
  after((done) => done());
});
