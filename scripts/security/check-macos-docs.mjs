#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const readme = read('README.md');
const building = read('docs/building.md');
const privacy = read('PRIVACY.md');
const aiChat = read('docs/ai-chat.md');
const settings = read('docs/settings.md');
const docsIndex = read('docs/README.md');
const hardeningPath = 'docs/security/open-quake-hardening.md';
const hardening = fs.existsSync(hardeningPath) ? read(hardeningPath) : '';

assert.match(readme, /Run locally on macOS/, 'README must document local macOS source runs');
assert.match(readme, /security-hardening, macOS-focused fork of\s+\[TeeJS\/open-quake\]/, 'README must clearly state this repository is a fork');
assert.match(readme, /Thanks to \*\*TeeJS\*\* and\s+the upstream contributors/, 'README must credit the upstream developer and contributors');
assert.match(readme, /What this fork changes/, 'README must summarize how this fork differs from upstream');
assert.match(readme, /Electron renderer isolation/, 'README fork summary must mention security hardening');
assert.match(readme, /macOS the primary local-development target/, 'README fork summary must mention macOS local-development focus');
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

assert.doesNotMatch(privacy, /free, open-source Windows desktop application/, 'privacy docs must not describe the fork as a Windows desktop app');
assert.doesNotMatch(privacy, /does not record, capture, or transmit audio/i, 'privacy docs must not deny push-to-talk audio recording/transmission');
assert.doesNotMatch(privacy, /%APPDATA%\\open-quake/, 'privacy docs must not use Windows config path as the primary path');
assert.match(privacy, /Library\/Application Support\/open-quake/, 'privacy docs must document the macOS config location');
assert.match(privacy, /Push-to-talk records microphone audio only while held/i, 'privacy docs must disclose push-to-talk recording behavior');
assert.match(privacy, /Open WebUI transcription endpoint/i, 'privacy docs must disclose push-to-talk transcription upload destination');

assert.doesNotMatch(aiChat, /%APPDATA%\\open-quake/, 'Open WebUI docs must not use Windows config path as the primary path');
assert.doesNotMatch(aiChat, /api_key=|api_key…/, 'Open WebUI docs must not claim API keys are passed in the URL query');
assert.match(aiChat, /\/app-config/, 'Open WebUI docs must describe runtime config served outside the URL query');
assert.match(settings, /Library\/Application Support\/open-quake/, 'settings docs must document the macOS config location');
assert.doesNotMatch(settings, /%APPDATA%\\open-quake/, 'settings docs must not use Windows config path as the primary path');

assert.match(docsIndex, /open-quake-hardening\.md/, 'docs index must link the security hardening guide');
assert.ok(hardening, 'docs must include docs/security/open-quake-hardening.md');
assert.match(hardening, /Threat model/i, 'hardening guide must include a threat model');
assert.match(hardening, /Local secrets/i, 'hardening guide must describe local secrets');
assert.match(hardening, /Shell command macro risk/i, 'hardening guide must describe shell command macro risk');
assert.match(hardening, /Dashboard permissions/i, 'hardening guide must describe dashboard permissions');
assert.match(hardening, /Signing and release verification/i, 'hardening guide must describe signing and release verification');
assert.match(hardening, /PolyForm Noncommercial/i, 'hardening guide must include the protocol license warning');

console.log('macOS docs checks passed.');
