# Device Panel UI Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the device launcher and Music page visuals while giving bundled Music service tiles real image-backed icons with safe emoji fallback.

**Architecture:** Keep the current Electron renderer contracts and grid data flow. Add a small pure helper for default icon seeding, then make narrow renderer/CSS changes in the panel pages so image icons and emoji fallbacks share an icon-first tile treatment.

**Tech Stack:** Electron main/renderer JavaScript, static HTML/CSS, Node `node:test`, existing `npm run security:*` scripts.

## Global Constraints

- Never send DFU or firmware-flashing commands to a device.
- Never call `enterDfu()`.
- Never run `tools/writetest.js` unless explicitly authorized for this session.
- Do not run real-device smoke unless explicitly authorized.
- Do not run voice, microphone, push-to-talk, or transcription smoke.
- Keep changes inside the MIT app/editor boundary: `app/`, `apps/`, `docs/`, and `scripts/security/`.
- Do not bundle third-party logo files unless licensing is explicitly resolved.
- Do not automatically fetch arbitrary user-configured icon URLs during normal panel rendering.
- Preserve launcher grid behavior, touch handling, knob selector behavior, dashboard handling, media-key behavior, and device protocol code.
- The desktop editor redesign is out of scope.

---

## File Structure

- Create `app/defaultIcons.js`: pure helper that seeds only trusted manifest-marked default icon URLs.
- Create `scripts/security/test-default-icons.mjs`: unit tests for default icon seeding and the Music manifest defaults.
- Create `scripts/security/test-panel-ui-contracts.mjs`: static regression tests for required panel DOM IDs and icon-first renderer hooks.
- Modify `apps/apps.json`: add `iconType`, `iconUrl`, and `iconAutoSeed` to bundled Music service defaults while keeping emoji fallbacks.
- Modify `app/main.js`: import the helper, make Music-page setup/save paths seed trusted default icon caches through the existing guarded downloader, and keep failures non-blocking.
- Modify `app/config.js`: preserve `iconAutoSeed` during tile moves/copies and clear it on manual icon changes.
- Modify `app/index.js`: wrap launcher tile icons in a stable `.icon-frame` element.
- Modify `app/musicview.js`: render Music app-grid tile icons with the same `.icon-frame` structure.
- Modify `app/index.html`: refresh launcher, overlays, volume, selector, and intro CSS.
- Modify `app/musicview.html`: refresh Music album art, controls, status, and right-side app-grid CSS.

---

### Task 1: Default Music Icon Seeding

**Files:**
- Create: `app/defaultIcons.js`
- Create: `scripts/security/test-default-icons.mjs`
- Modify: `apps/apps.json`
- Modify: `app/main.js`
- Modify: `app/config.js`

**Interfaces:**
- Produces: `seedDefaultIconCachesInGrid(grid, fetchIconToCache, options) -> Promise<boolean>`
- Consumes: existing `fetchIconToCache(url) -> Promise<{ ok: boolean, cachePath?: string, error?: string }>`
- Consumes: existing `loadApps()`, `ensureMusicPage()`, `saveConfig()`, and `saveConfigFromEditor`

- [ ] **Step 1: Write failing tests for the icon seeding helper and manifest**

Create `scripts/security/test-default-icons.mjs`:

```js
#!/usr/bin/env node

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { seedDefaultIconCachesInGrid } = require('../../app/defaultIcons');

test('seedDefaultIconCachesInGrid seeds only manifest-marked default URL icons', async () => {
  const grid = {
    tiles: [
      { label: 'Spotify', icon: '♪', iconType: 'url', iconUrl: 'https://open.spotify.com/favicon.ico', iconAutoSeed: true },
      { label: 'Custom', icon: 'C', iconType: 'url', iconUrl: 'https://example.com/icon.png' },
    ],
  };
  const calls = [];
  const changed = await seedDefaultIconCachesInGrid(grid, async url => {
    calls.push(url);
    return { ok: true, cachePath: `/tmp/${calls.length}.ico` };
  });

  assert.equal(changed, true);
  assert.deepEqual(calls, ['https://open.spotify.com/favicon.ico']);
  assert.equal(grid.tiles[0].iconCache, '/tmp/1.ico');
  assert.equal(grid.tiles[0].iconAutoSeed, false);
  assert.equal(grid.tiles[1].iconCache, undefined);
});

test('seedDefaultIconCachesInGrid is non-blocking on fetch failure and keeps fallback emoji', async () => {
  const grid = {
    tiles: [
      { label: 'Tidal', icon: 'T', iconType: 'url', iconUrl: 'https://listen.tidal.com/favicon.ico', iconAutoSeed: true },
    ],
  };
  const messages = [];
  const changed = await seedDefaultIconCachesInGrid(
    grid,
    async () => ({ ok: false, error: 'network unavailable' }),
    { log: message => messages.push(message) },
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test scripts/security/test-default-icons.mjs`

