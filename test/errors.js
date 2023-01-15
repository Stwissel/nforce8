const nforce = require('../');
const api = require('./mock/sfdc-rest-api');
let port = process.env.PORT || 3000;
const should = require('should');

const org = nforce.createConnection(api.getClient());
const oauth = api.getOAuth();

// Shortcut for most used response
const jsonResponse = (body, code = 200) => {
  return {
    code: code,
    headers: { 'content-type': 'application/json;charset=UTF-8' },
    body: body
  };
};

describe('api-mock-errors', () => {
  describe('invalid json errors', () => {
    it('should return invalid json error on bad json from authenticate', (done) => {
      let body = jsonResponse("{myproperty: 'invalid json'$$$$");
      api
        .getGoodServerInstance(body)
        .then(() => org.authenticate({ username: 'test', password: 'test' }))
        .then((resp) => should.not.exist(resp))
        .catch((err) => {
          should.exist(err);
          should.exist(err.type);
          err.type.should.equal('invalid-json');
        })
        .finally(done());
    });

    it('should return invalid json error on bad json from query', (done) => {
      let body = jsonResponse("{myproperty: 'invalid json'$$$$");
      api
        .getGoodServerInstance(body)
        .then(() =>
          org.query({ query: 'SELECT Id FROM Account', oauth: oauth })
        )
        .then((resp) => should.not.exist(resp))
        .catch((err) => {
          should.exist(err);
          should.exist(err.type);
          err.type.should.equal('invalid-json');
        })
        .finally(done());
    });
  });

  describe('closed socket', function () {
    it('should return an error on closed socket', (done) => {
      api
        .getClosedServerInstance()
        .then(() =>
          org.query({ query: 'SELECT Id FROM Account', oauth: oauth })
        )
        .then((resp) => should.not.exist(resp))
        .catch((err) => {
          should.exist(err);
          should.exist(err.type);
          should.exist(err.errno);
          err.type.should.equal('system');
          err.errno.should.equal('ECONNRESET');
        })
        .finally(done());
    });
  });
});
