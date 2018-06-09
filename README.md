# nforce8 :: node.js salesforce REST API wrapper

This libary is based on a fork of Kevin O'Hara's brilliant
[nforce](https://github.com/kevinohara80/nforce) library. You might want to refer to the original!

## Code and build

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/719bc9f8685247fc8fdac704e596ee67)](https://www.codacy.com/app/Stwissel/nforce8?utm_source=github.com&utm_medium=referral&utm_content=Stwissel/nforce8&utm_campaign=Badge_Grade)
[![Build Status](https://secure.travis-ci.org/Stwissel/nforce8.png)](https://travis-ci.org/Stwissel/nforce8)
[![npm version](https://badge.fury.io/js/nforce8.svg)](https://badge.fury.io/js/nforce8)
[![Known Vulnerabilities](https://snyk.io/test/github/Stwissel/nforce8/badge.svg?targetFile=package.json)](https://snyk.io/test/github/Stwissel/nforce8?targetFile=package.json)

## Rationale

I'm maintaining the [NodeRED](https://nodered.org/) modules for Salesforce: [node-red-contrib-salesforce](https://www.npmjs.com/package/node-red-contrib-salesforce). The nodes needed a more recent library version and a few patches to get it to work, so I was too much tempted and forked the library.

## Original Documentation

Read it [here](https://www.npmjs.com/package/nforce)

## Updated documentation

Evolving documentation on [github.io](https://stwissel.github.io/nforce8)

## Important differences

- Version numbers, if provided, **must** be full qualified strings like `v42.0`, short numbers or string are no longer accepted. These will fail <strike>42 42.0 '42'</strike>

## Change Log

Overview documentation on [changes between versions](https://stwissel.github.io/nforce8/Changelog.html)
