let nforce = require('../');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback'
});
org.getVersions().then(
  function (res) {
    console.log(res);
  },
  function (err) {
    return console.log(err);
  }
);
