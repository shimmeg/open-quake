'use strict';
/*
 * spotify.js — Spotify "now playing" via the Web API, using OAuth Authorization-Code + PKCE. [MIT]
 *
 * No client secret: PKCE proves the token request came from the same client that started the flow,
 * so only the (public) Client ID is needed. The refresh token is the long-lived credential and is
 * stored encrypted at rest (secretStore); the access token lives in memory only and is refreshed on
 * demand. This module is the macOS now-playing source — it supplements the Windows SMTC path.
 *
 * Everything is dependency-injected (crypto + fetch) so the whole module unit-tests without Electron:
 * tests pass a fake fetchImpl; main.js passes a wrapper over electron `net.fetch` (WHATWG fetch).
 */

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const EXPIRY_SKEW_MS = 30000;   // refresh this far before the real expiry so a request never races the clock

// base64url = standard base64 with +/ -> -_ and trailing '=' padding stripped (RFC 7636 PKCE).
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PKCE pair. verifier = base64url(32 random bytes); challenge = base64url(SHA-256(verifier)).
// crypto is injected so this is testable without Node's global crypto (and stays pure).
function generatePkce({ randomBytes, createHash }) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// The authorize URL the user is sent to in their browser (PKCE: code_challenge_method=S256).
function buildAuthorizeUrl({ clientId, redirectUri, codeChallenge, state, scopes }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
    scope: (scopes || []).join(' '),
  });
  return AUTH_URL + '?' + params.toString();
}

// POST the token endpoint with x-www-form-urlencoded body; return parsed JSON or throw on non-2xx.
async function postToken(fetchImpl, body) {
  const resp = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    let detail = '';
    try { detail = await resp.text(); } catch (e) {}
    throw new Error('Spotify token endpoint HTTP ' + resp.status + (detail ? ': ' + detail : ''));
  }
  return resp.json();
}

// Exchange the one-time authorization code for tokens (the end of the PKCE flow). Returns the refresh
// token (persist this, encrypted) plus the first access token + its absolute expiry.
async function exchangeCode({ clientId, code, codeVerifier, redirectUri, fetchImpl }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  const json = await postToken(fetchImpl, body);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 0) * 1000,
  };
}

// Trade the stored refresh token for a fresh access token. Spotify MAY rotate the refresh token; if it
// returns a new one, keep it — otherwise the caller's existing one stays valid.
async function refreshAccessToken({ clientId, refreshToken, fetchImpl }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const json = await postToken(fetchImpl, body);
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 0) * 1000,
    refreshToken: json.refresh_token || refreshToken,
  };
}

// Map the /currently-playing JSON to the now-playing snapshot shape the panel page expects. Returns
// null when nothing is playing (no body / no item). Picks the largest album image as the art URL.
function parseNowPlaying(json) {
  if (!json || !json.item) return null;
  const item = json.item;
  const images = (item.album && Array.isArray(item.album.images)) ? item.album.images : [];
  let art = null, best = -1;
  for (const img of images) {
    const area = (img && Number(img.width) || 0) * (Number(img.height) || 0);
    if (img && img.url && area >= best) { best = area; art = img.url; }   // >= so a single 0×0-sized image still wins
  }
  return {
    title: item.name || null,
    artist: (item.artists || []).map(a => a && a.name).filter(Boolean).join(', ') || null,
    album: (item.album && item.album.name) || null,
    art,
    status: json.is_playing ? 'Playing' : 'Paused',
    app: 'Spotify',
  };
}

// A live now-playing client. Holds the access token in memory and refreshes it on demand using a
// refresh token supplied lazily by getRefreshToken() (read from the live, decrypted config). clientId
// may be a string OR a getter, since the user can set/change it after this client is constructed.
//
// getNowPlaying() NEVER throws: any failure (network, auth, parse) is logged and yields null so the
// poller just shows "nothing playing" rather than crashing the tick loop. 401 -> refresh once + retry;
// 429 -> back off (return null) rather than hammering the API.
function createSpotifyClient({ clientId, getRefreshToken, setRefreshToken, fetchImpl, now = () => Date.now(), log = () => {} }) {
  let accessToken = null;
  let expiresAt = 0;

  function resolveClientId() { return typeof clientId === 'function' ? clientId() : clientId; }

  async function ensureAccessToken(force) {
    if (!force && accessToken && (expiresAt - now()) > EXPIRY_SKEW_MS) return accessToken;
    const refreshToken = getRefreshToken && getRefreshToken();
    const id = resolveClientId();
    if (!refreshToken || !id) { accessToken = null; expiresAt = 0; return null; }
    const r = await refreshAccessToken({ clientId: id, refreshToken, fetchImpl });
    if (r.refreshToken && r.refreshToken !== refreshToken && typeof setRefreshToken === 'function') {
      try { setRefreshToken(r.refreshToken); }
      catch (e) { log('spotify: failed to persist rotated refresh token: ' + (e && e.message)); }
    }
    accessToken = r.accessToken;
    expiresAt = r.expiresAt;
    return accessToken;
  }

  async function fetchCurrent(token) {
    return fetchImpl(NOW_PLAYING_URL, { method: 'GET', headers: { Authorization: 'Bearer ' + token } });
  }

  async function getNowPlaying() {
    try {
      let token = await ensureAccessToken(false);
      if (!token) return null;
      let resp = await fetchCurrent(token);
      if (resp.status === 401) {                 // token rejected — refresh once and retry
        token = await ensureAccessToken(true);
        if (!token) return null;
        resp = await fetchCurrent(token);
      }
      if (resp.status === 429) { log('spotify: rate-limited (429), backing off'); return null; }   // respect Retry-After by simply not hammering
      if (resp.status === 204) return null;      // 204 No Content — nothing playing
      if (!resp.ok) { log('spotify: now-playing HTTP ' + resp.status); return null; }
      let body = '';
      try { body = await resp.text(); } catch (e) {}
      if (!body) return null;                    // empty body — nothing playing
      let json;
      try { json = JSON.parse(body); } catch (e) { return null; }
      return parseNowPlaying(json);
    } catch (e) {
      log('spotify: getNowPlaying error: ' + (e && e.message));
      return null;
    }
  }

  return { getNowPlaying };
}

module.exports = {
  base64url,
  generatePkce,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  parseNowPlaying,
  createSpotifyClient,
};
