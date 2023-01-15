let nforce = require('../');
let http = require('http');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
let port = process.env.PORT || 3000;
let attId = '00Pd0000002dsAO';
// this is a png file I attached to a lead
let oauth;
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback'
});
let server = http.createServer().then(function (res) {
  if (req.url === '/') {
    // example using a callback
    // http://localhost:3000/
    org
      .getAttachmentBody({
        id: attId,
        oauth: oauth
      })
      .then(
        function (resp) {
          res.writeHead(200, {
            'content-type': 'image/png'
          });
          res.end(resp);
        },
        function (err) {
          console.error(err);
          throw err;
        }
      );
  } else {
    res.writeHead(404);
    res.end();
  }
});
console.log('authenticating to salesforce');
org
  .authenticate({
    username: sfuser,
    password: sfpass
  })
  .then(
    function (resp) {
      oauth = resp;
      server.listen(port);
      console.log('http server listening on port ' + port);
    },
    function (err) {
      console.error('unable to authenticate to salesforce');
      console.error(err);
    }
  );
