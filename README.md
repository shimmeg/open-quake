# open-quake

An open driver and touchscreen launcher for the **DK-QUAKE / ARIS-68** — the
1920×480 touchscreen-plus-knob macro device (sold with the closed-source
DK-Suite app). `open-quake` talks to it directly over HID, with no vendor
software running.

![open-quake on the DK-QUAKE](docs/showcase.png)

*From top: the grid launcher · a merged-tile Media grid · the flip-clock app · a [Windy](https://www.windy.com) weather map and a [Home Assistant](https://www.home-assistant.io) dashboard — each with the knob's RGB ring lit a different color.*

### **[⬇ Download for macOS](https://github.com/TeeJS/open-quake/releases/)** &nbsp;·&nbsp; or [build from source](docs/building.md)

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

> **Status:** early but capable. Touch, knob (incl. RGB ring + hold-to-talk), grids, merged
> buttons, web dashboards, the bundled apps (clock / music / system monitor / AI chat), the
> on-board mic, and the editor are working and validated against real hardware. The panel is
> driven as a normal external monitor (macOS sees a 480×1920 / 1920×480 display); pushing
> frames over the HID resource channel is not implemented.

## 📖 Documentation

Detailed guides live in **[docs/](docs/README.md)**:

- [The editor](docs/editor.md) · [Web dashboards](docs/dashboards.md) · [Bundled apps](docs/apps.md)
- [Music controller](docs/music.md) · [System monitor](docs/system-monitor.md) · [Open WebUI chat + voice](docs/ai-chat.md)
- [Settings & knob lighting](docs/settings.md) · [Building & how it works](docs/building.md) · [Device protocol](docs/DEVICE_PROTOCOL.md)

## Download

Grab a build from the **[Releases](https://github.com/TeeJS/open-quake/releases)** page (macOS):
- **`open-quake-<version>-<arch>.dmg`** — drag the app to Applications.
- **`open-quake-<version>-<arch>.zip`** — unpack and run the app directly.

Release artifacts should be signed and notarized before public distribution. Local developer
builds can be unsigned; macOS Gatekeeper may require right-click → **Open** the first time. Plug
in the DK-QUAKE display/USB, then launch. Config is stored in
`~/Library/Application Support/open-quake`. Push-to-talk uses the microphone only while held and
macOS will ask for microphone permission when the chat page first records audio. If media keys or
global input controls are enabled, macOS may also ask for Accessibility permission.

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

## Safety

`Aris68Connector.js` knows the firmware-download (DFU) command but never sends
it. **Do not call `enterDfu()`** — it puts the device into firmware-flash mode
and can brick it. The write-test in `tools/` only issues read-only query frames.
