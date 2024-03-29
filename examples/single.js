let nforce = require('../');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback',
  mode: 'single'
});
console.log('starting in mode: ' + org.mode);
org
  .authenticate({
    username: sfuser,
    password: sfpass
  })
  .then(
    function (res) {
      console.log('authenticated with mode: ' + org.mode);
      return org.query({
        query: 'SELECT Id, FirstName, LastName FROM Lead LIMIT 1'
      });
    },
    function (err) {
      return console.error('unable to authenticate to sfdc');
    }
  )
  .then(
    function (res) {
      console.log(res);
    },
    function (err) {
      return console.error(err);
    }
  );
