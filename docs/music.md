# Music controller

A built-in **Music** app shows a touch-friendly media surface on your panel — transport controls
(play/pause, next, previous, stop), plus a programmable
**2×2 app-launcher grid** on the right (Spotify, YouTube Music, Apple Music, Tidal by default).
It's added on first run; like any app you can delete it (it stays gone) or add more via **+ App**.

- **macOS status:** transport buttons and knob volume/mute use `robotjs` only for fixed media-key
  events, so macOS may ask for Accessibility permission. Replacing that native module with a
  narrower macOS media backend is tracked as follow-up; generic now-playing metadata is still
  Windows-SMTC-only and shows placeholders on macOS until a macOS media-session backend is added.
- **The 2×2 grid is a real, editable grid** — open the Music app in the [editor](editor.md) and program
  its tiles exactly like the Default/Media/Dev grids; each tile opens a URL in your Mac browser or launches
  an app, same as any tile. (This is the "grid embedded in an app" capability — apps can carry their own grid.)
- **No admin, no extra software.**

## Compatibility

On macOS, media-key transport generally controls the active media app/session, but now-playing text is
not app-agnostic yet. The editable 2×2 launch grid works independently of now-playing support.

*(A narrow macOS media-key backend, macOS now-playing backend, and album art are planned follow-ups.)*
