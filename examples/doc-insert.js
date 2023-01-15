let nforce = require('../');
let fs = require('fs');
let path = require('path');
let sfuser = process.env.SFUSER;
let sfpass = process.env.SFPASS;
let org = nforce.createConnection({
  clientId:
    '3MVG9rFJvQRVOvk5nd6A4swCyck.4BFLnjFuASqNZmmxzpQSFWSTe6lWQxtF3L5soyVLfjV3yBKkjcePAsPzi',
  clientSecret: '9154137956044345875',
  redirectUri: 'http://localhost:3000/oauth/_callback'
});
org
  .authenticate({
    username: sfuser,
    password: sfpass
  })
  .then(
    function (oauth) {
      let docPath = path.resolve(__dirname, './documents/testdoc.docx');
      let doc = nforce.createSObject('Document', {
        Name: 'testdoc',
        Description: 'This is a test doc',
        FolderId: '005d00000014XTP',
        Type: 'docx',
        attachment: {
          fileName: 'testdoc.docx',
          body: fs.readFileSync(docPath)
        }
      });

      org
        .insert({
          sobject: doc,
          oauth: oauth
        })
        .then(
          function (resp) {
            return console.log(resp);
          },
          function (err) {
            return console.error(err);
          }
        );
    },
    function (err) {
      console.error('unable to authenticate to sfdc');
    }
  );