Expected: FAIL with `Cannot find module '../../app/defaultIcons'`.

- [ ] **Step 3: Add the pure seeding helper**

Create `app/defaultIcons.js`:

```js
'use strict';

async function seedDefaultIconCachesInGrid(grid, fetchIconToCache, options = {}) {
  if (!grid || !Array.isArray(grid.tiles) || typeof fetchIconToCache !== 'function') return false;
  const log = typeof options.log === 'function' ? options.log : () => {};
  let changed = false;

  for (const tile of grid.tiles) {
    if (!tile || tile.cover != null) continue;
    if (tile.iconType !== 'url' || tile.iconAutoSeed !== true || !tile.iconUrl || tile.iconCache) continue;

    let result;
    try { result = await fetchIconToCache(tile.iconUrl); }
    catch (e) { result = { ok: false, error: e && e.message }; }

    if (result && result.ok && result.cachePath) {
      tile.iconCache = result.cachePath;
      tile.iconAutoSeed = false;
      changed = true;
    } else {
      log('default icon seed failed: ' + (tile.label || tile.iconUrl) + (result && result.error ? ' (' + result.error + ')' : ''));
    }
  }

  return changed;
}

module.exports = { seedDefaultIconCachesInGrid };
```

- [ ] **Step 4: Update bundled Music defaults**

Modify `apps/apps.json` Music defaults to keep the existing actions but add icon metadata:

```json
        { "label": "Spotify",     "icon": "♪", "iconType": "url", "iconUrl": "https://open.spotify.com/favicon.ico",  "iconAutoSeed": true, "type": "url", "value": "https://open.spotify.com" },
        { "label": "YT Music",    "icon": "▶", "iconType": "url", "iconUrl": "https://music.youtube.com/favicon.ico", "iconAutoSeed": true, "type": "url", "value": "https://music.youtube.com" },
        { "label": "Apple Music", "icon": "A", "iconType": "url", "iconUrl": "https://music.apple.com/favicon.ico",    "iconAutoSeed": true, "type": "url", "value": "https://music.apple.com" },
        { "label": "Tidal",       "icon": "T", "iconType": "url", "iconUrl": "https://listen.tidal.com/favicon.ico",   "iconAutoSeed": true, "type": "url", "value": "https://listen.tidal.com" }
```

- [ ] **Step 5: Preserve and clear `iconAutoSeed` correctly in the editor**

Modify `app/config.js`:

```js
  function tileFields(t) {
    const out = { label: (t && t.label) || '', icon: (t && t.icon) || '', type: (t && t.type) || '', value: (t && t.value) || '', iconType: (t && t.iconType) || 'emoji', iconImage: (t && t.iconImage) || '', iconUrl: (t && t.iconUrl) || '', iconCache: (t && t.iconCache) || '' };
    if (t && t.iconAutoSeed === true) out.iconAutoSeed = true;
    return out;
  }
  function clearAutoSeed(t) { if (t) delete t.iconAutoSeed; }
```

Then clear the marker on manual tile/icon edits:

```js
    document.getElementById('tLabel').oninput = e => { t.label = e.target.value; clearAutoSeed(t); renderTiles(); markDirty(); };
    document.getElementById('tType').onchange = e => { const prev = t.type; t.type = e.target.value; clearAutoSeed(t); if (t.type === 'page' || prev === 'page') t.value = ''; render(); markDirty(); };
    if (tv) tv.oninput = e => { t.value = e.target.value; clearAutoSeed(t); renderTiles(); renderIconPane(); markDirty(); };
```

And in icon edit handlers:

```js
    el.querySelectorAll('input[name=ic]').forEach(r => r.onchange = e => { t.iconType = e.target.value; clearAutoSeed(t); renderIconPane(); renderTiles(); markDirty(); });
```

```js
      document.getElementById('tIcon').oninput = e => { t.icon = e.target.value; clearAutoSeed(t); renderTiles(); renderIconPreview(t); markDirty(); };
```

