'use strict';

const http = require('http');
const CONST = require('../../lib/constants');
const apiVersion = CONST.API;

class MockSfdcApi {
  constructor(port) {
    this._port = port || process.env.PORT || 33333;
    this._serverStack = [];
    this._requestStack = [];
    this._defaultResponse = {
      code: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Status: 'OK' })
    };
  }

  reset() {
    this._requestStack.length = 0;
  }

  getLastRequest() {
    return this._requestStack[0];
  }

  clearServerStack() {
    const allPromises = [];
    let curServer = this._serverStack.pop();
    while (curServer) {
      curServer.closeAllConnections();
      allPromises.push(new Promise((resolve) => curServer.close(resolve)));
      curServer = this._serverStack.pop();
    }
    return Promise.all(allPromises);
  }

  getServerInstance(serverListener) {
    return this.clearServerStack().then(() => {
      return new Promise((resolve, reject) => {
        const server = http.createServer(serverListener);
        server.listen(this._port, (err) => {
          if (err) {
            reject(err);
          } else {
            this._serverStack.push(server);
            resolve(server);
          }
        });
      });
    });
  }

  getGoodServerInstance(response) {
    const resp = response || this._defaultResponse;
    const self = this;
    const serverListener = (req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        req.body = Buffer.concat(chunks).toString();
        self._requestStack.push(req);
        const headers = Object.assign({ Connection: 'close' }, resp.headers);
        res.writeHead(resp.code, headers);
        if (resp.body) {
          res.end(resp.body, 'utf8');
        } else {
          res.end();
        }
      });
    };
    return this.getServerInstance(serverListener);
  }

  getClosedServerInstance() {
    const serverListener = (req) => {
      const fatError = new Error('ECONNRESET');
      fatError.type = 'system';
      fatError.errno = 'ECONNRESET';
      req.destroy(fatError);
    };
    return this.getServerInstance(serverListener);
  }

  getClient(opts) {
    opts = opts || {};
    return {
      clientId: 'ADFJSD234ADF765SFG55FD54S',
      clientSecret: 'adsfkdsalfajdskfa',
      redirectUri: 'http://localhost:' + this._port + '/oauth/_callback',
      loginUri: 'http://localhost:' + this._port + '/login/uri',
      apiVersion: opts.apiVersion || apiVersion,
      mode: opts.mode || 'multi',
      autoRefresh: opts.autoRefresh || false,
      onRefresh: opts.onRefresh || undefined
    };
  }

  getOAuth() {
    return {
      id: 'http://localhost:' + this._port + '/id/00Dd0000000fOlWEAU/005d00000014XTPAA2',
      issued_at: '1362448234803',
      instance_url: 'http://localhost:' + this._port,
      signature: 'djaflkdjfdalkjfdalksjfalkfjlsdj',
      access_token: 'aflkdsjfdlashfadhfladskfjlajfalskjfldsakjf'
    };
  }

  start(incomingPort, cb) {
    this._port = incomingPort;
    this.getGoodServerInstance()
      .then(() => cb())
      .catch((err) => {
        console.error(err);
        cb(err);
      });
  }

  stop(cb) {
    this.clearServerStack()
      .catch(console.error)
      .finally(() => cb());
  }
}

module.exports = { MockSfdcApi };
