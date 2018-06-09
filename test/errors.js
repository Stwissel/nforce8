var nforce = require("../");
var api = require("./mock/sfdc-rest-api");
var port = process.env.PORT || 3000;
var should = require("should");

var org = nforce.createConnection(api.getClient());
var oauth = api.getOAuth();

describe("api-mock-errors", function() {
  beforeEach(done => {
    api.start(port, done);
  });

  describe("invalid json errors", function() {
    it("should return invalid json error on bad json from authenticate", done => {
      var body = "{myproperty: 'invalid json'$$$$";
      api.setResponse(
        200,
        { "content-type": "application/json;charset=UTF-8" },
        body
      );
      org
        .authenticate({ username: "test", password: "test" })
        .then(resp => {
          should.not.exist(resp);
        })
        .catch(err => {
          should.exist(err);
          should.exist(err.type);
          err.type.should.equal("invalid-json");
        })
        .then(done, done);
    });

    it("should return invalid json error on bad json from query", done => {
      var body = "{myproperty: 'invalid json'$$$$";
      api.setResponse(
        200,
        { "content-type": "application/json;charset=UTF-8" },
        body
      );
      org
        .query({ query: "SELECT Id FROM Account", oauth: oauth })
        .then(resp => {
          should.not.exist(resp);
        })
        .catch(err => {
          should.exist(err);
          should.exist(err.type);
          err.type.should.equal("invalid-json");
        })
        .then(done, done);
    });
  });

  describe("closed socket", function() {
    it("should return an error on closed socket", done => {
      api.closeOnRequest(true);
      org
        .query({ query: "SELECT Id FROM Account", oauth: oauth })
        .then(resp => {
          should.not.exist(resp);
        })
        .catch(err => {
          should.exist(err);
          should.exist(err.type);
          should.exist(err.errno);
          err.type.should.equal("system");
          err.errno.should.equal("ECONNRESET");
        })
        .then(done, done);
    });
  });

  // reset the lastRequest
  afterEach(done => {
    api.reset();
    api.stop(done);
  });
});
