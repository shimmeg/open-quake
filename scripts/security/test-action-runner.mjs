#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveAppPath,
  launchApp,
  runShellCommand,
  lockWorkstation,
} = require('../../app/actionRunner');

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    fs: {
      existsSync(file) {
        calls.push({ fn: 'existsSync', file });
        return Boolean(overrides.exists && overrides.exists(file));
      },
    },
    platform: overrides.platform || 'win32',
    exec(command, options) {
      calls.push({ fn: 'exec', command, options });
    },
    execFile(file, args, options, callback) {
      calls.push({ fn: 'execFile', file, args, options });
      const output = overrides.execFileOutput || '';
      callback(null, output);
    },
    shell: {
      async openPath(file) {
        calls.push({ fn: 'openPath', file });
        return '';
      },
    },
    spawn(file, args, options) {
      calls.push({ fn: 'spawn', file, args, options });
      return { unref() { calls.push({ fn: 'unref' }); } };
    },
    log(message) {
      calls.push({ fn: 'log', message });
    },
  };
}

test('resolveAppPath resolves a bare name via execFile (no shell injection)', async () => {
  const value = 'calc.exe" & whoami';
  const d = deps({
    execFileOutput: 'C:\\Windows\\System32\\calc.exe\r\n',
    exists: file => file === 'C:\\Windows\\System32\\calc.exe',
  });

  const resolved = await resolveAppPath(value, d);

  assert.equal(resolved, 'C:\\Windows\\System32\\calc.exe');
  assert.deepEqual(d.calls.find(c => c.fn === 'execFile'), {
    fn: 'execFile',
    file: 'where',
    args: [value],
    options: { windowsHide: true },
  });
  assert.equal(d.calls.some(c => c.fn === 'exec'), false);
});

test('launchApp opens a full path via shell.openPath, never a shell', async () => {
  const fullPath = 'C:\\Program Files\\Acme & Co\\app.exe';
  const d = deps({ exists: file => file === fullPath });

  const launched = await launchApp(fullPath, d);

  assert.equal(launched, true);
  assert.deepEqual(d.calls.filter(c => c.fn === 'openPath'), [{ fn: 'openPath', file: fullPath }]);
  assert.equal(d.calls.some(c => c.fn === 'exec'), false);
  assert.equal(d.calls.some(c => c.fn === 'spawn'), false);
});

test('launchApp resolves a bare name then spawns it detached (no shell)', async () => {
  const value = 'notepad && whoami';
  const d = deps({
    execFileOutput: 'C:\\Windows\\System32\\notepad.exe\r\n',
    exists: file => file === 'C:\\Windows\\System32\\notepad.exe',
  });

  const launched = await launchApp(value, d);

  assert.equal(launched, true);
  assert.deepEqual(d.calls.find(c => c.fn === 'execFile').args, [value]);
  assert.deepEqual(d.calls.find(c => c.fn === 'spawn'), {
    fn: 'spawn',
    file: 'C:\\Windows\\System32\\notepad.exe',
    args: [],
    options: { detached: true, stdio: 'ignore', windowsHide: true },
  });
  assert.equal(d.calls.some(c => c.fn === 'exec'), false);
});

test('runShellCommand passes the command through with windowsHide', () => {
  const d = deps();

  assert.equal(runShellCommand('echo ok && whoami', d), true);

  assert.deepEqual(d.calls, [{
    fn: 'exec',
    command: 'echo ok && whoami',
    options: { windowsHide: true },
  }]);
});

test('lockWorkstation on Windows uses rundll32 LockWorkStation', () => {
  const d = deps();

  assert.equal(lockWorkstation(d), true);

  assert.deepEqual(d.calls, [{
    fn: 'execFile',
    file: 'rundll32.exe',
    args: ['user32.dll,LockWorkStation'],
    options: { windowsHide: true },
  }]);
});

test('launchApp on macOS uses open -a for a bare app name', async () => {
  const d = deps({ platform: 'darwin' });

  const launched = await launchApp('Safari', d);

  assert.equal(launched, true);
  assert.deepEqual(d.calls.find(c => c.fn === 'execFile'), {
    fn: 'execFile',
    file: '/usr/bin/open',
    args: ['-a', 'Safari'],
    options: {},
  });
  assert.equal(d.calls.some(c => c.fn === 'exec'), false);
  assert.equal(d.calls.some(c => c.fn === 'spawn'), false);
});

test('launchApp on macOS opens an .app bundle path via openPath', async () => {
  const appPath = '/Applications/Visual Studio Code.app';
  const d = deps({ platform: 'darwin', exists: file => file === appPath });

  const launched = await launchApp(appPath, d);

  assert.equal(launched, true);
  assert.deepEqual(d.calls.filter(c => c.fn === 'openPath'), [{ fn: 'openPath', file: appPath }]);
  assert.equal(d.calls.some(c => c.fn === 'exec'), false);
});

test('lockWorkstation on macOS uses pmset displaysleepnow', () => {
  const d = deps({ platform: 'darwin' });

  assert.equal(lockWorkstation(d), true);

  assert.deepEqual(d.calls, [{
    fn: 'execFile',
    file: '/usr/bin/pmset',
    args: ['displaysleepnow'],
    options: {},
  }]);
});

test('macOS default config seeds no shell-command or Windows-only tiles', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../app/config.default.json', import.meta.url), 'utf8'));
  const tiles = (config.grids || []).flatMap(g => g.tiles || []);
  const appValues = tiles.filter(t => t && t.type === 'app').map(t => t.value);
  const cmdTiles = tiles.filter(t => t && t.type === 'cmd');
  const forbiddenWindowsValues = new Set(['msedge', 'explorer', 'notepad', 'calc', 'taskmgr', 'wt', 'snippingtool', 'mspaint', 'control', 'obs64']);

  assert.equal(cmdTiles.length, 0, 'macOS default config must not seed shell-command tiles');
  assert.equal(appValues.some(value => forbiddenWindowsValues.has(value)), false, 'macOS default config must not seed Windows-only app launch values');
  assert.ok(appValues.includes('Safari'), 'macOS default config should include Safari');
  assert.ok(appValues.includes('Finder'), 'macOS default config should include Finder');
  assert.ok(appValues.includes('System Settings'), 'macOS default config should include System Settings');
});