```js
      document.getElementById('tImgBrowse').onclick = async () => { const p = await configApi.pickImage(); if (p) { t.iconImage = p; clearAutoSeed(t); renderIconDetail(t); renderIconPreview(t); renderTiles(); markDirty(); } };
```

```js
        if (r && r.ok) { t.iconUrl = url; t.iconCache = r.cachePath; clearAutoSeed(t); if (r.dataUrl) urlIconPreview[r.cachePath] = r.dataUrl; msg().textContent = 'Icon downloaded ✓'; sync(); renderIconPreview(t); renderTiles(); markDirty(); }
```

- [ ] **Step 6: Wire default icon seeding into the main process**

Modify the top of `app/main.js`:

```js
const { seedDefaultIconCachesInGrid } = require('./defaultIcons');
```

Change `ensureMusicPage` into an async function:

```js
async function ensureMusicPage() {
  if (!config.grids) config.grids = [];
  let g = config.grids.find(x => x.id === 'music');
  if (!g) {
    if (config.musicInjected) return;
    g = { id: 'music' }; config.grids.push(g); config.musicInjected = true;
  }
  g.name = g.name || 'Music';
  g.kind = 'app'; g.app = 'music';
  delete g.url; delete g.auth;
  if (typeof g.cols !== 'number') g.cols = 2;
  if (typeof g.rows !== 'number') g.rows = 2;
  if (!Array.isArray(g.tiles) || !g.tiles.length) {
    const def = loadApps().find(a => a.id === 'music');
    g.tiles = ((def && def.grid && def.grid.defaults) || []).map(t => Object.assign({}, t));
  }
  await seedDefaultIconCachesInGrid(g, fetchIconToCache, { log: message => console.log(message) });
  saveConfig();
}
```

Update app-ready startup:

```js
    ensureSystemViewPage(serverPort); await ensureMusicPage();
```

Update editor saves so newly added Music pages are seeded before saving/pushing:

```js
  ipcMain.on('saveConfigFromEditor', async (e, newCfg) => {
    if (!isFrom(e, configWin) || !newCfg || typeof newCfg !== 'object' || !Array.isArray(newCfg.grids)) return;
    const active = config.activeGridId;
    const wasRot = rotationCfg().enabled;
    config = newCfg;
    for (const g of config.grids) {
      if (g && g.kind === 'app' && g.app === 'music') {
        await seedDefaultIconCachesInGrid(g, fetchIconToCache, { log: message => console.log(message) });
      }
    }
    if (config.grids.some(g => g.id === active)) config.activeGridId = active;
    else if (!config.grids.some(g => g.id === config.activeGridId)) config.activeGridId = (config.grids[0] || {}).id || null;
    saveConfig(); pushToPanel(); applyKnobSettings(); refreshTray(); applyRotationSettings(wasRot);
  });
```

- [ ] **Step 7: Run default icon tests**

Run: `node --test scripts/security/test-default-icons.mjs`

Expected: PASS for all tests in `scripts/security/test-default-icons.mjs`.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add app/defaultIcons.js scripts/security/test-default-icons.mjs apps/apps.json app/main.js app/config.js
git commit -m "feat: seed default music icons"
```

---

### Task 2: Icon-First Renderer Contracts

**Files:**
- Create: `scripts/security/test-panel-ui-contracts.mjs`
- Modify: `app/index.js`
- Modify: `app/musicview.js`

**Interfaces:**
- Produces: `.icon-frame` wrapper in both launcher and Music app grid tiles.
- Preserves: existing tile click/touch behavior based on parent `.tile[data-i]`.

- [ ] **Step 1: Write failing static contract tests**

Create `scripts/security/test-panel-ui-contracts.mjs`:

```js
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
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `node --test scripts/security/test-panel-ui-contracts.mjs`

Expected: FAIL because `.icon-frame` and `--panel-bg` are not present yet.

- [ ] **Step 3: Update launcher renderer to create `.icon-frame`**

Modify the non-empty tile branch in `app/index.js`:

```js
      if (!empty) {
        const frame = document.createElement('div');
        frame.className = 'icon-frame';
        if (t.iconSrc) {
          const im = document.createElement('img');
          im.className = 'ic-img';
          im.src = t.iconSrc;
          frame.appendChild(im);
        } else {
          const icd = document.createElement('div');
          icd.className = 'ic';
          icd.textContent = t.icon || '▫️';
          frame.appendChild(icd);
        }
        d.appendChild(frame);
        const lb = document.createElement('div');
        lb.className = 'lb';
        lb.textContent = t.label || '';
        d.appendChild(lb);
      }
```

