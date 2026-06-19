#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const readme = read('README.md');
const building = read('docs/building.md');

assert.match(readme, /Run locally on macOS/, 'README must document local macOS source runs');
assert.match(readme, /npm ci/, 'README must document dependency installation');
assert.match(readme, /npm run rebuild/, 'README must document native module rebuild');
assert.match(readme, /npm start/, 'README must document local app startup');
assert.match(readme, /does not currently\s+publish ready-to-install macOS release artifacts|There is no published macOS app download/, 'README must not imply published macOS release artifacts exist');
assert.doesNotMatch(readme, /Download for macOS/, 'README must not present a macOS download before artifacts exist');
assert.doesNotMatch(readme, /Grab a build from/, 'README must not claim release downloads before artifacts exist');
assert.doesNotMatch(readme, /Download for Windows/, 'README must not present Windows as the primary download');
assert.doesNotMatch(readme, /open-quake-\$\{version\}-\$\{arch\}\.dmg|open-quake-<version>-<arch>\.dmg/, 'README must not document a macOS DMG artifact before release builds exist');
assert.match(readme, /Library\/Application Support\/open-quake/, 'README must document the macOS config location');
assert.doesNotMatch(readme, /%APPDATA%\\open-quake/, 'README must not document Windows config location as primary');

assert.match(building, /Build & run \(macOS\)/, 'building docs must make macOS the primary build section');
assert.match(building, /npm run dist:mac:dir/, 'building docs must document the unsigned macOS dir build');
assert.match(building, /CSC_IDENTITY_AUTO_DISCOVERY=false/, 'building docs must document unsigned local macOS packaging');
assert.doesNotMatch(building, /Build & run \(Windows\)/, 'building docs must not keep Windows as the primary build section');

console.log('macOS docs checks passed.');
