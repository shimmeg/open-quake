#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mainSource = fs.readFileSync('app/main.js', 'utf8');
const musicSource = fs.readFileSync('app/musicview.html', 'utf8');
const sysserverSource = fs.readFileSync('app/sysserver.js', 'utf8');

assert.match(mainSource, /require\('\.\/mediaKeys'\)/, 'main process must use the narrow mediaKeys adapter');
assert.doesNotMatch(mainSource, /robot\.keyTap\(/, 'main process must not call robotjs keyTap directly');
assert.doesNotMatch(mainSource, /require\(['"]robotjs['"]\)/, 'main process must not load robotjs directly');
assert.doesNotMatch(musicSource, /media\(['"]stop['"]\)/, 'Music page must not expose a Stop transport button');
assert.match(musicSource, /bPause[\s\S]{0,240}media\(['"]playpause['"]\)/, 'Music page secondary transport button must use play/pause');
assert.doesNotMatch(sysserverSource, /\bstop\s*:\s*1\b/, 'localhost media route must not accept Stop as a transport command');

const { createMediaKeys } = require('../../app/mediaKeys');

function robotStub() {
  const taps = [];
  return {
    taps,
    keyTap(key) {
      taps.push(key);
    },
  };
}

{
  const robot = robotStub();
  const mediaKeys = createMediaKeys({ robot, platform: 'linux' });

  assert.equal(mediaKeys.transport('playpause'), true);
  assert.equal(mediaKeys.transport('next'), true);
  assert.equal(mediaKeys.transport('prev'), true);
  assert.deepEqual(robot.taps, ['audio_play', 'audio_next', 'audio_prev']);
}

{
  const robot = robotStub();
  const mediaKeys = createMediaKeys({ robot, platform: 'linux' });

  assert.equal(mediaKeys.volume(1), true);
  assert.equal(mediaKeys.volume(-1), true);
  assert.equal(mediaKeys.volume('mute'), true);
  assert.deepEqual(robot.taps, ['audio_vol_up', 'audio_vol_down', 'audio_mute']);
}

{
  const robot = robotStub();
  const mediaKeys = createMediaKeys({ robot, platform: 'linux' });

  assert.equal(mediaKeys.transport('brightness'), false, 'adapter must reject unsupported transport commands');
  assert.equal(mediaKeys.transport('stop'), false, 'adapter must reject Stop now that the Music page uses play/pause');
  assert.equal(mediaKeys.volume(0), false, 'adapter must reject unsupported volume commands');
  assert.deepEqual(robot.taps, []);
}

{
  const mediaKeys = createMediaKeys({ robot: null, platform: 'linux' });

  assert.equal(mediaKeys.transport('playpause'), false, 'adapter must fail closed without robotjs');
  assert.equal(mediaKeys.volume('mute'), false, 'adapter must fail closed without robotjs');
}

{
  const mediaKeys = createMediaKeys({ robot: { keyTap() { throw new Error('denied'); } }, platform: 'linux' });

  assert.equal(mediaKeys.transport('playpause'), false, 'adapter must not throw if the native backend fails');
  assert.equal(mediaKeys.volume('mute'), false, 'adapter must not throw if the native backend fails');
}

{
  const robot = robotStub();
  const helperCalls = [];
  const mediaKeys = createMediaKeys({
    robot,
    platform: 'darwin',
    helperPath: '/tmp/open-quake-media-key',
    fs: { existsSync(path) { return path === '/tmp/open-quake-media-key'; } },
    spawnSync(command, args, options) {
      helperCalls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(mediaKeys.transport('playpause'), true);
  assert.equal(mediaKeys.transport('next'), true);
  assert.equal(mediaKeys.transport('prev'), true);
  assert.equal(mediaKeys.volume(1), true);
  assert.equal(mediaKeys.volume(-1), true);
  assert.equal(mediaKeys.volume('mute'), true);
  assert.deepEqual(helperCalls.map(call => [call.command, call.args]), [
    ['/tmp/open-quake-media-key', ['playpause']],
    ['/tmp/open-quake-media-key', ['next']],
    ['/tmp/open-quake-media-key', ['previous']],
    ['/tmp/open-quake-media-key', ['volume-up']],
    ['/tmp/open-quake-media-key', ['volume-down']],
    ['/tmp/open-quake-media-key', ['mute']],
  ]);
  assert.equal(helperCalls.every(call => call.options.shell === false), true, 'helper must run without a shell');
  assert.deepEqual(robot.taps, [], 'robotjs must not run when the macOS helper handles the command');
}

{
  const robot = robotStub();
  const helperCalls = [];
  const mediaKeys = createMediaKeys({
    robot,
    platform: 'darwin',
    helperPath: '/tmp/open-quake-media-key',
    fs: { existsSync() { return true; } },
    spawnSync(command, args) {
      helperCalls.push({ command, args });
      return { status: 70 };
    },
  });

  assert.equal(mediaKeys.transport('next'), true);
  assert.deepEqual(helperCalls.map(call => call.args), [['next']]);
  assert.deepEqual(robot.taps, ['audio_next'], 'robotjs fallback should cover helper runtime failures');
}

console.log('Media key adapter tests passed.');
