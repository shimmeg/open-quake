# open-quake — UI Design Brief

A guardrail document for redesigning open-quake's UI. Read **§1 Hard constraints first** — they're
non-obvious and a generic "make it modern" pass will break the device, the security guards, or the
scripts if you skip them. Then pick a surface (§4), pick a direction (§5), and follow the playbook (§6).

> Scope: this brief covers the look-and-feel of `app/` and `apps/clock.*` (all MIT-licensed). It does
> **not** cover behavior changes. Do a redesign **one surface at a time** — they're independent pages
> with different rendering contexts.

---

## 1. Hard constraints (non-negotiable)

These come from the hardware, the input model, and the security hardening already in `main`. Breaking
any of them is a regression, and several are enforced by `npm run security:all` (which CI runs).

### 1.1 The device & viewport
- The **panel** renders on the DK-QUAKE display: **1920×480** (landscape) or **480×1920** (portrait).
  In portrait the `#stage` (authored at a fixed **1920×480**) is **CSS-rotated 90°** to fill the screen.
  Author everything in the 1920×480 space; rotation is display-fit only and must never be baked into
  children. `transform-origin` stays `0 0`.
- It is a **fixed stage, not a resizable window** — design for exactly 1920×480, an extreme 4:1 ratio.
  A layout that looks right at 16:9 in a normal preview will be wrong on the device. **Always verify on
  the real panel** (or a 1920×480 / 480×1920 viewport).
- Sizes are tuned for **far viewing** (a desk panel, not a phone). Keep type and hit-targets large.
- The served pages (System Monitor, Music, Chat) and the Flip Clock also render **inside the panel's
  webview on the device** — same far-viewing, fixed-size assumptions apply. The **Editor** is the one
  surface that's a normal Mac window (mouse + keyboard).

### 1.2 Input: touch + knob (not a mouse)
- Primary input is **finger touch** and a **rotary knob**; the PC mouse is secondary.
- The panel's tap routing is **geometric, not element-based**: `tileAt()` computes
  `col = floor(x / (1920/cols))`, `row = floor(y / (480/rows))` (with `y` flipped) on the unrotated
  stage. **The grid must stay exactly `cfg.cols × cfg.rows` equal `1fr` cells filling 1920×480** — if
  the visual grid stops matching that geometry, taps land on the wrong tile. Merged tiles use a
  `cover` index; keep that intact.
- No `:hover`-dependent affordances on device surfaces — design for tap/press/rotate states.

### 1.3 Content-Security-Policy (already hardened — don't regress it)
Every page ships a strict CSP `<meta>` (and the served pages also get a header). The guard
`scripts/security/check-open-quake-security.mjs` fails the build if you weaken it.
- **`script-src 'self'` → NO inline `<script>`, NO `on*=` attributes, NO `javascript:` URIs.** All page
  logic lives in external `.js` files. If a redesign adds an inline handler, the page silently breaks
  *and* CI goes red. Wire events with `addEventListener` / `.onclick` in the existing `.js`.
- **`style-src 'unsafe-inline'` → inline `<style>` blocks and `style="…"` attributes are fine.** This is
  your design lever: **all CSS is freely changeable.**
