#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

function read(rel) {
  return fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

test('launcher renderer wraps every non-empty icon in icon-frame', () => {
  const source = read('app/index.js');
  assert.match(source, /className\s*=\s*['"]icon-frame['"]/);
  assert.match(source, /frame\.appendChild\(im\)/);
  assert.match(source, /frame\.appendChild\(icd\)/);
  assert.match(source, /d\.appendChild\(frame\)/);
});

test('music renderer uses the same icon-frame markup for image and fallback icons', () => {
  const source = read('app/musicview.js');
  assert.match(source, /class="icon-frame"/);
  assert.match(source, /<img src="/);
  assert.match(source, /esc\(t\.icon \|\| '▫️'\)/);
});

test('panel HTML keeps required runtime IDs and refreshed style tokens', () => {
  const index = read('app/index.html');
  for (const id of ['stage', 'grid', 'web', 'vol', 'selector', 'selitems', 'intro', 'introok']) {
    assert.match(index, new RegExp(`id="${id}"`), `app/index.html keeps #${id}`);
  }
  assert.match(index, /--panel-bg:/);
  assert.match(index, /\.icon-frame/);
  assert.match(index, /\.tile\.hit/);
});

test('music HTML keeps required runtime IDs and refreshed style tokens', () => {
  const music = read('app/musicview.html');
  for (const id of ['artImg', 'mTitle', 'mArtist', 'mStatus', 'mApp', 'bPrev', 'bPlay', 'bNext', 'bPause', 'grid']) {
    assert.match(music, new RegExp(`id="${id}"`), `app/musicview.html keeps #${id}`);
  }
  assert.match(music, /--panel-bg:/);
  assert.match(music, /\.icon-frame/);
  assert.match(music, /\.btn\.play/);
});
