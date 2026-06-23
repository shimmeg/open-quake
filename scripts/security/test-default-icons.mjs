#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { seedDefaultIconCachesInGrid } = require('../../app/defaultIcons');

test('seedDefaultIconCachesInGrid seeds only manifest-marked default URL icons', async () => {
  const defaults = [
    { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
  ];
  const grid = {
    tiles: [
      { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
      { label: 'Custom', icon: 'C', iconType: 'url', iconUrl: 'https://example.com/icon.png' },
    ],
  };
  const calls = [];
  const changed = await seedDefaultIconCachesInGrid(grid, async url => {
    calls.push(url);
    return { ok: true, cachePath: `/tmp/${calls.length}.ico` };
  }, { defaults });

  assert.equal(changed, true);
  assert.deepEqual(calls, ['https://open.spotify.com/favicon.ico']);
  assert.equal(grid.tiles[0].iconCache, '/tmp/1.ico');
  assert.equal(grid.tiles[0].iconAutoSeed, false);
  assert.equal(grid.tiles[1].iconCache, undefined);
});

test('seedDefaultIconCachesInGrid is non-blocking on fetch failure and keeps fallback emoji', async () => {
  const defaults = [
    { label: 'Tidal', icon: 'T', iconType: 'url', iconUrl: 'https://listen.tidal.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://listen.tidal.com' },
  ];
  const grid = {
    tiles: [
      { label: 'Tidal', icon: 'T', iconType: 'url', iconUrl: 'https://listen.tidal.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://listen.tidal.com' },
    ],
  };
  const messages = [];
  const changed = await seedDefaultIconCachesInGrid(
    grid,
    async () => ({ ok: false, error: 'network unavailable' }),
    { defaults, log: message => messages.push(message) },
  );

  assert.equal(changed, false);
  assert.equal(grid.tiles[0].iconCache, undefined);
  assert.equal(grid.tiles[0].icon, 'T');
  assert.equal(grid.tiles[0].iconAutoSeed, true);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /default icon seed failed: Tidal/);
});

test('seedDefaultIconCachesInGrid skips already cached icons', async () => {
  const grid = {
    tiles: [
      { label: 'Apple Music', icon: 'A', iconType: 'url', iconUrl: 'https://music.apple.com/favicon.ico', iconCache: '/tmp/apple.ico', iconAutoSeed: true },
    ],
  };
  let calls = 0;
  const changed = await seedDefaultIconCachesInGrid(grid, async () => {
    calls += 1;
    return { ok: true, cachePath: '/tmp/new.ico' };
  });

  assert.equal(changed, false);
  assert.equal(calls, 0);
  assert.equal(grid.tiles[0].iconCache, '/tmp/apple.ico');
});

test('seedDefaultIconCachesInGrid refuses auto-seed URLs that do not match bundled defaults', async () => {
  const defaults = [
    { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
  ];
  const grid = {
    tiles: [
      { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://example.com/not-default.png', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
    ],
  };
  let calls = 0;
  const changed = await seedDefaultIconCachesInGrid(grid, async () => {
    calls += 1;
    return { ok: true, cachePath: '/tmp/unsafe.ico' };
  }, { defaults });

  assert.equal(changed, false);
  assert.equal(calls, 0);
  assert.equal(grid.tiles[0].iconCache, undefined);
  assert.equal(grid.tiles[0].iconAutoSeed, true);
});

test('seedDefaultIconCachesInGrid upgrades existing legacy Music defaults before seeding', async () => {
  const defaults = [
    { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
  ];
  const grid = {
    tiles: [
      { label: 'Spotify', icon: '🎵', iconType: 'emoji', type: 'url', value: 'https://open.spotify.com' },
    ],
  };
  const calls = [];
  const changed = await seedDefaultIconCachesInGrid(grid, async url => {
    calls.push(url);
    return { ok: true, cachePath: '/tmp/spotify.ico' };
  }, { defaults });

  assert.equal(changed, true);
  assert.deepEqual(calls, ['https://open.spotify.com/favicon.ico']);
  assert.equal(grid.tiles[0].iconType, 'url');
  assert.equal(grid.tiles[0].iconUrl, 'https://open.spotify.com/favicon.ico');
  assert.equal(grid.tiles[0].icon, '♪');
  assert.equal(grid.tiles[0].iconCache, '/tmp/spotify.ico');
  assert.equal(grid.tiles[0].iconAutoSeed, false);
});

test('seedDefaultIconCachesInGrid does not upgrade customized matching service tiles', async () => {
  const defaults = [
    { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
  ];
  const grid = {
    tiles: [
      { label: 'Spotify', icon: '🎧', iconType: 'emoji', type: 'url', value: 'https://open.spotify.com' },
    ],
  };
  let calls = 0;
  const changed = await seedDefaultIconCachesInGrid(grid, async () => {
    calls += 1;
    return { ok: true, cachePath: '/tmp/spotify.ico' };
  }, { defaults });

  assert.equal(changed, false);
  assert.equal(calls, 0);
  assert.equal(grid.tiles[0].iconType, 'emoji');
  assert.equal(grid.tiles[0].iconUrl, undefined);
  assert.equal(grid.tiles[0].icon, '🎧');
});

test('seedDefaultIconCachesInGrid reports legacy metadata changes when icon fetch fails', async () => {
  const defaults = [
    { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true, type: 'url', value: 'https://open.spotify.com' },
  ];
  const grid = {
    tiles: [
      { label: 'Spotify', icon: '🎵', iconType: 'emoji', type: 'url', value: 'https://open.spotify.com' },
    ],
  };
  const changed = await seedDefaultIconCachesInGrid(grid, async () => ({ ok: false, error: 'offline' }), { defaults });

  assert.equal(changed, true);
  assert.equal(grid.tiles[0].iconType, 'url');
  assert.equal(grid.tiles[0].iconUrl, 'https://open.spotify.com/favicon.ico');
  assert.equal(grid.tiles[0].iconAutoSeed, true);
  assert.equal(grid.tiles[0].iconCache, undefined);
});

test('Music app defaults declare real icon URLs with emoji fallback', () => {
  const apps = JSON.parse(fs.readFileSync(new URL('../../apps/apps.json', import.meta.url), 'utf8'));
  const music = apps.find(app => app.id === 'music');
  assert.ok(music, 'music app must exist');
  const tiles = music.grid.defaults;
  const expected = new Map([
    ['Spotify', 'https://open.spotify.com/favicon.ico'],
    ['YT Music', 'https://music.youtube.com/favicon.ico'],
    ['Apple Music', 'https://music.apple.com/favicon.ico'],
    ['Tidal', 'https://listen.tidal.com/favicon.ico'],
  ]);

  for (const [label, iconUrl] of expected) {
    const tile = tiles.find(t => t.label === label);
    assert.ok(tile, `${label} tile must exist`);
    assert.equal(tile.iconType, 'url');
    assert.equal(tile.iconUrl, iconUrl);
    assert.equal(tile.iconAutoSeed, true);
    assert.equal(typeof tile.icon, 'string');
    assert.ok(tile.icon.length > 0, `${label} keeps an emoji/text fallback`);
  }
});
