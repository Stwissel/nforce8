const http = require('http');
const CONST = require('../../lib/constants');
const apiVersion = CONST.API;
let port = process.env.PORT || 3000;
let lastRequest = null;
let nextResponse = null;
let closeOnRequest = false;
let isListening = false;
let server = null;
let sockets = [];

// Listener function for http server
const serverListener = (req, res) => {
  lastRequest = req;
  lastRequest.body = '';

  // Incoming data
  const onData = (chunk) => (lastRequest.body += chunk.toString());

  // End of a request
  const onEnd = () => {
    // Close if requested
    if (closeOnRequest) {
      if (sockets.length) {
        for (const socket of sockets) {
          socket.destroy();
        }
      }
      return server.close();
    }

    // Otherwise return some results
    if (nextResponse) {
      res.writeHead(nextResponse.code, nextResponse.headers);
      if (nextResponse.body) {
        res.end(nextResponse.body, 'utf8');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json'
      });
      res.end('{"Status":"OK"}');
    }
  };

  req.on('data', onData);
  req.on('end', onEnd);
};

// Server functions
const onConnection = (socket) => {
  sockets.push(socket);
  socket.on('close', () => sockets.splice(sockets.indexOf(socket), 1));
};

const start = function (port, cb) {
  port = port || process.env.PORT || 3000;
  server = http.createServer(serverListener);
  server.on('listening', () => (isListening = true));
  server.on('close', () => (isListening = false));
  server.on('connection', onConnection);
  server.listen(port, (err) => (err ? cb(err) : cb()));
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

const setResponse = function (code, headers, body) {
  nextResponse = {
    code: code,
    headers: headers,
    body: body
  };
};

// return the last cached request
const getLastRequest = () => lastRequest;

// simulate a socket close on a request
const closeOnRequestFunc = (close) => (closeOnRequest = close);

// reset the cache
const reset = function () {
  lastRequest = null;
  nextResponse = null;
  closeOnRequest = false;
  sockets = [];
};

// close the server
const stop = (cb) => {
  if (!isListening || !server) {
    server = null;
    cb();
  } else {
    server.close(() => {
      server = null;
      cb();
    });
  }
};

module.exports = {
  start: start,
  getClient: getClient,
  getOAuth: getOAuth,
  setResponse: setResponse,
  getLastRequest: getLastRequest,
  closeOnRequest: closeOnRequestFunc,
  reset: reset,
  stop: stop
};
