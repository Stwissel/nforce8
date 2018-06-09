# Nforce8 Changelog

Documenting the main changes in reverse chronological order by version

## 3.0.0

The big rewrite (WIP): Transition to TypeScript

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
