# Music controller

A built-in **Music** app shows a touch-friendly media surface on your panel — transport controls
(play/pause, next, previous), plus a programmable
**2×2 app-launcher grid** on the right (Spotify, YouTube Music, Apple Music, Tidal by default).
It's added on first run; like any app you can delete it (it stays gone) or add more via **+ App**.

- **macOS status:** transport buttons and knob volume/mute go through the narrow
  `app/mediaKeys.js` adapter. The adapter first tries the local native
  `open-quake-media-key` helper for fixed media-key events, then falls back to
  optional `robotjs` for unsupported or failed commands. For now-playing **text and album art**
  on macOS, connect your Spotify account (see below) — the Music page then shows the track playing
  in Spotify. On Windows the app-agnostic SMTC backend covers any media app and needs no setup.
- **The 2×2 grid is a real, editable grid** — open the Music app in the [editor](editor.md) and program
  its tiles exactly like the Default/Media/Dev grids; each tile opens a URL in your Mac browser or launches
  an app, same as any tile. (This is the "grid embedded in an app" capability — apps can carry their own grid.)
- **No admin, no extra software.**

## Spotify now playing (macOS)

On macOS the now-playing surface reads the current track from the **Spotify Web API** (title, artist,
album, album art). It's a one-time connect from the editor and uses OAuth **Authorization Code + PKCE**
— no client secret. Your **Client ID is public**; the long-lived **refresh token is stored encrypted at
rest** (Electron `safeStorage`, see [secrets at rest](security/)) and the short-lived access token lives
in memory only. The connection only reads playback state — it can't control your account.

**Setup**

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and **Create app**.
2. In the app's settings, add the redirect URI **exactly**: `http://127.0.0.1:8888/callback`.
3. Copy the app's **Client ID**.
4. In the open-quake editor: **⚙ Settings → Software → Spotify (now playing)**, paste the Client ID,
   then click **Connect Spotify**.
5. Your browser opens Spotify's consent page — approve it. The tab shows "Spotify connected"; the editor
   status flips to **Connected ✓**. Use **Disconnect** to revoke locally (forgets the refresh token).

**Notes**

- It reads whatever **Spotify** is playing — you need the **Spotify desktop or web player active** on the
  account. (This is Spotify-specific; the Windows SMTC path is app-agnostic and needs no setup.)
- Per Spotify's 2026 developer-mode rules, a brand-new app starts in **development mode**: the account may
  need **Spotify Premium**, and you may have to **add yourself as a user** under the app's *User Management*
  before the Web API will return your playback. (Extended/quota mode requires Spotify's review.)
- The redirect URI must match character-for-character, including the `http://127.0.0.1:8888/callback`
  loopback host and port — open-quake's callback server binds `127.0.0.1:8888` for the duration of the
  connect only.

## Compatibility

The editable 2×2 launch grid works independently of now-playing support. The native helper covers the
macOS transport and knob controls used by the page: play/pause, next, previous, volume up/down, and mute.
