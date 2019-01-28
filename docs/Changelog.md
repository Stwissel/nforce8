# Nforce8 Changelog

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/719bc9f8685247fc8fdac704e596ee67)](https://www.codacy.com/app/Stwissel/nforce8?utm_source=github.com&utm_medium=referral&utm_content=Stwissel/nforce8&utm_campaign=Badge_Grade)
[![Build Status](https://secure.travis-ci.org/Stwissel/nforce8.png)](https://travis-ci.org/Stwissel/nforce8)
[![npm version](https://badge.fury.io/js/nforce8.svg)](https://badge.fury.io/js/nforce8)
[![Known Vulnerabilities](https://snyk.io/test/github/Stwissel/nforce8/badge.svg?targetFile=package.json)](https://snyk.io/test/github/Stwissel/nforce8?targetFile=package.json)
[![Greenkeeper badge](https://badges.greenkeeper.io/Stwissel/nforce8.svg)](https://greenkeeper.io/)
[![Coverage Status](https://coveralls.io/repos/github/Stwissel/nforce8/badge.svg?branch=master)](https://coveralls.io/github/Stwissel/nforce8?branch=master)

## Changes

Documenting the main changes in reverse chronological order by version

### 2.0.6

- add support for replayId in stream subscription

### 2.0.5

- added back minimal documentation in readme
- update package dependencies to latest versions

### 2.0.4

- Example code converted to use promises only

## 2.0.3

- added code coverage with instanbul and coveralls
- fixed (partially) samples and documentation

## 2.0.2

- Remove bluebird dependency with platform native promises
- Swapped `request` for `node-fetch`
- Added `SFDC_API_VERSION` to read API Version from environment
- API default now `v42.0` - only fully qualified version strings are accepted
- Removed callback API support, promises only

## 1.10.0-fork

Updated all dependencies to current packages;

- "bluebird": "^3.5.1",
- "faye": "1.2.4",
- "lodash": "^4.17.5",
- "mime": "2.0.3",
- "request": "2.86.0"
