#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSecretStore } = require('../../app/secretStore');

// Stubbed safeStorage — no Electron. encryptString wraps with 'ENC:' so we can assert round-trips
// and recognize "already encrypted" values without a real Keychain.
function stubStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: s => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: b => b.toString('utf8').replace(/^ENC:/, ''),
  };
}
const loadApps = () => [{ id: 'chat', options: [{ key: 'api_key', type: 'secret' }, { key: 'endpoint', type: 'text' }] }];

function makeStore(opts = {}) {
  return createSecretStore({ safeStorage: stubStorage(opts.available !== false), loadApps, log: () => {} });
}

// A config exercising every secret field plus the non-secret siblings that MUST stay plaintext.
function sampleConfig() {
  return {
    activeGridId: 'a',
    grids: [
      { id: 'a', kind: 'web', url: 'https://ha.example', auth: { type: 'ha', token: 'ha-tok' } },
      { id: 'b', kind: 'web', url: 'https://basic.example', auth: { type: 'basic', user: 'alice', pass: 'pw' } },
      { id: 'c', kind: 'web', url: 'https://hdr.example', auth: { type: 'header', headers: [{ name: 'X-Auth', value: 'hv' }] } },
      { id: 'd', kind: 'app', app: 'chat', options: { api_key: 'sk-123', endpoint: 'https://chat.example' } },
      { id: 'e', kind: 'web', url: 'https://none.example', auth: { type: 'none' } },
    ],
  };
}

test('round-trips ha token / basic pass / header value / secret app option', () => {
  const store = makeStore();
  const enc = store.encryptConfig(sampleConfig());
  const MARKER = store.MARKER;

  assert.ok(enc.grids[0].auth.token.startsWith(MARKER), 'ha token must be encrypted');
  assert.ok(enc.grids[1].auth.pass.startsWith(MARKER), 'basic pass must be encrypted');
  assert.ok(enc.grids[2].auth.headers[0].value.startsWith(MARKER), 'header value must be encrypted');
  assert.ok(enc.grids[3].options.api_key.startsWith(MARKER), 'secret app option must be encrypted');

  const dec = store.decryptConfig(enc);
  assert.equal(dec.grids[0].auth.token, 'ha-tok');
  assert.equal(dec.grids[1].auth.pass, 'pw');
  assert.equal(dec.grids[2].auth.headers[0].value, 'hv');
  assert.equal(dec.grids[3].options.api_key, 'sk-123');
});

test('non-secret fields are never encrypted', () => {
  const store = makeStore();
  const enc = store.encryptConfig(sampleConfig());

  assert.equal(enc.grids[1].auth.user, 'alice', 'basic user must stay plaintext');
  assert.equal(enc.grids[2].auth.headers[0].name, 'X-Auth', 'header name must stay plaintext');
  assert.equal(enc.grids[3].options.endpoint, 'https://chat.example', 'non-secret app option must stay plaintext');
  assert.equal(enc.grids[4].auth.type, 'none', 'none-auth grid is untouched');
});

test('decryptValue passes plaintext through (migration of a pre-encryption config)', () => {
  const store = makeStore();
  // A config never touched by encryption: secrets are bare strings, no MARKER.
  const dec = store.decryptConfig(sampleConfig());
  assert.equal(dec.grids[0].auth.token, 'ha-tok');
  assert.equal(dec.grids[1].auth.pass, 'pw');
  assert.equal(dec.grids[3].options.api_key, 'sk-123');
});

test('encryptValue is idempotent — already-marked values are not re-encrypted', () => {
  const store = makeStore();
  const once = store.encryptConfig(sampleConfig());
  const twice = store.encryptConfig(once);

  assert.equal(twice.grids[0].auth.token, once.grids[0].auth.token, 'ha token must not double-wrap');
  assert.equal(twice.grids[3].options.api_key, once.grids[3].options.api_key, 'app secret must not double-wrap');
  // And it still decrypts cleanly back to the original.
  assert.equal(store.decryptConfig(twice).grids[0].auth.token, 'ha-tok');
});

test('falls back to plaintext when encryption is unavailable', () => {
  const store = makeStore({ available: false });
  const enc = store.encryptConfig(sampleConfig());

  assert.equal(store.available(), false);
  assert.equal(enc.grids[0].auth.token, 'ha-tok', 'token stays plaintext when safeStorage is unavailable');
  assert.equal(enc.grids[3].options.api_key, 'sk-123', 'app secret stays plaintext when safeStorage is unavailable');
  assert.equal(enc.grids[0].auth.token.startsWith(store.MARKER), false);
});

