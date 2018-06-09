# nforce8 :: node.js salesforce REST API wrapper

This libary is based on a fork of Kevin O'Hara's brilliant
[nforce](https://github.com/kevinohara80/nforce) library. You might want to refer to the original!

## Rationale

I'm maintaining the [NodeRED](https://nodered.org/) modules for Salesforce: [node-red-contrib-salesforce](https://www.npmjs.com/package/node-red-contrib-salesforce). The nodes needed a more recent library version and a few patches to get it to work, so I had to fork the library.

[![Build Status](https://secure.travis-ci.org/stwissel/nforce8.png)](http://travis-ci.org/kevinohara80/nforce)
[![npm version](https://badge.fury.io/js/nforce8.svg)](https://badge.fury.io/js/nforce8)

## Original Documentation

Read it [here](https://www.npmjs.com/package/nforce)

## Updated documentation

Evolving documentation on [github.io](https://stwissel.github.io/nforce8)

## Important differences

- Version numbers, if provided, **must** be full qualified strings like `v42.0`, short numbers or string are no longer accepted. These will fail <strike>42 42.0 '42'</strike>

## Change Log

Overview documentation on [changes between versions](https://stwissel.github.io/nforce8/Changelog.html)
