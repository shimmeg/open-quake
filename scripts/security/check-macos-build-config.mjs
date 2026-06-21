#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const mainSource = fs.readFileSync('app/main.js', 'utf8');
const npmrc = fs.existsSync('.npmrc') ? fs.readFileSync('.npmrc', 'utf8') : '';
const build = pkg.build || {};

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} must be a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

assert.equal(pkg.scripts.dist, 'electron-builder --mac', '`npm run dist` must build the primary macOS artifact');
assert.equal(pkg.engines?.node, '>=22.12 <27', 'Node engines must allow Node 24 LTS through Node 26');
assert.equal(pkg.dependencies?.robotjs, undefined, 'robotjs must not be a hard dependency');
assert.equal(pkg.optionalDependencies?.robotjs, '^0.7.1', 'robotjs must remain an optional media-key fallback');
assert.match(npmrc, /^disturl=https:\/\/nodejs\.org\/download\/release$/m, 'project .npmrc must keep Node headers for npm install under Node 26');
assert.equal(pkg.scripts['dist:mac'], 'electron-builder --mac', '`dist:mac` must build macOS artifacts');
assert.equal(pkg.scripts['dist:mac:dir'], 'electron-builder --mac dir', '`dist:mac:dir` must build an unpacked macOS app');
assert.equal(pkg.scripts['build:macos-media-helper'], 'node scripts/build-macos-media-key-helper.mjs', '`build:macos-media-helper` must build the macOS media-key helper');
assert.match(pkg.scripts.rebuild, /npm run build:macos-media-helper/, '`npm run rebuild` must build the macOS media-key helper');
assert.equal(pkg.scripts.predist, 'npm run build:macos-media-helper', '`npm run dist` must prebuild the macOS media-key helper');
assert.equal(pkg.scripts['predist:mac'], 'npm run build:macos-media-helper', '`npm run dist:mac` must prebuild the macOS media-key helper');
assert.equal(pkg.scripts['predist:mac:dir'], 'npm run build:macos-media-helper', '`npm run dist:mac:dir` must prebuild the macOS media-key helper');
assert.equal(pkg.scripts['build:smtc'], 'node build-smtc.js', '`build:smtc` must be available for the Windows album-art helper');
assert.equal(pkg.scripts['start:win'], 'node build-smtc.js && electron .', '`start:win` must prebuild the Windows album-art helper');
assert.equal(pkg.scripts['dist:win'], 'node build-smtc.js && electron-builder --win', '`dist:win` must prebuild the Windows album-art helper');

assert.ok(build.mac, 'electron-builder must define a mac target');
assert.deepEqual([...build.mac.target].sort(), ['dmg', 'zip'], 'mac target must produce dmg and zip');
assert.equal(build.mac.category, 'public.app-category.productivity');
assert.equal(build.mac.hardenedRuntime, true);
assert.equal(build.mac.entitlements, 'packaging/macos/entitlements.mac.plist');
assert.equal(build.mac.entitlementsInherit, 'packaging/macos/entitlements.mac.plist');
assert.equal(build.mac.icon, 'packaging/macos/icon.png');
assert.ok(build.mac.extendInfo && build.mac.extendInfo.NSMicrophoneUsageDescription, 'mac Info.plist must explain microphone use');
assert.ok(fs.existsSync(build.mac.entitlements), 'mac entitlements plist must exist');
assert.ok(fs.existsSync('native/macos/open-quake-media-key.m'), 'macOS media-key helper source must exist');
assert.ok((build.asarUnpack || []).includes('app/native/**'), 'macOS media-key helper must be unpacked so it can execute');
assert.equal(Object.prototype.hasOwnProperty.call(build.win || {}, 'sign'), false, 'deprecated win.sign must not block macOS electron-builder validation');
const macIcon = pngSize(build.mac.icon);
assert.ok(macIcon.width >= 512 && macIcon.height >= 512, 'mac icon must be at least 512x512 for electron-builder');

assert.ok(/open-quake-\$\{version\}-\$\{arch\}\.\$\{ext\}/.test(build.mac.artifactName), 'mac artifact name must include version and arch');
assert.ok(build.dmg && /open-quake-\$\{version\}-\$\{arch\}\.\$\{ext\}/.test(build.dmg.artifactName), 'dmg artifact name must include version and arch');
assert.match(mainSource, /panelWin\.setMenuBarVisibility\(false\)/, 'panel window must hide the macOS/Electron menu bar');
assert.match(mainSource, /panelWin\.setSimpleFullScreen\(true\)/, 'panel window must enter fullscreen on the device display');

console.log('macOS build config checks passed.');