- [ ] **Step 4: Update Music grid renderer to emit `.icon-frame`**

Modify the non-empty tile branch in `app/musicview.js`:

```js
        var ic = t.iconSrc
          ? '<div class="icon-frame"><div class="ic"><img src="' + esc(t.iconSrc) + '"></div></div>'
          : '<div class="icon-frame"><div class="ic">' + esc(t.icon || '▫️') + '</div></div>';
        html += '<div class="tile" data-i="' + i + '">' + ic + '<div class="lb">' + esc(t.label || '') + '</div></div>';
```

- [ ] **Step 5: Run the contract test again**

Run: `node --test scripts/security/test-panel-ui-contracts.mjs`

Expected: still FAIL only on `--panel-bg` CSS token checks, which Task 3 will add.

- [ ] **Step 6: Carry renderer hook changes into Task 3**

Do not commit yet. The contract test is intentionally still red until Task 3 adds the CSS tokens. Task 3 commits the renderer hook and CSS changes together after `test-panel-ui-contracts.mjs` passes.

---

### Task 3: Device Panel Visual Refresh

**Files:**
- Modify: `app/index.html`
- Modify: `app/musicview.html`
- Modify if Task 2 commit was deferred: `scripts/security/test-panel-ui-contracts.mjs`, `app/index.js`, `app/musicview.js`

**Interfaces:**
- Consumes: `.icon-frame` wrappers from Task 2.
- Preserves: all existing IDs used by `app/index.js` and `app/musicview.js`.

- [ ] **Step 1: Replace launcher CSS with refreshed panel styles**

In `app/index.html`, keep the existing CSP, DOM, and script include. Replace the `<style>` content with a modernized equivalent that includes these required tokens/selectors:

```css
  :root {
    --panel-bg: #080a0f;
    --surface: rgba(255,255,255,.065);
    --surface-strong: rgba(255,255,255,.105);
    --stroke: rgba(255,255,255,.14);
    --stroke-soft: rgba(255,255,255,.08);
    --text: #f4f7fb;
    --muted: #9aa6b5;
    --accent: #6ee7b7;
    --accent-blue: #7bb7ff;
    --danger: #ff6b8a;
  }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
  #stage {
    position: absolute; top: 0; left: 0; width: 1920px; height: 480px;
    transform-origin: 0 0; transform: translate(480px, 0) rotate(90deg);
    background:
      linear-gradient(135deg, rgba(255,255,255,.035), rgba(255,255,255,0) 38%),
      radial-gradient(120% 160% at 0% 0%, #132033 0%, var(--panel-bg) 62%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: var(--text);
  }
  #grid { display: grid; width: 1920px; height: 480px; gap: 12px; padding: 14px; box-sizing: border-box; }
  #web { position: absolute; top: 0; left: 0; width: 1920px; height: 480px; border: 0; background: var(--panel-bg); display: none; }
  #web.show { display: flex; }
  .tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    border-radius: 16px; background: linear-gradient(180deg, var(--surface-strong), var(--surface));
    border: 1px solid var(--stroke-soft); color: var(--text); user-select: none; overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 10px 28px rgba(0,0,0,.2);
    transition: transform .08s ease, background .08s ease, border-color .08s ease, box-shadow .08s ease;
  }
  .tile.empty { background: rgba(255,255,255,.025); border: 1px dashed rgba(255,255,255,.09); box-shadow: none; }
  .icon-frame {
    width: 82px; height: 82px; border-radius: 22px; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.08);
  }
  .tile .ic { font-size: 52px; line-height: 1; }
  .tile .ic-img { width: 62px; height: 62px; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,.28)); }
  .tile .lb { max-width: 92%; font-size: 19px; line-height: 1.15; color: var(--muted); font-weight: 600; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile.span .icon-frame { width: 122px; height: 122px; border-radius: 30px; }
  .tile.span .ic { font-size: 86px; }
  .tile.span .ic-img { width: 96px; height: 96px; }
  .tile.span .lb { font-size: 25px; color: #cbd5e1; }
  .tile.hit {
    background: linear-gradient(180deg, rgba(110,231,183,.2), rgba(123,183,255,.12));
    border-color: rgba(110,231,183,.8); color: #fff; transform: scale(.965);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 3px rgba(110,231,183,.18), 0 18px 34px rgba(0,0,0,.32);
  }
  .tile.hit .icon-frame { background: rgba(110,231,183,.16); border-color: rgba(110,231,183,.42); }
  #vol {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); min-width: 150px;
    color: var(--text); background: rgba(8,10,15,.86); border: 1px solid var(--stroke);
    padding: 18px 30px; border-radius: 18px; font-size: 42px; font-weight: 700; text-align: center;
    opacity: 0; transition: opacity .12s; pointer-events: none; backdrop-filter: blur(14px);
  }
  #selector, #intro {
    position: absolute; inset: 0; background: rgba(8,10,15,.94); display: none; z-index: 20;
    flex-direction: column; align-items: center; justify-content: center; color: var(--text); backdrop-filter: blur(18px);
  }
  #selector.open, #intro.open { display: flex; }
  .seltitle { font-size: 24px; color: var(--accent); letter-spacing: 1.6px; margin-bottom: 10px; font-weight: 800; }
  .selwheel { height: 300px; width: 760px; overflow: hidden; position: relative; -webkit-mask-image: linear-gradient(#0000, #000 30%, #000 70%, #0000); }
  #selitems { position: absolute; left: 0; right: 0; top: 50%; transition: transform .14s ease-out; }
  .selitem { height: 76px; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #66758a; transform: translateY(-50%); }
  .selitem.sel { font-size: 50px; font-weight: 800; color: #fff; text-shadow: 0 0 26px rgba(110,231,183,.36); }
  .selhint { margin-top: 10px; font-size: 20px; color: var(--muted); }
  .introicon { font-size: 78px; line-height: 1; margin-bottom: 8px; }
  .introtitle { font-size: 42px; font-weight: 800; color: #fff; text-align: center; padding: 0 46px; }
  .introsub { font-size: 23px; color: var(--muted); margin-top: 12px; text-align: center; padding: 0 64px; }
  .introok { margin-top: 26px; font-size: 28px; font-weight: 800; color: #071016; background: var(--accent); border: 0; border-radius: 14px; padding: 13px 66px; cursor: pointer; }
  .introok:active { transform: scale(.96); }
```