test('available() does not throw if safeStorage probe throws', () => {
  const store = createSecretStore({
    safeStorage: { isEncryptionAvailable: () => { throw new Error('not ready'); } },
    loadApps,
  });
  assert.equal(store.available(), false);
});

test('encryptValue / decryptValue: empty and non-string values pass through', () => {
  const store = makeStore();
  assert.equal(store.encryptValue(''), '');
  assert.equal(store.encryptValue(undefined), undefined);
  assert.equal(store.encryptValue(null), null);
  assert.equal(store.decryptValue(''), '');
  assert.equal(store.decryptValue('plain-text'), 'plain-text');
});

test('decryptValue returns empty string and does not throw on a corrupt blob', () => {
  const store = makeStore();
  const broken = createSecretStore({
    safeStorage: { isEncryptionAvailable: () => true, decryptString: () => { throw new Error('bad'); } },
    loadApps,
  });
  assert.equal(broken.decryptValue(store.MARKER + 'garbage'), '');
});

test('hasPlaintextSecret detects a not-yet-encrypted secret and clears once encrypted', () => {
  const store = makeStore();
  assert.equal(store.hasPlaintextSecret(sampleConfig()), true);
  assert.equal(store.hasPlaintextSecret(store.encryptConfig(sampleConfig())), false);
  // A config with only non-secret data / empty secrets is not "plaintext secret".
  assert.equal(store.hasPlaintextSecret({ grids: [{ id: 'x', kind: 'web', auth: { type: 'ha', token: '' } }] }), false);
  assert.equal(store.hasPlaintextSecret({ grids: [] }), false);
  assert.equal(store.hasPlaintextSecret({}), false);
});

test('settings.spotify.refreshToken is encrypted; clientId stays plaintext', () => {
  const store = makeStore();
  const cfg = { grids: [], settings: { spotify: { clientId: 'public-id', refreshToken: 'rt-secret' } } };
  const enc = store.encryptConfig(cfg);

  assert.ok(enc.settings.spotify.refreshToken.startsWith(store.MARKER), 'spotify refresh token must be encrypted');
  assert.equal(enc.settings.spotify.clientId, 'public-id', 'spotify client id is public and must stay plaintext');

  const dec = store.decryptConfig(enc);
  assert.equal(dec.settings.spotify.refreshToken, 'rt-secret', 'refresh token must round-trip');
  assert.equal(dec.settings.spotify.clientId, 'public-id');
});

test('hasPlaintextSecret detects a plaintext spotify refresh token', () => {
  const store = makeStore();
  const cfg = { grids: [], settings: { spotify: { clientId: 'pub', refreshToken: 'rt-secret' } } };
  assert.equal(store.hasPlaintextSecret(cfg), true);
  assert.equal(store.hasPlaintextSecret(store.encryptConfig(cfg)), false);
  // clientId alone (no refresh token) is not a secret.
  assert.equal(store.hasPlaintextSecret({ grids: [], settings: { spotify: { clientId: 'pub' } } }), false);
  assert.equal(store.hasPlaintextSecret({ grids: [], settings: { spotify: { clientId: 'pub', refreshToken: '' } } }), false);
});

test('encryptConfig does not mutate a config carrying a spotify refresh token', () => {
  const store = makeStore();
  const cfg = { grids: [], settings: { spotify: { clientId: 'pub', refreshToken: 'rt-secret' } } };
  const snapshot = JSON.stringify(cfg);
  store.encryptConfig(cfg);
  assert.equal(JSON.stringify(cfg), snapshot, 'encryptConfig must not mutate its input settings');
});

test('secretKeysForApp returns only type:secret option keys', () => {
  const store = makeStore();
  assert.deepEqual(store.secretKeysForApp('chat'), ['api_key']);
  assert.deepEqual(store.secretKeysForApp('nope'), []);
});

test('encryptConfig / decryptConfig do not mutate the input object', () => {
  const store = makeStore();
  const input = sampleConfig();
  const snapshot = JSON.stringify(input);

  const enc = store.encryptConfig(input);
  assert.equal(JSON.stringify(input), snapshot, 'encryptConfig must not mutate its input');
  assert.notEqual(enc, input, 'encryptConfig must return a new object');
  assert.notEqual(enc.grids[0].auth, input.grids[0].auth, 'nested objects must be cloned');

  const decInput = store.encryptConfig(sampleConfig());
  const decSnapshot = JSON.stringify(decInput);
  store.decryptConfig(decInput);
  assert.equal(JSON.stringify(decInput), decSnapshot, 'decryptConfig must not mutate its input');
});
