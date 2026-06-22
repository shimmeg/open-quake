# AGENTS.md

## Repository Identity

- This repository is `open-quake`, a security-hardening, macOS-focused fork of `TeeJS/open-quake`.
- Fork remote: `git@github.com:shimmeg/open-quake.git`.
- Upstream remote: `https://github.com/TeeJS/open-quake`.
- This is not DecoKeeAI. Do not port code, release notes, branding, or packaging assumptions from DecoKeeAI into this repo.

## Critical Safety Rules

- Never send DFU or firmware-flashing commands to a device.
- Never call `enterDfu()`.
- Never run `tools/writetest.js` unless the user explicitly authorizes it for that session.
- Do not run real-device smoke unless the user explicitly authorizes it.
- Do not run voice, microphone, push-to-talk, or transcription smoke unless the user separately and explicitly authorizes that scope.
- For device smoke, keep the scope to launch, panel placement, editor/config UI, safe touch input, and safe knob flows. Do not hold the knob unless push-to-talk smoke has been explicitly approved.

## License Boundary

- `app/` is primarily MIT-licensed launcher/editor code.
- `src/Aris68Connector.js`, `docs/DEVICE_PROTOCOL.md`, and `tools/*` are PolyForm Noncommercial.
- Keep protocol-derived implementation, probes, and write-test tooling inside the documented noncommercial boundary.
- Do not present protocol-derived files as MIT unless the license boundary has been explicitly changed by the project owner.

## Build And Verification

- Recommended release baseline: Node 24 LTS.
- Local install/rebuild/unsigned packaging may use Node versions in `>=22.12 <27`.
- Keep the project `.npmrc` pointed at Node release headers so user-level Electron header settings do not break `npm ci` under Node 26.
- Before commits that touch behavior, build, docs, or security checks, run the relevant verification:
  - `npm run security:baseline`
  - `npm test` (node:test unit suites; also runs as `npm run security:actions`)
  - `npm run security:macos`
  - `npm run security:docs`
  - `npm run rebuild`
- `npm run security:all` runs the baseline + tests + macOS + docs guards in one shot. CI (`.github/workflows/ci.yml`) runs the same guards on every push/PR across Node 22/24/26 (no dependency install or native build needed).
- For unsigned macOS packaging verification, run:
  - `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:dir`
- Run `npm run dist:mac` only when signing and notarization credentials are ready. Do not use it as a substitute for release signing setup.

## Runtime And Smoke Commands

- To launch without device-specific destructive actions:
  - `npm exec electron -- --remote-debugging-port=9228 --user-data-dir=/tmp/open-quake-smoke-userdata .`
- It is acceptable to inspect editor/config UI without device, voice, mic, or push-to-talk smoke.
- Device smoke with explicit approval may verify:
  - app launch with DK-QUAKE display and USB attached;
  - panel placement on the external display;
  - editor/config UI;
  - touch input;
  - knob double-click selector, rotate, and press flows.
- DFU, firmware, voice, mic, push-to-talk, and transcription checks are separate approval scopes.

## Release Readiness

- README must not promise a ready-to-install macOS download, DMG, ZIP, or release until such artifacts actually exist.
- Do not publish a release until device and voice smoke are green or explicitly waived by the project owner.
- Release preparation still requires:
  - release notes;
  - SHA256 checksums generated from final artifacts;
  - signed or annotated tag;
  - signing/notarization credentials for distributable macOS artifacts.

## Architecture Notes

- The DK-QUAKE panel is treated as a normal external display; USB HID handles touch, knob, mic state, lighting, and keep-alive.
- The panel window should occupy the full device display bounds and hide system/menu chrome.
- `app/mediaKeys.js` is the narrow media-key adapter. On macOS it should try the local `open-quake-media-key` helper first, then fall back to optional `robotjs` for unsupported or failed commands.
- Keep media-key behavior constrained to fixed transport and volume/mute commands. Generic macOS now-playing parity remains follow-up work; do not partially replace fallback behavior if it breaks launcher media controls.

## Git Practices

- Keep commits small and scoped.
- Before integration, check:
  - `git status --short --branch`
  - `git log -1 --oneline --decorate origin/main`
  - `git remote -v`
  - `git fetch --all --tags`
- Do not revert user changes unless the user explicitly asks.
- Prefer fast-forward or normal PR-style integration. Do not force-push or rewrite shared history unless explicitly requested.
