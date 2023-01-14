# nforce8 :: node.js salesforce REST API wrapper

This libary is based on a fork of Kevin O'Hara's brilliant
[nforce](https://github.com/kevinohara80/nforce) library. You might want to refer to the original!

## Code and build

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/719bc9f8685247fc8fdac704e596ee67)](https://www.codacy.com/app/Stwissel/nforce8?utm_source=github.com&utm_medium=referral&utm_content=Stwissel/nforce8&utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/719bc9f8685247fc8fdac704e596ee67)](https://www.codacy.com/app/Stwissel/nforce8?utm_source=github.com&utm_medium=referral&utm_content=Stwissel/nforce8&utm_campaign=Badge_Coverage)
[![Build Status](https://secure.travis-ci.org/Stwissel/nforce8.png)](https://travis-ci.org/Stwissel/nforce8)
[![npm version](https://badge.fury.io/js/nforce8.svg)](https://badge.fury.io/js/nforce8)
[![Known Vulnerabilities](https://snyk.io/test/github/Stwissel/nforce8/badge.svg?targetFile=package.json)](https://snyk.io/test/github/Stwissel/nforce8?targetFile=package.json)
[![Greenkeeper badge](https://badges.greenkeeper.io/Stwissel/nforce8.svg)](https://greenkeeper.io/)
[![Coverage Status](https://coveralls.io/repos/github/Stwissel/nforce8/badge.svg?branch=master)](https://coveralls.io/github/Stwissel/nforce8?branch=master)

## Rationale

I'm maintaining the [NodeRED](https://nodered.org/) modules for Salesforce: [node-red-contrib-salesforce](https://www.npmjs.com/package/node-red-contrib-salesforce). The nodes needed a more recent library version and a few patches to get it to work, so I was too much tempted and forked the library.

## Original Documentation

Read it [here](https://www.npmjs.com/package/nforce)

## Updated documentation

Evolving documentation on [github.io](https://stwissel.github.io/nforce8)

## Important differences

- Version numbers, if provided, **must** be full qualified strings like `v42.0`, short numbers or string are no longer accepted. These will fail ~42 42.0 '42'~
- nforce8 only works with promises, no callback support
- Subscriptions to events need the full path, option of type gets ignored

## Change Log

Overview documentation on [changes between versions](https://stwissel.github.io/nforce8/Changelog.html)

## Features

- Promised based API
- Intelligent sObjects (inherited from [nforce](https://www.npmjs.com/package/nforce))
- Streaming support using [Faye](https://www.npmjs.com/package/faye) for any Salesforce topic including Change Data Capture
- Authentication helper methods (OAuth)
- Multi-user design with single user mode (inherited from [nforce](https://www.npmjs.com/package/nforce))

## Installation

```bash
npm install nforce8
```

## Usage

### Create a client connection

```js
const nforce = require('nforce8');

const org = nforce8.createConnection({
  clientId: 'CLIENT_ID_OAUTH',
  clientSecret: 'CLIENT_SECRET_OAUTH',
  redirectUri: 'https://yourapp.herokuapp.com/oauth/_callback', // could be http://localhost:3000/ instead
  apiVersion: 'v45.0',  // optional, defaults to current salesforce API version
  environment: 'production',  // optional, salesforce 'sandbox' or 'production', production default
  mode: 'multi' // optional, 'single' or 'multi' user mode, multi default
});
```

### Authenticate using OAuth

```js
// Multi-User
let oauth;
const creds = {username: 'john.doe@noreply.com', password: 'secretjohn'};
org.authenticate(creds)
   .then(result => oauth = result;)
   .catch(/* handle failure here */);

// Single user mode
const creds = {username: 'john.doe@noreply.com', password: 'secretjohn'};
org.authenticate(creds)
   .then(result => console.log(org.oauth.access_token);)
   .catch(/* handle failure here */);


### Use the object factory to create records

Sample based on original nforce. In single user mode the oauth argument can be omitted since it is cached in the connection object

```js

const acc = nforce.createSObject('Account');
acc.set('Name', 'ACME Corporation');
acc.set('Phone', '800-555-2345');
acc.set('SLA__c', 'Platinum');

const payload = { sobject: acc, oauth: oauth };

org.insert(payload)
.then(result => console.log(JSON.stringify(result)))
.catch(err => console.log(err));

```

### Query and update

Querying and updating records is super easy. **nforce** wraps API-queried records in a special object. The object caches field updates that you make to the record and allows you to pass the record directly into the update method without having to scrub out the unchanged fields. In the example below, only the Name and Industry fields will be sent in the update call despite the fact that the query returned other fields such as BillingCity and CreatedDate.

```js

const q = { query :'SELECT Id, Name, CreatedDate, BillingCity FROM Account WHERE Name = "ACME Corporation" LIMIT 1'};

org.query(q)
   .then(resp => {
       if (resp.records) {
           const acc = resp.records[0];
           acc.set('Name','ACME Coyote');
           acc.set('Industry','Explosives');
           const payload = {sobject: acc, oauth: oauth};
           org.update(payload)
            .then(result => console.log('It worked'));
       }
   })
   .catch(err => console.log(err));

```

### Streaming API Support

You need to specify the full topic starting with a slash

```js

const creds = {username: 'john.doe@noreply.com', password: 'secretjohn'};

org.authenticate(creds)
    .then(oauth => {
        const client = org.createStreamClient();
        const topic = {topic: '/data/ChangeEvents'};
        const cdc = client.subscribe(topic);
        cdc.on('error' err => {
            console.log('subscription error');
            console.log(err);
            client.disconnect();
        });
        cdc.on('data', data => console.log(data));
    })
    .catch(err => console.log(err));

```

Read the [nforce documentation](https://www.npmjs.com/package/nforce) for more details