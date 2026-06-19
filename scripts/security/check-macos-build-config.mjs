#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const build = pkg.build || {};

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} must be a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

assert.equal(pkg.scripts.dist, 'electron-builder --mac', '`npm run dist` must build the primary macOS artifact');
assert.equal(pkg.scripts['dist:mac'], 'electron-builder --mac', '`dist:mac` must build macOS artifacts');
assert.equal(pkg.scripts['dist:mac:dir'], 'electron-builder --mac dir', '`dist:mac:dir` must build an unpacked macOS app');
assert.equal(pkg.scripts['dist:win'], 'electron-builder --win', '`dist:win` must remain available for legacy Windows builds');

assert.ok(build.mac, 'electron-builder must define a mac target');
assert.deepEqual([...build.mac.target].sort(), ['dmg', 'zip'], 'mac target must produce dmg and zip');
assert.equal(build.mac.category, 'public.app-category.productivity');
assert.equal(build.mac.hardenedRuntime, true);
assert.equal(build.mac.entitlements, 'build/entitlements.mac.plist');
assert.equal(build.mac.entitlementsInherit, 'build/entitlements.mac.plist');
assert.equal(build.mac.icon, 'build/icon.png');
assert.ok(build.mac.extendInfo && build.mac.extendInfo.NSMicrophoneUsageDescription, 'mac Info.plist must explain microphone use');
assert.ok(fs.existsSync(build.mac.entitlements), 'mac entitlements plist must exist');
assert.equal(Object.prototype.hasOwnProperty.call(build.win || {}, 'sign'), false, 'deprecated win.sign must not block macOS electron-builder validation');
const macIcon = pngSize(build.mac.icon);
assert.ok(macIcon.width >= 512 && macIcon.height >= 512, 'mac icon must be at least 512x512 for electron-builder');

assert.ok(/open-quake-\$\{version\}-\$\{arch\}\.\$\{ext\}/.test(build.mac.artifactName), 'mac artifact name must include version and arch');
assert.ok(build.dmg && /open-quake-\$\{version\}-\$\{arch\}\.\$\{ext\}/.test(build.dmg.artifactName), 'dmg artifact name must include version and arch');

console.log('macOS build config checks passed.');
