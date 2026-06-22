#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  base64url,
  generatePkce,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  parseNowPlaying,
  createSpotifyClient,
} = require('../../app/spotify');

// Injected crypto — real Node crypto is fine and keeps the PKCE math honest.
const cryptoDeps = { randomBytes: crypto.randomBytes, createHash: crypto.createHash };

// A fake WHATWG-ish Response + fetch. Each call records the request and returns the queued response.
function fakeResponse({ status = 200, body = '', json } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return json !== undefined ? JSON.stringify(json) : body; },
    async json() { return json !== undefined ? json : JSON.parse(body); },
  };
}
function fakeFetch(queue) {
  const calls = [];
  const responses = Array.isArray(queue) ? queue.slice() : [queue];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r || fakeResponse({ status: 204 });
  };
  impl.calls = calls;
  return impl;
}

test('generatePkce: challenge is base64url(S256(verifier)) with no padding', () => {
  const { verifier, challenge } = generatePkce(cryptoDeps);
  // verifier is base64url of 32 random bytes
  assert.match(verifier, /^[A-Za-z0-9_-]+$/, 'verifier must be base64url (no +/=)');
  assert.match(challenge, /^[A-Za-z0-9_-]+$/, 'challenge must be base64url (no +/=)');
  assert.ok(!challenge.includes('='), 'challenge must have no padding');
  // Recompute the expected challenge from the verifier
  const expected = base64url(crypto.createHash('sha256').update(verifier).digest());
  assert.equal(challenge, expected, 'challenge must equal base64url(SHA-256(verifier))');
  // Distinct each call
  assert.notEqual(generatePkce(cryptoDeps).verifier, verifier, 'each PKCE pair must be random');
});

test('buildAuthorizeUrl: has S256, state, scope, and an encoded redirect_uri', () => {
  const url = buildAuthorizeUrl({
    clientId: 'abc123',
    redirectUri: 'http://127.0.0.1:8888/callback',
    codeChallenge: 'CHAL',
    state: 'STATE',
    scopes: ['user-read-currently-playing', 'user-read-playback-state'],
  });
  assert.ok(url.startsWith('https://accounts.spotify.com/authorize?'), 'points at the authorize endpoint');
  const q = new URL(url).searchParams;
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('client_id'), 'abc123');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('code_challenge'), 'CHAL');
  assert.equal(q.get('state'), 'STATE');
  assert.equal(q.get('scope'), 'user-read-currently-playing user-read-playback-state');
  assert.equal(q.get('redirect_uri'), 'http://127.0.0.1:8888/callback');
  // The redirect URI must be percent-encoded in the raw query string.
  assert.ok(url.includes('redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback'), 'redirect_uri must be URL-encoded');
});

test('exchangeCode: posts a form-urlencoded body with code_verifier and returns tokens', async () => {
  const fetchImpl = fakeFetch(fakeResponse({ json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } }));
  const before = Date.now();
  const r = await exchangeCode({ clientId: 'cid', code: 'CODE', codeVerifier: 'VER', redirectUri: 'http://127.0.0.1:8888/callback', fetchImpl });
  assert.equal(r.accessToken, 'AT');
  assert.equal(r.refreshToken, 'RT');
  assert.ok(r.expiresAt >= before + 3600 * 1000 - 5000 && r.expiresAt <= Date.now() + 3600 * 1000 + 5000, 'expiresAt ~ now + expires_in');

  const call = fetchImpl.calls[0];
  assert.equal(call.url, 'https://accounts.spotify.com/api/token');
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(call.opts.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'CODE');
  assert.equal(body.get('code_verifier'), 'VER');
  assert.equal(body.get('redirect_uri'), 'http://127.0.0.1:8888/callback');
  assert.equal(body.get('client_id'), 'cid');
});

test('exchangeCode: throws on a non-2xx token response', async () => {
  const fetchImpl = fakeFetch(fakeResponse({ status: 400, body: 'invalid_grant' }));
  await assert.rejects(() => exchangeCode({ clientId: 'cid', code: 'x', codeVerifier: 'v', redirectUri: 'r', fetchImpl }), /HTTP 400/);
});

test('refreshAccessToken: keeps the old refresh token when none is returned', async () => {
  // Spotify often omits refresh_token on refresh — keep the caller's existing one.
  const fetchImpl = fakeFetch(fakeResponse({ json: { access_token: 'AT2', expires_in: 3600 } }));
  const r = await refreshAccessToken({ clientId: 'cid', refreshToken: 'OLD_RT', fetchImpl });
  assert.equal(r.accessToken, 'AT2');
  assert.equal(r.refreshToken, 'OLD_RT', 'must keep the existing refresh token when not rotated');

  const body = new URLSearchParams(fetchImpl.calls[0].opts.body);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'OLD_RT');
  assert.equal(body.get('client_id'), 'cid');
});

test('refreshAccessToken: adopts a rotated refresh token when Spotify returns one', async () => {
  const fetchImpl = fakeFetch(fakeResponse({ json: { access_token: 'AT3', refresh_token: 'NEW_RT', expires_in: 3600 } }));
  const r = await refreshAccessToken({ clientId: 'cid', refreshToken: 'OLD_RT', fetchImpl });
  assert.equal(r.refreshToken, 'NEW_RT', 'must adopt a rotated refresh token');
});

test('parseNowPlaying: null on empty / 204-shape input', () => {
  assert.equal(parseNowPlaying(null), null);
  assert.equal(parseNowPlaying(undefined), null);
  assert.equal(parseNowPlaying({}), null);
  assert.equal(parseNowPlaying({ is_playing: true, item: null }), null);
});