- [ ] **Step 2: Replace Music CSS with matching panel styles**

In `app/musicview.html`, keep the CSP, DOM IDs, and script include. Replace the `<style>` content with a matching theme that includes:

```css
  :root {
    --panel-bg: #080a0f;
    --surface: rgba(255,255,255,.065);
    --surface-strong: rgba(255,255,255,.105);
    --stroke: rgba(255,255,255,.14);
    --stroke-soft: rgba(255,255,255,.08);
    --text: #f4f7fb;
    --muted: #9aa6b5;
    --accent: #6ee7b7;
    --accent-blue: #7bb7ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; }
  body {
    background:
      linear-gradient(135deg, rgba(255,255,255,.035), rgba(255,255,255,0) 42%),
      radial-gradient(120% 160% at 0% 0%, #132033 0%, var(--panel-bg) 62%);
    color: var(--text); overflow: hidden; user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  #wrap { display: flex; width: 100vw; height: 100vh; padding: 26px; align-items: stretch; gap: 28px; }
  .art-col { flex: .98; display: flex; align-items: center; justify-content: flex-start; min-width: 0; }
  .mid { flex: 1.52; min-width: 0; display: flex; flex-direction: column; justify-content: space-evenly; gap: 26px; padding: 28px 28px; }
  .grid-col { flex: .98; display: flex; align-items: center; justify-content: flex-end; min-width: 0; }
  .art {
    height: 100%; aspect-ratio: 1/1; border-radius: 24px; position: relative; overflow: hidden;
    background: linear-gradient(180deg, var(--surface-strong), var(--surface)); border: 1px solid var(--stroke-soft);
    display: flex; align-items: center; justify-content: center; box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 18px 36px rgba(0,0,0,.28);
  }
  .art .note { font-size: 138px; opacity: .2; }
  .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: none; }
  .title { font-size: 50px; font-weight: 800; line-height: 1.08; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist { font-size: 30px; color: var(--muted); margin-top: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { display: flex; align-items: center; gap: 12px; margin-top: 24px; font-size: 18px; color: #7f8da1; min-height: 30px; }
  .status .pill { padding: 5px 14px; border-radius: 999px; background: rgba(110,231,183,.12); color: var(--accent); border: 1px solid rgba(110,231,183,.24); font-weight: 800; letter-spacing: .4px; }
  .controls { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .btn {
    width: 92px; height: 92px; border-radius: 50%; border: 1px solid var(--stroke-soft); cursor: pointer; color: var(--text);
    background: linear-gradient(180deg, var(--surface-strong), var(--surface)); display: flex; align-items: center; justify-content: center;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 10px 24px rgba(0,0,0,.22); transition: transform .08s ease, border-color .08s ease;
  }
  .btn:active { transform: scale(.92); border-color: rgba(110,231,183,.72); }
  .btn svg { width: 42%; height: 42%; fill: currentColor; }
  .btn.play { width: 116px; height: 116px; color: #071016; background: linear-gradient(180deg, #84f4c8, #37c987); border-color: rgba(110,231,183,.84); }
  .grid { flex: none; height: 100%; aspect-ratio: 1; display: grid; gap: 14px; }
  .tile {
    border-radius: 16px; border: 1px solid var(--stroke-soft); cursor: pointer; overflow: hidden;
    background: linear-gradient(180deg, var(--surface-strong), var(--surface)); display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px; transition: transform .08s ease, border-color .08s ease;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 10px 24px rgba(0,0,0,.2);
  }
  .tile:active { transform: scale(.965); border-color: rgba(110,231,183,.72); }
  .icon-frame {
    width: 82px; height: 82px; border-radius: 22px; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.08);
  }
  .tile .ic { font-size: 52px; line-height: 1; }
  .tile .ic img { width: 62px; height: 62px; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,.28)); }
  .tile .lb { max-width: 92%; font-size: 19px; color: #cbd5e1; font-weight: 700; padding: 0 8px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile.empty { background: rgba(255,255,255,.025); border-style: dashed; border-color: rgba(255,255,255,.08); cursor: default; box-shadow: none; }
  #recon { position: fixed; right: 14px; bottom: 10px; font-size: 12px; color: #ffbf8a; opacity: 0; transition: opacity .3s; }
  #recon.show { opacity: 1; }
```

