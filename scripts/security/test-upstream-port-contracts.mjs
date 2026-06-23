#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

function read(rel) {
  return fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

test('Electron 42 dashboard popup handling uses setWindowOpenHandler in main', () => {
  const main = read('app/main.js');
  const panel = read('app/index.js');

  assert.doesNotMatch(panel, /addEventListener\(\s*['"]new-window['"]/);
  assert.match(main, /app\.on\(\s*['"]web-contents-created['"]/);
  assert.match(main, /contents\.getType\(\)\s*!==\s*['"]webview['"]/);
  assert.match(main, /contents\.setWindowOpenHandler\(/);
  assert.match(main, /openExternalUrl\(url\)/);
});

test('device display detection prefers DK-QUAKE labels and scale-adjusted panel size', () => {
  const main = read('app/main.js');

  assert.match(main, /function\s+isPanelSize\s*\(/);
  assert.match(main, /dk\.\?quake\|aris\.\?68/i);
  assert.match(main, /screen\.getAllDisplays\(\)/);
  assert.match(main, /scaleFactor/);
  assert.match(main, /Math\.round\(d\.bounds\.width\s*\*\s*s\)/);
});

test('mic LED state is reasserted on a cold-boot stagger', () => {
  const main = read('app/main.js');

  assert.match(main, /const\s+reassertMic\s*=/);
  assert.match(main, /\[\s*2000\s*,\s*5000\s*,\s*9000\s*\]\.forEach/);
  assert.match(main, /applyMic\(micState\)/);
});

test('dashboard pages can opt into a desktop browser identity', () => {
  const config = read('app/config.js');
  const panel = read('app/index.js');

  assert.match(config, /id=["']gUA["']/);
  assert.match(config, /g\.desktopUA\s*=\s*e\.target\.checked/);
  assert.match(panel, /DESKTOP_UA/);
  assert.match(panel, /web\.getUserAgent\(\)/);
  assert.match(panel, /web\.setUserAgent\(ua\)/);
  assert.match(panel, /pendingDesktop/);
  assert.match(panel, /webDesktop/);
  assert.match(panel, /g\.desktopUA/);
});

test('About and version UI are exposed through hardened IPC', () => {
  const main = read('app/main.js');
  const preload = read('app/config-preload.js');
  const config = read('app/config.js');

  assert.match(main, /function\s+showAbout\s*\(/);
  assert.match(main, /open-quake v['"]?\s*\+\s*app\.getVersion\(\)/);
  assert.match(main, /About open-quake/);
  assert.match(main, /openExternalUrl\(['"]https:\/\/github\.com\/TeeJS\/open-quake['"]\)/);
  assert.match(main, /ipcMain\.handle\(\s*['"]getVersion['"]/);
  assert.match(main, /label:\s*['"]open-quake v['"]\s*\+\s*app\.getVersion\(\)/);
  assert.match(preload, /getVersion\(\)\s*\{/);
  assert.match(config, /id=["']appVer["']/);
  assert.match(config, /configApi\.getVersion\(\)/);
});