test('parseNowPlaying: joins artists and picks the largest album image', () => {
  const r = parseNowPlaying({
    is_playing: true,
    item: {
      name: 'Song',
      artists: [{ name: 'A' }, { name: 'B' }],
      album: {
        name: 'Album',
        images: [
          { url: 'small.jpg', width: 64, height: 64 },
          { url: 'big.jpg', width: 640, height: 640 },
          { url: 'mid.jpg', width: 300, height: 300 },
        ],
      },
    },
  });
  assert.deepEqual(r, { title: 'Song', artist: 'A, B', album: 'Album', art: 'big.jpg', status: 'Playing', app: 'Spotify' });
});

test('parseNowPlaying: status reflects is_playing and null fields are tolerated', () => {
  const paused = parseNowPlaying({ is_playing: false, item: { name: 'X', artists: [], album: { name: 'Y', images: [] } } });
  assert.equal(paused.status, 'Paused');
  assert.equal(paused.artist, null);
  assert.equal(paused.art, null);
});

test('createSpotifyClient.getNowPlaying: refreshes when no token, then returns the parsed track', async () => {
  const tokenResp = fakeResponse({ json: { access_token: 'AT', expires_in: 3600 } });
  const playingResp = fakeResponse({ json: { is_playing: true, item: { name: 'S', artists: [{ name: 'A' }], album: { name: 'Al', images: [{ url: 'art.jpg', width: 640, height: 640 }] } } } });
  const fetchImpl = fakeFetch([tokenResp, playingResp]);
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => 'RT', fetchImpl });
  const r = await client.getNowPlaying();
  assert.equal(r.title, 'S');
  assert.equal(r.art, 'art.jpg');
  // First call is the token refresh, second is the now-playing GET with a Bearer header.
  assert.equal(fetchImpl.calls[0].url, 'https://accounts.spotify.com/api/token');
  assert.equal(fetchImpl.calls[1].url, 'https://api.spotify.com/v1/me/player/currently-playing');
  assert.equal(fetchImpl.calls[1].opts.headers.Authorization, 'Bearer AT');
});

test('createSpotifyClient.getNowPlaying: persists a rotated refresh token', async () => {
  const tokenResp = fakeResponse({ json: { access_token: 'AT', refresh_token: 'NEW_RT', expires_in: 3600 } });
  const playingResp = fakeResponse({ status: 204 });
  const fetchImpl = fakeFetch([tokenResp, playingResp]);
  const rotations = [];
  const client = createSpotifyClient({
    clientId: 'cid',
    getRefreshToken: () => 'OLD_RT',
    setRefreshToken: token => rotations.push(token),
    fetchImpl,
  });

  assert.equal(await client.getNowPlaying(), null);
  assert.deepEqual(rotations, ['NEW_RT']);
});

test('createSpotifyClient.getNowPlaying: returns null on 204 (nothing playing)', async () => {
  const fetchImpl = fakeFetch([fakeResponse({ json: { access_token: 'AT', expires_in: 3600 } }), fakeResponse({ status: 204 })]);
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => 'RT', fetchImpl });
  assert.equal(await client.getNowPlaying(), null);
});

test('createSpotifyClient.getNowPlaying: returns null (no refresh token connected)', async () => {
  const fetchImpl = fakeFetch([]);
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => '', fetchImpl });
  assert.equal(await client.getNowPlaying(), null);
  assert.equal(fetchImpl.calls.length, 0, 'must not call the API without a refresh token');
});

test('createSpotifyClient.getNowPlaying: never throws on a fetch error', async () => {
  const fetchImpl = fakeFetch([new Error('network down')]);
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => 'RT', fetchImpl });
  assert.equal(await client.getNowPlaying(), null, 'a thrown fetch error must yield null, not propagate');
});

test('createSpotifyClient.getNowPlaying: 401 triggers a single refresh-and-retry', async () => {
  let refreshes = 0;
  const fetchImpl = async (url, opts) => {
    if (url === 'https://accounts.spotify.com/api/token') { refreshes++; return fakeResponse({ json: { access_token: 'AT' + refreshes, expires_in: 3600 } }); }
    // First playing request 401s; after the retry-refresh it succeeds.
    return refreshes >= 2
      ? fakeResponse({ json: { is_playing: true, item: { name: 'OK', artists: [], album: { name: 'A', images: [] } } } })
      : fakeResponse({ status: 401 });
  };
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => 'RT', fetchImpl });
  const r = await client.getNowPlaying();
  assert.equal(r.title, 'OK');
  assert.equal(refreshes, 2, 'one initial refresh + one retry refresh after 401');
});

test('createSpotifyClient.getNowPlaying: 429 backs off (returns null)', async () => {
  const fetchImpl = fakeFetch([fakeResponse({ json: { access_token: 'AT', expires_in: 3600 } }), fakeResponse({ status: 429 })]);
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => 'RT', fetchImpl });
  assert.equal(await client.getNowPlaying(), null);
});

test('createSpotifyClient: reuses an in-memory access token until near expiry', async () => {
  let refreshes = 0;
  const fetchImpl = async (url) => {
    if (url === 'https://accounts.spotify.com/api/token') { refreshes++; return fakeResponse({ json: { access_token: 'AT', expires_in: 3600 } }); }
    return fakeResponse({ status: 204 });
  };
  const client = createSpotifyClient({ clientId: 'cid', getRefreshToken: () => 'RT', fetchImpl, now: () => 1000 });
  await client.getNowPlaying();
  await client.getNowPlaying();
  assert.equal(refreshes, 1, 'a still-valid access token must be reused, not re-fetched every poll');
});