- **`font-src 'self' data:` → NO remote web fonts.** A Google-Fonts `@import` (the chat widget's `Inter`)
  is already blocked and falls back to a system font. Any font you introduce must be **self-hosted**
  (bundled, served same-origin) or part of a **system stack**.
- `img-src` allows `data:`/`file:`/`http(s)` (tile icons resolve to data URLs), so imagery is flexible.

### 1.4 XSS-safety (already hardened)
Tile labels/icons come from user-editable config and are rendered via **DOM `textContent` / `esc()`**,
never `innerHTML` string-interpolation. Keep it that way — the baseline guard checks `index.js`,
`musicview.js`, and `config.html` for this. Restyle freely, but build text nodes safely.

### 1.5 Preserve the JS ↔ DOM contract
Each page's script reads/writes specific **element IDs, `data-*` attributes, and class names**, and
toggles **state classes** the CSS must style. A redesign may restructure markup **only if it keeps those
hooks** (or updates the `.js` in lockstep). The contract per surface is in §4.

### 1.6 Verify every change
- `npm run security:all` (baseline + node:test + macOS + docs) must stay green.
- `npm run test:clock-layout` (headless-Chrome) must stay green for any clock change.
- View the result on the **real 1920×480 panel** and the **Editor window**, not just a browser tab.

### 1.7 Off-limits files
- **License boundary:** restyle `app/**` and `apps/clock.*` (MIT). Do **not** touch
  `src/Aris68Connector.js`, `docs/DEVICE_PROTOCOL.md`, or `tools/**` (PolyForm Noncommercial).
- **Vendored bundle:** `app/ChatWidget.js` is a **compiled Svelte bundle** (scope class
  `svelte-1665k1s`). **Never hand-edit it** — the chat can only be restyled via CSS
  (`owui-widget.css` + the overrides in `chatview.html`).

---

## 2. Current design language

A single, coherent **dark-glass + mint-green** system, but the values are **hardcoded per file** (no
shared token system — see §5 for the opportunity).

**Palette**
| Role | Value(s) |
|---|---|
| Background | near-black `#05080d`; panel radial `#0e1b2e → #05080d` |
| Surfaces / cards | `#0b1119`, `#070b11`; tiles `#18293d → #0c141f` |
| Borders | `#1e2733`, `#243a55`, `#1a2738`, `#141c28` |
| Text | primary `#e8eef6` / `#dbe5f0` / `#cfe0f2`; muted `#9fb3c8`, `#7e93ab`, `#6f8298` |
| **Accent — mint** | **`#7CFFB2`** — the brand + the interaction/active/selected cue, used on *every* surface |
| Blue | `#38b6ff`, `#2b8bff` (links, primary buttons, GPU arc) |
| Other status | purple `#b06cff` (donut), orange `#ff8a5c`/`#ffb454` (temp/warn), coral `#ff6b6b` (critical), clock cyan `#aef4ff` |

**Typography:** `'Segoe UI', system-ui, sans-serif` everywhere — note `'Segoe UI'` is a **Windows** font,
so on macOS it falls through to `system-ui` (San Francisco). Sizes are fixed `px`, tuned for far viewing.
The clock uses `tabular-nums`.

**Motifs:** dark glass; soft radial gradients; **mint glow** on active/selected; rounded cards
(`radius` 16–18px); the System-Monitor **conic-gradient donut**; the **flip-card** clock; **circular**
transport buttons.

---

## 3. Surfaces at a glance

| Surface | Files | Renders | Input |
|---|---|---|---|
| **Panel** (hero) | `app/index.html` + `index.js` | Device 1920×480 (rotated in portrait) | Touch + knob |
| **Editor** | `app/config.html` + `config.js` | Mac window | Mouse + keyboard |
| **System Monitor** | `app/sysview.html` + `sysview.js` | Device (served) | View-only |
| **Music** | `app/musicview.html` + `musicview.js` | Device (served) | Touch |
| **Chat** | `app/chatview.html` + `chatview-*.js` + vendored `ChatWidget.js` + `owui-widget.css` | Device (served) | Touch + knob (PTT) |
| **Flip Clock** | `apps/clock.html` + `apps/clock.js` | Device | View-only (+ gear) |

---

## 4. Per-surface profiles

For each: what it is · **safe to restyle** · **must preserve** (the JS contract).

### 4.1 Panel — `app/index.html` + `app/index.js`  ← start here (the hero)
The tile-grid launcher + full-bleed dashboard `<webview>` + knob dial-selector + first-run intro +
volume flash. Single inline `<style>` block (lines ~6–54); no external CSS.
- **Safe to restyle:** all colors/gradients, the `#stage` background, tile look (radius, gradient,
  border, the `.hit` pressed glow, the `.empty` dashed look), typography, the selector/intro/volume
  chrome, animations.
- **Must preserve:** the bridge `window.openQuakePanel` (`launch/volume/switchGrid/toggleRotation/
  openExternal/introDone` + `onGrid/onGridList/onRotation/onIntro/onTouch/onKnob`); element IDs
  `#stage #grid #web #vol #selector #selitems #intro #introok`; tile classes `.tile .empty .span .hit`
  and the per-tile `data-i` index; child structure `.ic` / `.ic-img` / `.lb`; the **geometric grid**
  (cols×rows `1fr` filling 1920×480 — §1.2) and the rotation transform (§1.1).
- **Opportunity:** the launcher is the brand's face — strongest place to establish identity. Keep mint
  as the interaction cue (it already signals active/selected), but the idle tiles (blue gradient) are
  generic and could carry more character.

### 4.2 Editor — `app/config.html` + `app/config.js`
The Mac-side window for grids/tiles/dashboards/settings/lighting/Spotify-connect. Inline `<style>`
(lines ~6–70) + many `style=""` attrs; no framework, no web fonts.
- **Safe to restyle:** the whole palette, typography, spacing, buttons/inputs/selects, the
  `.cell`/`.gridrow`/`.form`/`.iconbox` treatments, header/footer chrome, the tile-preview grid.
- **Must preserve:** `window.openQuakeConfig` bridge calls; static IDs `#gridlist #gridmeta #tilegrid`
  (and the runtime-generated `#gName #gCols #gRows …`, `#tLabel #tValue …`, Spotify section IDs); the
  `.reveal` password-toggle class, drag-and-drop on `.cell` (`draggable` + dragstart/over/drop), the
  `.cell.insel` selection class; and the **config data model** field names (`activeGridId`, `grids[]`,
  `tiles[]`, `auth`, `options`, `settings`) — Save persists these.
- **Opportunity:** flat "everything is a generic `<button>`" hierarchy → introduce a real
  segmented-control for tabs and clearer primary/secondary/danger button tiers.

### 4.3 System Monitor — `app/sysview.html` + `app/sysview.js`
CPU/GPU/RAM/disk/network/battery gauges; the hero is a **conic-gradient donut**. Inline `<style>`
(lines ~7–77).
- **Safe to restyle:** all colors, the panel chrome, gauge track/arc widths, the donut's conic gradient,
  typography, spacing, transitions.
- **Must preserve:** the gauge geometry constant `CIRC = 376.991 (2·π·60)` with `<circle r=60 cx=70
  cy=70>` in a `0 0 140 140` viewBox (arcs animate via `stroke-dashoffset`); all IDs `render()` writes
  (`#cpuLoad #gpuLoad #memUsed #memUsedBar #netDown #battPct #disks …`); `renderDisks()` regenerates
  `#disks` innerHTML using `.drow/.dhead/.k/.v/.bar/.barfill`; `#recon` + `.show`; the `.garc`/`.barfill`
  transitions.
- **Watch-outs:** CPU **Temp** gauge is permanently `—` (no data) — it looks half-dead; consider
  de-emphasizing perpetually-unavailable gauges. `.legend`/`.dot` classes are vestigial.

### 4.4 Music — `app/musicview.html` + `app/musicview.js`
Now-playing (art/title/artist/status) · circular transport buttons · embedded 2×2 tile grid. Inline
`<style>` (lines ~7–51).
- **Safe to restyle:** all colors/gradients/borders/radii, the rule-of-thirds flex proportions, the
  circular `.btn`/`.btn.play` shapes, the tile look, the album-art frame.
- **Must preserve:** IDs `#artImg #mTitle #mArtist #mStatus #mApp #bPrev #bPlay #bNext #bPause #grid
  #recon`; the SVG transport icons (`viewBox 0 0 24 24`, `fill: currentColor`); the `.tile`+`data-i`
  grid (same `/launch?i=N` contract as the panel); and the **brittle play/pause state machine** —
  `togglePlayPause()` string-compares `$('bPlay').innerHTML === ICON.pause`, so if you change the icon
  markup, update `ICON`/`setPlayIcon` together (or, better, switch to a class/`data-state` toggle).
- **Opportunity:** fixed `px` type (52/32/20…) can overflow on differently-sized panels — consider
  `clamp()`/`vw`. The icon-string state compare is fragile; a `data-state` attribute would be cleaner.

### 4.5 Chat — `app/chatview.html` (+ `chatview-*.js`) + vendored `ChatWidget.js` + `owui-widget.css`
A compiled Svelte chat widget themed dark to match the panel, plus a push-to-talk cue.
- **Safe to restyle:** everything in `chatview.html`'s inline `<style>` (host reset, the dark-theme
  override block, the `#nokey` "needs setup" overlay) and all of `owui-widget.css`. The PTT cue's
  inline `cssText` (in `chatview-ptt.js`).
