#!/usr/bin/env node

import assert from 'node:assert/strict';
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

{
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
}

{
  const fullPath = 'C:\\Program Files\\Acme & Co\\app.exe';
  const d = deps({ exists: file => file === fullPath });

  const launched = await launchApp(fullPath, d);

  assert.equal(launched, true);
  assert.deepEqual(d.calls.filter(c => c.fn === 'openPath'), [{ fn: 'openPath', file: fullPath }]);
  assert.equal(d.calls.some(c => c.fn === 'exec'), false);
  assert.equal(d.calls.some(c => c.fn === 'spawn'), false);
}

{
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
}

{
  const d = deps();

  assert.equal(runShellCommand('echo ok && whoami', d), true);

  assert.deepEqual(d.calls, [{
    fn: 'exec',
    command: 'echo ok && whoami',
    options: { windowsHide: true },
  }]);
}

{
  const d = deps();

  assert.equal(lockWorkstation(d), true);

  assert.deepEqual(d.calls, [{
    fn: 'execFile',
    file: 'rundll32.exe',
    args: ['user32.dll,LockWorkStation'],
    options: { windowsHide: true },
  }]);
}

console.log('Action runner security tests passed.');
