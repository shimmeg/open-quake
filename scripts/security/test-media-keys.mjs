#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mainSource = fs.readFileSync('app/main.js', 'utf8');

assert.match(mainSource, /require\('\.\/mediaKeys'\)/, 'main process must use the narrow mediaKeys adapter');
assert.doesNotMatch(mainSource, /robot\.keyTap\(/, 'main process must not call robotjs keyTap directly');

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
  const mediaKeys = createMediaKeys({ robot });

  assert.equal(mediaKeys.transport('playpause'), true);
  assert.equal(mediaKeys.transport('next'), true);
  assert.equal(mediaKeys.transport('prev'), true);
  assert.equal(mediaKeys.transport('stop'), true);
  assert.deepEqual(robot.taps, ['audio_play', 'audio_next', 'audio_prev', 'audio_stop']);
}

{
  const robot = robotStub();
  const mediaKeys = createMediaKeys({ robot });

  assert.equal(mediaKeys.volume(1), true);
  assert.equal(mediaKeys.volume(-1), true);
  assert.equal(mediaKeys.volume('mute'), true);
  assert.deepEqual(robot.taps, ['audio_vol_up', 'audio_vol_down', 'audio_mute']);
}

{
  const robot = robotStub();
  const mediaKeys = createMediaKeys({ robot });

  assert.equal(mediaKeys.transport('brightness'), false, 'adapter must reject unsupported transport commands');
  assert.equal(mediaKeys.volume(0), false, 'adapter must reject unsupported volume commands');
  assert.deepEqual(robot.taps, []);
}

{
  const mediaKeys = createMediaKeys({ robot: null });

  assert.equal(mediaKeys.transport('playpause'), false, 'adapter must fail closed without robotjs');
  assert.equal(mediaKeys.volume('mute'), false, 'adapter must fail closed without robotjs');
}

{
  const mediaKeys = createMediaKeys({ robot: { keyTap() { throw new Error('denied'); } } });

  assert.equal(mediaKeys.transport('playpause'), false, 'adapter must not throw if the native backend fails');
  assert.equal(mediaKeys.volume('mute'), false, 'adapter must not throw if the native backend fails');
}

console.log('Media key adapter tests passed.');