- **Must preserve / off-limits:** `ChatWidget.js` is **compiled — CSS-only**. Keep `#chat-widget` (mount
  target) and `#nokey`; don't rename the `svelte-1665k1s` scope class or the
  `.message-wrapper.user/.assistant` role classes the dark theme targets; keep `window.pttStart/pttStop`
  and the `document.querySelector('textarea')` the PTT code drives.
- **Watch-outs:** theming is a **specificity fight** — the dark look is bolted on as `#chat-widget .x`
  overrides of a light bundle theme, with colors duplicated across `owui-widget.css` and the inline
  `<style>`. Consolidating into CSS custom properties would help. And the bundle's **`Inter` Google-Fonts
  `@import` is blocked by CSP** (§1.3) — it renders in a system font; self-host Inter or embrace the
  system stack.

### 4.6 Flip Clock — `apps/clock.html` + `apps/clock.js`
Flip-card clock with 12h/24h, seconds, date, and dark/classic themes. Inline `<style>` (lines ~8–105);
already uses **CSS custom properties** (`--bg --card-top --digit --accent …`) — a good token model to
emulate elsewhere.
- **Safe to restyle:** the `:root` and `body.classic` token palettes, card surfaces/radius/shadow, the
  colon dots, corner date type, the gear/settings panel, the flip animation timing.
