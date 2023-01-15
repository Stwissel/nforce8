const { resolvePtr } = require('dns');
const http = require('http');
const CONST = require('../../lib/constants');
const apiVersion = CONST.API;
let port = process.env.PORT || 3000;
let serverStack = [];
let requestStack = [];

const reset = () => {
  requestStack.length = 0;
};

const getLastRequest = () => requestStack[0];

// Default answer, when none provided
const defaultResponse = {
  code: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ Status: 'OK' })
};

// Clear out the server
const clearServerStack = () => {
  let allPromises = [];
  let curServer = serverStack.pop();
  while (curServer) {
    allPromises.push(curServer.close());
    curServer = serverStack.pop();
  }
  return Promise.all(allPromises);
};

// Returns a server instance with a predefinded answer
const getServerInstance = (serverListener) => {
  return new Promise((resolve, reject) => {
    clearServerStack()
      .then(() => {
        let server = http.createServer(serverListener);
        server.listen(port, (err) => {
          if (err) {
            reject(err);
          } else {
            serverStack.push(server);
            resolve(server);
          }
        });
      })
      .catch(reject);
  });
};

const getGoodServerInstance = (response = defaultResponse) => {
  const serverListener = (req, res) => {
    requestStack.push(req);
    res.writeHead(response.code, response.headers);
    if (response.body) {
      res.end(response.body, 'utf8');
    }
  };
  return getServerInstance(serverListener);
};

const getClosedServerInstance = () => {
  const serverListener = (req, res) => {
    console.log(req.url);
    const fatError = new Error('ECONNRESET');
    fatError.type = 'system';
    fatError.errno = 'ECONNRESET';
    req.destroy(fatError);
  };
  return getServerInstance(serverListener);
};

// return an example client
const getClient = function (opts) {
  opts = opts || {};
  return {
    clientId: 'ADFJSD234ADF765SFG55FD54S',
    clientSecret: 'adsfkdsalfajdskfa',
    redirectUri: 'http://localhost:' + port + '/oauth/_callback',
    loginUri: 'http://localhost:' + port + '/login/uri',
    apiVersion: opts.apiVersion || apiVersion,
    mode: opts.mode || 'multi',
    autoRefresh: opts.autoRefresh || false,
    onRefresh: opts.onRefresh || undefined
  };
};

// return an example oauth
const getOAuth = function () {
  return {
    id:
      'http://localhost:' + port + '/id/00Dd0000000fOlWEAU/005d00000014XTPAA2',
    issued_at: '1362448234803',
    instance_url: 'http://localhost:' + port,
    signature: 'djaflkdjfdalkjfdalksjfalkfjlsdj',
    access_token: 'aflkdsjfdlashfadhfladskfjlajfalskjfldsakjf'
  };
};

const start = (incomingPort, cb) => {
  port = incomingPort;
  getGoodServerInstance()
    .catch(console.error)
    .finally(() => cb());
};
const stop = (cb) => {
  clearServerStack()
    .catch(console.error)
    .finally(() => cb());
};

module.exports = {
  getGoodServerInstance: getGoodServerInstance,
  getClosedServerInstance: getClosedServerInstance,
  getClient: getClient,
  getOAuth: getOAuth,
  getLastRequest: getLastRequest,
  reset: reset,
  start: start,
  stop: stop
};
