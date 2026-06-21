# Building & how it works

## How the hardware works

The DK-QUAKE's screen is a standard external monitor (HDMI or USB-C DisplayPort
alt-mode) recognized by macOS as a 480×1920 portrait display or a 1920×480
landscape display. A separate USB link handles touch and control/knob/mic
interfaces. Video travels over the display cable; open-quake renders an Electron
window onto that monitor, exactly as DK-Suite did. Unplug the display cable and
the panel goes dark, but the USB side keeps working.

The USB side is two HID interfaces: a control interface (knob, mic/state,
firmware, keep-alive) and a multi-touch interface. The panel ships dark and
idle-blanks; the driver wakes it and sends a periodic keep-alive so it stays on.
The on-board mic enumerates as a standard USB audio input; macOS microphone
permission is required only when push-to-talk records audio for the Open WebUI
chat page.

Full reverse-engineered protocol: [DEVICE_PROTOCOL.md](DEVICE_PROTOCOL.md).

## Build & run (macOS)

> **Node 24 LTS is the recommended release baseline** (pinned by `.nvmrc`). Node 26 is
> supported for local install, rebuild, and unsigned packaging. The project
> `.npmrc` keeps Node native builds pointed at `nodejs.org` headers so user-level
> Electron header settings do not break `npm ci` under Node 26. If native rebuild
> fails, check `node --version`, switch to Node 24 for the release baseline, delete
> `node_modules`, and reinstall. (`package.json` declares `"engines": node >=22.12 <27`.)

Install Xcode Command Line Tools, then build the native modules (`node-hid`,
optional `robotjs`) against this app's Electron ABI (**Electron 42**) and the
local macOS media-key helper:

```bash
xcode-select --install
npm install --ignore-scripts
node node_modules/electron/install.js
npm run rebuild
npm start
```

For a local unsigned macOS app bundle:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:dir
```

For release artifacts:

```bash
npm run dist:mac
```

Public macOS releases should be signed and notarized. The build config enables
the hardened runtime and includes a microphone usage string, but signing
credentials and notarization credentials must be supplied by the release
environment.

Plug in the DK-QUAKE display and USB before launch. The launcher finds the panel
display, places a borderless window on it, wakes the backlight, and starts
listening for touch and knob input.

In macOS **System Settings → Displays**, set the DK-QUAKE to a landscape
1920×480 arrangement when possible. That keeps pointer/touch alignment easiest
to reason about. open-quake can render on a portrait 480×1920 display too, but
external pointer coordinates are simpler when macOS exposes the panel as
landscape.

## Current macOS limitations

- The Music page's transport buttons and knob volume/mute go through
  `app/mediaKeys.js`. On macOS the adapter first tries the local
  `open-quake-media-key` helper for play/pause, next, previous, volume up/down,
  and mute, then falls back to optional `robotjs` for unsupported or failed commands.
  The helper is built by `npm run rebuild` into `app/native/` and ad-hoc signed
  locally; Developer ID signing/notarization is still required for public
  release artifacts.
- Generic now-playing metadata is still implemented through the Windows SMTC
  helper and is not macOS-parity yet.
- The System Monitor uses cross-platform `systeminformation` where possible, but
  Windows-only PowerShell GPU counters do not apply on macOS.
- Full device smoke tests are intentionally separate from build verification:
  do not run DFU/firmware commands, voice smoke, or device smoke without explicit
  operator approval.

## Code layout

```
src/Aris68Connector.js   the HID driver (events out, commands in)   [PolyForm NC]
docs/DEVICE_PROTOCOL.md   reverse-engineered protocol spec           [PolyForm NC]
tools/                    standalone HID probe / write-test scripts  [PolyForm NC]
app/                      the Electron launcher + PC grid editor     [MIT]
  main.js                 host: macOS, IPC, launch/volume/config
  index.html              the on-panel UI (grids + web dashboards)
  config.html             the PC editor (pages, tiles, icons)
  config.default.json     seed config (copied to config.json on first run)
  sysmetrics.js           SystemView: live host metrics (systeminformation; some Windows-only counters remain)
  nowplaying.js           Music: now-playing helper (Windows SMTC today; macOS parity pending)
  sysserver.js            localhost server for the served app pages (SystemView, Music, chat)
  sysview.html            SystemView: the on-panel system-monitor dashboard
  musicview.html          Music: now-playing + transport + the embedded app grid
  chatview.html           Open WebUI chat wrapper + knob push-to-talk
  ChatWidget.js           bundled Open WebUI chat widget   [vendored, MIT]
  owui-widget.css         widget styles                    [vendored, MIT]
apps/                     bundled local web apps + apps.json manifest [MIT]
```
