# Building & how it works

## How the hardware works

The DK-QUAKE's screen is a standard external monitor (HDMI or USB-C DisplayPort
alt-mode) recognized by Windows as a 480×1920 portrait display. A separate USB
link handles touch and control/knob/mic interfaces. Video travels over the
display cable; open-quake renders an Electron window onto that monitor, exactly
as DK-Suite did. Unplug the display cable and the panel goes dark, but the USB
side keeps working.

The USB side is two HID interfaces: a control interface (knob, mic/state,
firmware, keep-alive) and a multi-touch interface. The panel ships dark and
idle-blanks; the driver wakes it and sends a periodic keep-alive so it stays on.
The on-board mic enumerates as a standard **"5- USB PnP Audio Device"** — any app
can read it directly; `open-quake` doesn't wrap it.

Full reverse-engineered protocol: [DEVICE_PROTOCOL.md](DEVICE_PROTOCOL.md).

## Build & run (Windows)

> **Use Node 24 LTS** (pinned by `.nvmrc`). **Don't use Node 25/26 for release builds.**
> The native modules are old and still need a conservative Node/native toolchain even though
> Electron itself is newer. If native rebuild fails, `node --version`, switch to Node 24,
> delete `node_modules`, and reinstall. (`package.json` declares `"engines": node >=22.12 <25`.)

The native modules (`node-hid`, `robotjs`) must be built for this app's Electron
ABI (**Electron 42**), *not* your host Node. A plain `npm install` can fail if
native scripts target host Node instead of Electron. So install without scripts,
fetch the Electron binary, then rebuild the natives against the package Electron:

```powershell
npm install --ignore-scripts            # packages on disk, no native build
node node_modules/electron/install.js   # fetch the Electron binary
npm run rebuild                          # electron-rebuild -f  (node-hid + robotjs)
npm start
```

Building the natives on modern Windows needs Visual Studio 2022 Build Tools
(Desktop C++ workload) and a Python with `distutils` (`pip install
"setuptools<81"` on Python 3.12+). Set `GYP_MSVS_VERSION=2022` if node-gyp picks
the wrong toolset.

Plug in the DK-QUAKE before `npm start`. The launcher finds the panel display,
places a borderless window on it, wakes the backlight, and starts listening for
touch and knob input.

Set the DK-QUAKE's **display orientation to Landscape** in Windows (Settings →
System → Display) so Windows treats it as a 1920×480 landscape display — that
keeps the mouse and touch aligned with what you see. open-quake auto-rotates its
render if you leave it portrait, but then a desktop mouse moved onto the panel
reads 90° off.

## Code layout

```
src/Aris68Connector.js   the HID driver (events out, commands in)   [PolyForm NC]
docs/DEVICE_PROTOCOL.md   reverse-engineered protocol spec           [PolyForm NC]
tools/                    standalone HID probe / write-test scripts  [PolyForm NC]
app/                      the Electron launcher + PC grid editor     [MIT]
  main.js                 host: windows, IPC, launch/volume/config
  index.html              the on-panel UI (grids + web dashboards)
  config.html             the PC editor (pages, tiles, icons)
  config.default.json     seed config (copied to config.json on first run)
  sysmetrics.js           SystemView: live host metrics (systeminformation + GPU counters)
  nowplaying.js           Music: now-playing from Windows SMTC (via PowerShell)
  sysserver.js            localhost server for the served app pages (SystemView, Music, chat)
  sysview.html            SystemView: the on-panel system-monitor dashboard
  musicview.html          Music: now-playing + transport + the embedded app grid
  chatview.html           Open WebUI chat wrapper + knob push-to-talk
  ChatWidget.js           bundled Open WebUI chat widget   [vendored, MIT]
  owui-widget.css         widget styles                    [vendored, MIT]
apps/                     bundled local web apps + apps.json manifest [MIT]
```
