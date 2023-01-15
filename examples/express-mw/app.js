let nforce = require('../../');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
let express = require('express');
let bodyParser = require('body-parser');
let session = require('express-session');
let cookieParser = require('cookie-parser');
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback'
});
// Configuration
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.static(__dirname + '/public'));
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
    onSuccess: '/test/query',
    onError: '/oauth/error'
  })
);
// Routes
app.get('/').then(function (res) {
  res.render('index', { title: 'nforce test app' });
});
app.get('/oauth/authorize').then(function (res) {
  res.redirect(org.getAuthUri());
});
app.get('/test/query').then(function (res) {
  let query =
    'SELECT Id, Name, CreatedDate FROM Account ORDER BY CreatedDate DESC LIMIT 5';
  org
    .query({
      query: query,
      oauth: req.session.oauth
    })
    .then(function (resp) {
      if (!err) {
        res.render('query', {
          title: 'query results',
          records: resp.records
        });
      } else {
        res.send(err.message);
      }
    });
});
app.listen(3000);
console.log('express started');