- **Must preserve:** IDs `#clock #corner #gear #panel` (+ generated `#date #dow #ampm`); `#panel.open`
  toggle; `[data-set]`/`[data-toggle]` settings controls; card classes `.card .card.wide .group .sep`,
  the `data-v` value cache, the `go` flap-animation class + `animationend` swap; the `localStorage`
  key `flipclock` and the `mode/theme/seconds/date` URL params; the `body.classic` theme switch.
- **Must preserve (layout math):** `wideHourFactor`/sizing in `applySizing()` keeps two-digit hours
  fitting (we just fixed 12h clipping) — re-run `npm run test:clock-layout` after any change.

---

## 5. Direction — pick one (this is the decision to make)

All values are currently hardcoded per file. Whatever direction you pick, a high-leverage first move is
to **extract a small shared token set** (CSS custom properties: bg / surface / border / text / muted /
accent / status) and apply it per surface — the clock already shows the pattern. (There's no shared
stylesheet because pages are standalone `file://` / served; duplicate a small `:root` token block per
page, or introduce one served/linked token file for the served pages.)

- **A. Refine the current dark-glass + mint** *(recommended — lowest risk, already coherent and
  device-appropriate).* Tighten spacing/hierarchy/type scale, unify accent usage, polish the tile /
  gauge / clock / button chrome, add restrained depth. Keep mint `#7CFFB2` as the interaction cue.
- **B. Fresh re-skin.** New palette + accent, a deliberate type scale, tasteful depth
  (glass/soft-shadow), consistent tokens across surfaces. **Keep a dark base** — the panel is a
  far-viewed display where dark + high-contrast reads best. Medium effort.
- **C. Bolder per-surface rethink** (e.g., re-imagine the launcher grid or the editor IA). Higher risk;
  only do one surface at a time and keep the JS contract.

**macOS-fresh note:** since this is the macOS fork, consider leading the font stack with
`-apple-system, system-ui` (or a self-hosted display font, §1.3) instead of the Windows-origin
`'Segoe UI'`.

---

## 6. Execution playbook

1. **One surface per pass.** Start with the **Panel** (the hero), then the **Editor**; the served pages
   and clock can follow.
2. **CSS-first.** `style-src 'unsafe-inline'` means you can do most of it in the existing inline
   `<style>` with no JS change. Keep every element ID / `data-*` / state class the script uses (§4); if
   you must restructure markup, update the `.js` in the same change.
3. **No inline scripts / handlers / `javascript:`** (§1.3). **No remote fonts** — self-host or system.
4. **Panel only:** keep the grid `cols×rows` `1fr` filling 1920×480 and the rotation transform (§1.1–1.2).
5. **Chat only:** CSS overrides; never edit `ChatWidget.js`. **Clock only:** keep the IDs + layout math;
   re-run the clock test.
6. **Verify:** `npm run security:all` + (`npm run test:clock-layout` if the clock changed), then look at
   it on the real 1920×480 panel and the Editor window. Screenshot to iterate.

### Quick do / don't
- ✅ Change any color, gradient, radius, shadow, spacing, font-size, animation in the inline `<style>`.
- ✅ Add CSS custom properties / a shared token block.
- ✅ Add elements/classes — just keep the ones the JS references.
- ❌ Add an inline `<script>` or `onclick=` (CSP breaks it).
- ❌ Add a Google-Fonts `@import` or any remote font (CSP blocks it).
- ❌ `innerHTML`-interpolate config-controlled tile label/icon (XSS guard).
- ❌ Rename the IDs / `data-*` / state classes in §4 without updating the matching `.js`.
- ❌ Break the panel's geometric grid, or hand-edit `ChatWidget.js`.
- ❌ Touch `src/Aris68Connector.js`, `docs/DEVICE_PROTOCOL.md`, or `tools/**` (license boundary).
