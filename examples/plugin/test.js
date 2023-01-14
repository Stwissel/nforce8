let nforce = require('../../');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
// load the plugin
require('./myplugin')(nforce);
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback',
  mode: 'single',
  plugins: ['myplugin']
});
console.log(org.myplugin.foo());
// => 'bar'
org.myplugin.getApiVersion().then(
  function (msg) {
    console.log(msg); // => current api version
  },
  function (err) {
    throw err;
  }
);
console.log(org.myplugin.doValidateOAuth({ invalid: 'oauth' })); // => 'false'
