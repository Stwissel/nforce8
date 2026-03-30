const nforce = require('../');
const { MockSfdcApi } = require('./mock/sfdc-rest-api');
const api = new MockSfdcApi(33335);
const should = require('should');
const errors = require('../lib/errors');
const { _buildSignal: buildSignal } = require('../lib/http');

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
  after((done) => api.stop(done));

  describe('invalid json errors', () => {
    it('should return invalid json error on bad json from authenticate', (done) => {
      let body = jsonResponse('{myproperty: \'invalid json\'$$$$');
      api
        .getGoodServerInstance(body)
        .then(() => org.authenticate({ username: 'test', password: 'test' }))
        .then((resp) => should.not.exist(resp))
        .catch((err) => {
          should.exist(err);
          should.exist(err.type);
          err.type.should.equal('invalid-json');
        })
        .finally(() => done());
    });

    it('should return invalid json error on bad json from query', (done) => {
      let body = jsonResponse('{myproperty: \'invalid json\'$$$$');
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
        .finally(() => done());
    });
  });

  describe('empty response errors', () => {
    it('should set err.type to empty-response', () => {
      const err = errors.emptyResponse();
      should.exist(err);
      err.message.should.equal('Unexpected empty response');
      should.exist(err.type);
      err.type.should.equal('empty-response');
    });
  });

  describe('buildSignal', () => {
    it('should return undefined when no timeout is set', () => {
      const result = buildSignal(undefined, undefined);
      should.not.exist(result);
    });

    it('should return existing signal when no timeout is set', () => {
      const controller = new AbortController();
      const result = buildSignal(controller.signal, undefined);
      result.should.equal(controller.signal);
    });

    it('should return a timeout signal when no existing signal', () => {
      const result = buildSignal(undefined, 5000);
      should.exist(result);
      result.should.be.instanceOf(AbortSignal);
    });

    it('should combine existing signal with timeout signal', () => {
      const controller = new AbortController();
      const result = buildSignal(controller.signal, 5000);
      should.exist(result);
      result.should.be.instanceOf(AbortSignal);
      result.should.not.equal(controller.signal);
    });

    it('should return the original signal when timeout is 0', () => {
      const controller = new AbortController();
      const result = buildSignal(controller.signal, 0);
      result.should.equal(controller.signal);
    });

    it('should abort combined signal when the user controller aborts', () => {
      const controller = new AbortController();
      const combined = buildSignal(controller.signal, 60000);
      combined.should.be.instanceOf(AbortSignal);
      combined.aborted.should.be.false();
      controller.abort();
      combined.aborted.should.be.true();
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
        .finally(() => done());
    });
  });
});
