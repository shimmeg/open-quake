#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const readme = read('README.md');
const building = read('docs/building.md');

assert.match(readme, /Download for macOS/, 'README must present macOS as the primary download');
assert.doesNotMatch(readme, /Download for Windows/, 'README must not present Windows as the primary download');
assert.match(readme, /open-quake-\$\{version\}-\$\{arch\}\.dmg|open-quake-<version>-<arch>\.dmg/, 'README must document the macOS DMG artifact');
assert.match(readme, /Library\/Application Support\/open-quake/, 'README must document the macOS config location');
assert.doesNotMatch(readme, /%APPDATA%\\open-quake/, 'README must not document Windows config location as primary');

assert.match(building, /Build & run \(macOS\)/, 'building docs must make macOS the primary build section');
assert.match(building, /npm run dist:mac:dir/, 'building docs must document the unsigned macOS dir build');
assert.match(building, /CSC_IDENTITY_AUTO_DISCOVERY=false/, 'building docs must document unsigned local macOS packaging');
assert.doesNotMatch(building, /Build & run \(Windows\)/, 'building docs must not keep Windows as the primary build section');

console.log('macOS docs checks passed.');
