# Device Panel UI And Icons Design

## Goal

Refresh the device-facing panel UI first, while improving the bundled app icons at the same time. The first pass should make the launcher and Music page feel more modern and icon-led without changing launch behavior, knob behavior, dashboard handling, media-key behavior, or device protocol code.

## Scope

In scope:

- Device launcher visuals in `app/index.html`.
- Device Music page visuals in `app/musicview.html`.
- Bundled Music app tile defaults in `apps/apps.json`.
- Small rendering hooks in existing panel JavaScript only if needed for icon classes, labels, or fallbacks.
- Documentation updates only where the changed defaults need explanation.

Out of scope:

- Desktop editor redesign.
- Reworking the grid model, tile action model, or app manifest shape unless required for icon defaults.
- New device protocol work, firmware, DFU, write tests, real-device smoke, voice, microphone, push-to-talk, or transcription smoke.
- Bundling third-party logo files unless their licensing is explicitly cleared.

## Design Direction

The panel should move from a heavy neon/dark-gradient look to a calmer modern surface: darker neutral base, clear tile hierarchy, subtle borders, larger real icons, and restrained accent states. The UI should remain legible on the 1920x480 panel and under the existing portrait rotation path.

Tiles should be icon-first. Labels stay visible, but icons carry recognition. Pressed and selected states should be obvious through scale, border, and contained highlight, without relying on bright full-tile gradients.

The Music page should match the launcher language: album art as the visual anchor, round transport controls with clearer spacing, and a right-side 2x2 launcher grid that looks like the same component family as the main launcher.

## Components

### Launcher Grid

- Keep the existing `#stage`, `#grid`, webview, touch mapping, and rotation behavior.
- Update tile CSS for cleaner surfaces, consistent radius, improved spacing, better typography, and polished active state.
- Preserve current support for emoji icons and `iconSrc` image icons.
- Make image icons visually stronger by sizing them consistently and allowing transparent app icons to read well on dark tile surfaces.
- Keep empty tiles understated and clearly inactive.

### Launcher Overlays

- Restyle the volume overlay, page selector, and first-run intro to match the refreshed panel theme.
- Keep existing overlay behavior and event handling intact.
- Use concise labels already present in the UI; do not add instructional copy beyond the current behavior hints.

### Music Page

- Keep the current three-zone layout: album art, now-playing controls, and programmable grid.
- Refresh the album-art placeholder, text hierarchy, status pill, transport buttons, and right-side tiles.
- Preserve the current media control IDs and JavaScript contract in `app/musicview.js`.
- Preserve the programmable 2x2 grid behavior and `/musictiles` data flow.

### Icon Defaults

- Update bundled Music defaults so Spotify, YouTube Music, Apple Music, and Tidal use real image-backed icons where practical.
- Prefer existing safe icon mechanisms:
  - `iconType: "url"` plus a cached image file produced by the existing guarded icon downloader.
  - `iconType: "app"` only for local app launch tiles where `value` points to an installed app path.
- Add a narrow default-icon seeding path for bundled Music service tiles:
  - Defaults may carry an `iconUrl` and emoji fallback.
  - When the built-in Music page is first created, or when a Music app is newly added from the editor, those known default `iconUrl` values may be fetched through the existing `fetchIconToCache` guardrails and saved as `iconCache`.
  - Do not automatically fetch arbitrary user-configured icon URLs during normal panel rendering.
- Do not vendor third-party logo assets into the repo in this pass unless licensing is explicitly resolved.
- Keep emoji fallbacks so the panel remains useful if icon fetching fails or cached icons are unavailable.

## Data Flow

Launcher grids continue to flow through the existing config pipeline:

1. Config/editor stores tile fields.
2. Main process resolves `iconSrc` for image, URL-cache, or app-icon tiles.
3. Panel renderer displays `iconSrc` as an image, otherwise falls back to the tile emoji.

Music app tile data continues to flow through `/musictiles`, which returns the active Music page grid with resolved icons. `musicview.js` renders the returned tile icon image or emoji fallback.

Default Music service icons are seeded before normal rendering when a new built-in Music grid is created. The seeding step uses the same image URL validation, type sniffing, size cap, cache path, and data-URL conversion already used by the editor's Fetch flow.

## Error Handling

- Missing image icons should fall back to the existing emoji/default glyph path.
- Default icon fetch failures should not block the UI or app launch behavior.
- Transparent or low-contrast icons should remain visible through tile background treatment rather than per-brand special cases.
- Text overflow must stay contained with ellipsis or fixed sizing.

## Verification

Use non-device verification for this pass:

- Run the relevant security/test baseline after changes:
  - `npm run security:all`
  - `npm run security:macos`
  - `npm run security:docs`
- Run `npm run rebuild` if native/build-adjacent files are touched; expected not to be needed for CSS/default-icon-only work.
- Launch the app without device-specific destructive actions if visual verification is needed:
  - `npm exec electron -- --remote-debugging-port=9228 --user-data-dir=/tmp/open-quake-smoke-userdata .`
- Inspect panel/editor UI only. Do not run device smoke, DFU, firmware, write-test, mic, voice, push-to-talk, or transcription checks.

## Acceptance Criteria

- Launcher tiles look modern and consistent while preserving all existing interactions.
- Music page visually matches the refreshed launcher.
- Bundled Music service tiles show real icons where the existing safe icon pipeline can support them, with emoji fallback.
- The desktop editor remains functionally unchanged except for any required preview compatibility with updated tile defaults.
- Automated security/docs/tests pass for touched areas.
