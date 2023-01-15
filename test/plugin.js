/* jshint -W030 */

let nforce = require('../');
let should = require('should');

describe('index', function () {
  describe('#plugin', function () {
    it('should allow extending with functions', function () {
      should.exist(nforce.plugin);
      nforce.plugin.should.be.a.Function;

      let plugin = nforce.plugin('myplugin');

      plugin.fn('foo', function () {
        return 'bar';
      });

      let org = nforce.createConnection({
        clientId: 'SOME_OAUTH_CLIENT_ID',
        clientSecret: 'SOME_OAUTH_CLIENT_SECRET',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        apiVersion: 'v24.0',
        environment: 'production',
        plugins: ['myplugin']
      });

      should.exist(org.myplugin.foo);
      org.myplugin.foo.should.be.a.Function;

      let result = org.myplugin.foo();

      result.should.equal('bar');
    });

    it('should not allow non-functions when calling fn', function () {});

    it('should have util methods', function () {
      let plugin = nforce.plugin('utilplugin');

      should.exist(plugin.util);
      should.exist(plugin.util.validateOAuth);
      plugin.util.validateOAuth.should.be.a.Function;
    });

    it('should throw when creating a connection with missing plugins', function () {
      (function () {
        let org = nforce.createConnection({
          clientId: 'SOME_OAUTH_CLIENT_ID',
          clientSecret: 'SOME_OAUTH_CLIENT_SECRET',
          redirectUri: 'http://localhost:3000/oauth/_callback',
          apiVersion: 'v24.0',
          environment: 'production',
          plugins: ['missingplugin']
        });
      }.should.throw());
    });

    it('should allow an options object with namespace', function () {
      (function () {
        let plugin = nforce.plugin({ namespace: 'myplugin2' });
      }.should.not.throw());
    });

    it('should not allow overriding existing plugins', function () {
      let plugin1 = nforce.plugin('myplugin3');

      (function () {
        let plugin2 = nforce.plugin('myplugin3');
      }.should.throw());
    });

    it('should not load plugins not specified', function () {
      let plugin = nforce.plugin('myplugin4');

      let org = nforce.createConnection({
        clientId: 'SOME_OAUTH_CLIENT_ID',
        clientSecret: 'SOME_OAUTH_CLIENT_SECRET',
        redirectUri: 'http://localhost:3000/oauth/_callback',
        apiVersion: 'v24.0',
        environment: 'production',
        plugins: []
      });

      should.not.exist(org.myplugin4);
    });
  });
});
