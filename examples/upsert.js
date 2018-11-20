var nforce = require('../');
var sfuser = process.env.SFUSER;
var sfpass = process.env.SFPASS;
var oauth;
var org = nforce.createConnection({
    clientId: '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
    clientSecret: '9154137956044345875',
    redirectUri: 'http://localhost:3000/oauth/_callback',
    mode: 'single'
});
function createContact() {
    var account = nforce.createSObject('Account', { Name: 'Kevin Enterprises' });
    account.setExternalId('Account_No__c', '231');
    org.upsert({ sobject: account }).then(function (resp) {
        console.log('Account Id: ' + account.getId());    // undefined when update
    }, function (err) {
        return console.error(err);
    });
}
org.authenticate({
    username: sfuser,
    password: sfpass
}).then(function (resp) {
    console.log('--> authenticated!');
    createContact();
}, function (err) {
    console.error('--> unable to authenticate to sfdc');
    console.error('--> ' + JSON.stringify(err));
});