- [ ] **Step 3: Run panel contract tests**

Run: `node --test scripts/security/test-panel-ui-contracts.mjs`

Expected: PASS.

- [ ] **Step 4: Run all Node tests**

Run: `npm test`

Expected: PASS, including `test-default-icons.mjs` and `test-panel-ui-contracts.mjs`.

- [ ] **Step 5: Commit Task 2/3 visual changes**

Run:

```bash
git add scripts/security/test-panel-ui-contracts.mjs app/index.js app/musicview.js app/index.html app/musicview.html
git commit -m "style: refresh panel surfaces"
```

If Task 2 was already committed, only stage `app/index.html` and `app/musicview.html`.

---

### Task 4: Verification And Visual Inspection

**Files:**
- Modify only if visual inspection finds a concrete issue: `app/index.html`, `app/musicview.html`, `app/index.js`, `app/musicview.js`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified panel UI/icon refresh ready for user review.

- [ ] **Step 1: Run security baseline**

Run: `npm run security:all`

Expected: PASS for baseline, actions/tests, macOS guard, and docs guard.

- [ ] **Step 2: Launch Electron for non-device visual inspection**

Run:

```bash
npm exec electron -- --remote-debugging-port=9228 --user-data-dir=/tmp/open-quake-smoke-userdata .
```

Expected: app launches without device-specific destructive actions. Inspect only app launch, panel/editor UI, and safe static visuals. Do not run device smoke, DFU, firmware, write-test, mic, voice, push-to-talk, or transcription checks.

- [ ] **Step 3: Inspect panel pages**

Check:

- Launcher tiles remain correctly arranged at 1920x480.
- Empty tiles are inactive-looking.
- Image icons appear centered inside `.icon-frame`.
- Emoji fallback icons remain legible.
- Pressed tile state is obvious but not full-neon.
- Page selector, volume overlay, and intro overlay still fit.
- Music page keeps album art, text, controls, and the 2x2 grid inside the 1920x480 viewport.
- Long labels still ellipsize inside their tile bounds.

- [ ] **Step 4: Fix any visual regressions and rerun targeted checks**

If a visual issue is found, patch the relevant CSS/renderer code, then run:

```bash
node --test scripts/security/test-panel-ui-contracts.mjs
npm run security:all
```

Expected: PASS.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short --branch
git log -3 --oneline --decorate
```

Expected: only intentional commits are present and no uncommitted changes remain unless there is a deliberate final patch to commit.

- [ ] **Step 6: Final commit if verification produced fixes**

Run:

```bash
git add app/index.html app/musicview.html app/index.js app/musicview.js scripts/security/test-panel-ui-contracts.mjs
git commit -m "fix: polish panel visual refresh"
```

Only run this commit if Step 4 made additional changes.
