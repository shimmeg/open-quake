# open-quake

> **Disclaimer:** open-quake is an independent third-party community project. It is not affiliated with, endorsed by, maintained by, verified by, certified by, or officially supported by DECOKEE. DK-Suite is the official software for DECOKEE Quake. open-quake is not an official open-source version of DK-Suite. Use of open-quake is at your own risk.

This repository is a security-hardening, macOS-focused fork of
[TeeJS/open-quake](https://github.com/TeeJS/open-quake). Thanks to **TeeJS** and
the upstream contributors for creating and maintaining the original open-quake
project for the DK-QUAKE / ARIS-68 hardware.

An open driver and touchscreen launcher for the **DK-QUAKE / ARIS-68** — the
1920×480 touchscreen-plus-knob macro device (sold with the closed-source
DK-Suite app). `open-quake` talks to it directly over HID, with no vendor
software running.

![open-quake on the DK-QUAKE](docs/showcase.png)

*From top: the grid launcher · a merged-tile Media grid · the flip-clock app · a [Windy](https://www.windy.com) weather map and a [Home Assistant](https://www.home-assistant.io) dashboard — each with the knob's RGB ring lit a different color.*

**Current fork status:** macOS source-run target. This fork does not currently
publish ready-to-install macOS release artifacts; run it locally from source for
testing and development. See [Run locally on macOS](#run-locally-on-macos).

## What this fork changes

- Makes macOS the primary local-development target while keeping the original
  Windows paths available where practical.
- Adds security hardening around Electron renderer isolation, dashboard
  permissions, external URL handling, command execution, and Open WebUI secret
  handling.
- Adds automated security/documentation guards under `npm run security:*` so
  high-risk behavior is checked before commits.
- Updates default pages and local run instructions for macOS source use, without
  claiming a ready-to-install macOS release exists yet.
- Keeps the original DK-QUAKE / ARIS-68 driver and protocol work from upstream,
  with the same license boundary called out below.

> **Switching pages:** the panel shows one page at a time — **double-click the knob** to open the page selector, rotate to highlight a page, then press to switch. open-quake shows this tip right on the panel the first time you launch it.

It gives you:

- **A multi-grid launcher** — each page is a grid of tiles; tap a tile — or click it
  with your Mac pointer — to open an app, URL, shell command, file, a system action
  (lock screen), or jump to another open-quake page. Icons can be an emoji, the
  program's own icon, or a custom image. → [Editor](docs/editor.md)
- **Web dashboard pages** — a page can be a live web view (Home Assistant, Grafana,
  a status page…) shown full-screen; the knob scrolls, a tap clicks, logins persist,
  with per-page auth (HA token, Basic, custom headers). → [Dashboards](docs/dashboards.md)
- **Knob control** — rotate for volume (or dashboard scroll), single-click to mute,
  **double-click for the page selector**, and **hold to talk** (voice input). The
  knob's **RGB ring** is configurable. → [Settings](docs/settings.md)
- **Bundled apps** — a Flip Clock, a **[Music controller](docs/music.md)** (now-playing +
  transport + app grid), a **[System Monitor](docs/system-monitor.md)** (live
  CPU/GPU/RAM/disk/network/battery), and an **[Open WebUI chat](docs/ai-chat.md)** you can
  **talk to by holding the knob**. → [Apps](docs/apps.md)
- **A Mac-side editor** — build pages of tiles, merge adjacent tiles into larger buttons,
  drag-and-drop to rearrange, then **Save** to push to the panel. → [Editor](docs/editor.md)
- **Settings** — choose how it launches, **auto-rotate** through pages on a timer, toggle
  the mic, and tune the knob ring; plus a system-tray menu of quick toggles. → [Settings](docs/settings.md)

> **Status:** early security-hardening fork. The editor and local app shell run on macOS
> from source and have been smoke-tested without the DK-QUAKE connected. The device-facing
> HID driver, panel placement, knob controls, dashboards, bundled apps, and push-to-talk are
> present, but full macOS device smoke and release packaging/signing are still follow-up work.
> The panel is driven as a normal external monitor (macOS sees a 480×1920 / 1920×480 display);
> pushing frames over the HID resource channel is not implemented.

## 📖 Documentation

Detailed guides live in **[docs/](docs/README.md)**:

- [The editor](docs/editor.md) · [Web dashboards](docs/dashboards.md) · [Bundled apps](docs/apps.md)
- [Music controller](docs/music.md) · [System monitor](docs/system-monitor.md) · [Open WebUI chat + voice](docs/ai-chat.md)
- [Settings & knob lighting](docs/settings.md) · [Building & how it works](docs/building.md) · [Security hardening](docs/security/open-quake-hardening.md) · [Release readiness](docs/release-readiness.md) · [Device protocol](docs/DEVICE_PROTOCOL.md)

## Run locally on macOS

There is no published macOS app download for this fork yet. Use a source checkout for local
testing:

```bash
npm ci
npm run rebuild
npm start
```

Use Node 24 LTS or another supported Node in the `>=22.12 <25` range. Node 25/26 can install
some packages, but native Electron modules are more likely to fail or produce misleading
results.

Without the DK-QUAKE connected, the editor still opens so you can inspect pages, tiles, and
settings. With the device connected, plug in both the USB HID connection and the display cable,
then launch the app. Config is stored in `~/Library/Application Support/open-quake`.

Push-to-talk records microphone audio only while held and sends the clip to your configured
Open WebUI transcription endpoint. macOS will ask for microphone permission when the chat page
first records audio. If media keys or global input controls are enabled, macOS may also ask for
Accessibility permission.

For deeper build notes and architecture details, see [Building & how it works](docs/building.md).

## Licensing

Split-licensed — see **[NOTICE](NOTICE)**:

- **MIT** ([LICENSE](LICENSE)) — the launcher and editor (`app/`), original work.
- **PolyForm Noncommercial 1.0.0** ([src/LICENSE](src/LICENSE)) — every file that
  embeds the reverse-engineered protocol: the driver (`src/Aris68Connector.js`),
  the protocol notes (`docs/DEVICE_PROTOCOL.md`), and the two `tools/` scripts.
  The vendor described the comm protocol as restricted for commercial use; these
  files are **non-commercial only** unless you obtain written commercial
  permission from the protocol holders.

No vendor code, binaries, or API keys are included in this repository.

## Acknowledgements

This fork builds on the original
[TeeJS/open-quake](https://github.com/TeeJS/open-quake) project. Credit and
thanks go to **TeeJS** and the upstream contributors for the initial application,
device research, documentation, and DK-QUAKE / ARIS-68 support that made this
hardening work possible.

## Safety

`Aris68Connector.js` knows the firmware-download (DFU) command but never sends
it. **Do not call `enterDfu()`** — it puts the device into firmware-flash mode
and can brick it. The write-test in `tools/` only issues read-only query frames.
