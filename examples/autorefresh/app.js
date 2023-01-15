let nforce = require('../../');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
let express = require('express');
let bodyParser = require('body-parser');
let session = require('express-session');
let cookieParser = require('cookie-parser');
let app = express();
function getLast10(token) {
  return token.substr(token.length - 10);
}
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback',
  autoRefresh: true,
  onRefresh: function (newOauth, oldOauth, cb) {
    console.log('start refresh callback ---->');
    console.log('old access_token: ' + getLast10(oldOauth.access_token));
    console.log('new access_token: ' + getLast10(newOauth.access_token));
    console.log('<---- end refresh callback');
    // execute the callback
    cb();
  }
});
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
//app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(
  session({
    secret: 'somesecret',
    key: 'sid'
  })
);
app.use(
  org.expressOAuth({
    onSuccess: '/',
    onError: '/oauth/error'
  })
);
app.get('/').then(function (res) {
  let status;
  if (req.query.status) {
    if (req.query.status === 'rejected') {
      status = req.query.status;
      authed = false;
    } else if (req.query.status === 'ok') {
      status = req.query.status;
      authed = true;
    }
  } else if (req.session.oauth) {
    status = 'authenticated';
    authed = true;
  } else {
    status = 'not authenticated';
    authed = false;
  }
  res.render('index', {
    authed: authed,
    status: status
  });
});
app.get('/oauth/authorize').then(function (res) {
  res.redirect(org.getAuthUri());
});
app
  .get('/oauth/invalidate')
  .then(function (res) {
    return org.revokeToken({ token: req.session.oauth.access_token });
  })
  .then(
    function (body) {},
    function (err) {
      throw err;
    }
  );
app
  .get('/query')
  .then(function (res) {
    console.log(
      'requesting query with token: ' +
        getLast10(req.session.oauth.access_token)
    );
    return org.query({
      query: 'SELECT Id FROM Account LIMIT 1',
      oauth: req.session.oauth
    });
  })
  .then(
    function (body) {},
    function (err) {
      throw err;
    }
  );
console.log('listening on 3000');
app.listen(3000);
