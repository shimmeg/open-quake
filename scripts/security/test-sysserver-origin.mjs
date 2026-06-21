#!/usr/bin/env node

// Behavioral guard for the localhost server's CSRF / DNS-rebinding hardening (app/sysserver.js).
// Starts the real server on an ephemeral loopback port and fires requests with crafted headers
// (including a forged Host, which only a raw client — not a browser — can set) to assert that
// side-effecting / data / secret routes fail closed and legitimate same-origin fetches succeed.

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Stub the poller modules so sysserver loads under plain node (no electron / systeminformation).
function stub(rel, exports) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
stub('../../app/sysmetrics.js', { start() {}, stop() {}, getSnapshot() { return {}; } });
stub('../../app/nowplaying.js', { start() {}, stop() {}, getSnapshot() { return null; } });

const sysserver = require('../../app/sysserver.js');

let launched = 0, media = 0, secretServed = 0;
let port = 0;
let LOOPBACK = '';

before(async () => {
  port = await sysserver.start({
    onLaunch() { launched++; return true; },
    onMedia() { media++; return true; },
    getMusicTiles() { return { cols: 2, rows: 2, tiles: [] }; },
    getAppConfig() { secretServed++; return { app: 'chat', options: { api_key: 'SECRET' } }; },
  });
  LOOPBACK = `127.0.0.1:${port}`;
});

after(() => sysserver.stop());

function req(path, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, res => {
      let body = ''; res.on('data', d => (body += d)); res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    r.on('error', reject);
    r.end();
  });
}

const PROTECTED = ['/launch?i=0', '/media/playpause', '/app-config?app=chat', '/metrics', '/nowplaying', '/musictiles'];

// The P1: protected routes with a valid loopback Host but NO Origin and NO Sec-Fetch-Site fail closed.
test('protected routes fail closed without Origin / Sec-Fetch-Site', async () => {
  for (const path of PROTECTED) {
    const r = await req(path, { Host: LOOPBACK });
    assert.equal(r.status, 403, `header-less request to ${path} must be rejected (403)`);
  }
  assert.equal(launched, 0, 'no /launch side effect from a header-less request');
  assert.equal(media, 0, 'no /media side effect from a header-less request');
  assert.equal(secretServed, 0, '/app-config secret must not be served to a header-less request');
});

test('cross-site requests are rejected', async () => {
  for (const path of ['/launch?i=0', '/app-config?app=chat', '/metrics']) {
    const r = await req(path, { Host: LOOPBACK, 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(r.status, 403, `cross-site request to ${path} must be rejected`);
  }
  const evil = await req('/app-config?app=chat', { Host: LOOPBACK, Origin: 'http://evil.example' });
  assert.equal(evil.status, 403, 'a foreign Origin must be rejected');
  assert.equal(secretServed, 0, 'no secret served to cross-site / foreign-origin requests');
});

test('a foreign / DNS-rebinding Host is rejected on every route', async () => {
  for (const path of ['/', '/metrics', '/launch?i=0']) {
    const r = await req(path, { Host: `attacker.example:${port}` });
    assert.equal(r.status, 403, `foreign Host on ${path} must be rejected`);
  }
});

test('legitimate same-origin fetches succeed', async () => {
  assert.equal((await req('/metrics', { Host: LOOPBACK, 'Sec-Fetch-Site': 'same-origin' })).status, 200, 'same-origin /metrics must pass');
  const cfg = await req('/app-config?app=chat', { Host: LOOPBACK, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(cfg.status, 200, 'same-origin /app-config must pass');
  assert.equal(secretServed, 1, '/app-config secret served exactly once, only to the same-origin request');
  assert.equal((await req('/metrics', { Host: LOOPBACK, Origin: `http://127.0.0.1:${port}` })).status, 200, 'loopback Origin fallback must pass');
});

test('page + asset routes load under a top-level navigation (Sec-Fetch-Site: none)', async () => {
  for (const path of ['/', '/music', '/chat']) {
    assert.equal((await req(path, { Host: LOOPBACK, 'Sec-Fetch-Site': 'none' })).status, 200, `page route ${path} must load under navigation`);
  }
});
