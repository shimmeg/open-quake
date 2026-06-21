# open-quake Hardening Notes

This fork is a security-hardening, macOS-focused fork of
[TeeJS/open-quake](https://github.com/TeeJS/open-quake). It is still a
source-run project; it does not publish ready-to-install macOS release
artifacts yet.

## Threat Model

The main trust boundary is between local user configuration, embedded web
content, and the Electron host process. open-quake intentionally controls a USB
HID device, launches local apps/URLs, displays user-configured dashboards, and
can record push-to-talk audio for a user-configured Open WebUI server. The app
should assume dashboard pages, chat responses, icon URLs, and local config
values may be hostile or malformed.

The current hardening priorities are:

- keep Electron renderers isolated from Node.js APIs;
- keep web-dashboard permissions denied unless explicitly allowed;
- keep external URL opening and local command execution behind narrow helpers;
- keep Open WebUI secrets out of page URLs and renderer logs;
- sanitize Markdown before inserting assistant content into the DOM;
- document release/signing status without implying published artifacts exist.

## Local Secrets

Configuration is stored locally under
`~/Library/Application Support/open-quake` on macOS. Dashboard tokens, Basic
Auth credentials, custom header values, Open WebUI endpoints, model IDs, and
Open WebUI API keys are local plaintext secrets. The app does not send them to
the developer, but it does send them to the dashboard or Open WebUI endpoint
the user configured.

Open WebUI API keys are served to the local chat page through the loopback
`/app-config` route instead of URL query parameters. They must not be logged,
stored in page URLs, or included in release notes and screenshots.

## Shell Command Macro Risk

The `cmd` tile type is an explicit advanced macro feature. It runs shell
commands chosen by the local user, so importing untrusted configs can execute
untrusted local commands. Treat shared configs as executable content.

Normal app launching should use the `app` tile type, which avoids shell
interpolation. Keep command execution centralized in `app/actionRunner.js` and
guarded by `npm run security:actions`.

## Native Input Surface

`app/mediaKeys.js` is the narrow media-key adapter for the Music page and knob
volume controls. On macOS it first tries the local `open-quake-media-key`
helper, which accepts only fixed media-key commands, then falls back to
optional `robotjs` for unsupported or failed commands. The rest of the main process only
asks for fixed media transport and volume/mute commands, and does not call
`robotjs` directly. The helper can be built and ad-hoc signed for local use
without an Apple Developer account; public release artifacts still need normal
Developer ID signing and notarization.

## Dashboard Permissions

Dashboard pages run in the `persist:dashboards` webview partition. Permission
requests are denied by default. Media permission is allowed only for the local
Open WebUI chat page or for origins explicitly listed in trusted media
settings. Custom dashboard auth headers are injected only for the configured
dashboard host.

External dashboard links should pass through the validated external URL helper
before opening in the host browser. Do not grant Node.js integration to
dashboard content.

## Markdown And Local Page CSP

Assistant responses are rendered as Markdown and inserted into an HTML sink in
the bundled Open WebUI widget. The fork sanitizes marked output before DOM
insertion, strips event-handler attributes, and blocks unsafe URL protocols.
Local app pages also declare a Content Security Policy, and the loopback app
server sends a CSP header. Inline scripts/styles are still allowed because the
current pages are written that way; tightening this further is a follow-up.

## Signing and Release Verification

There is no published macOS app download for this fork yet. Use source runs for
local testing:

```bash
npm ci
npm run rebuild
npm start
```

Unsigned local bundle checks should use:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:dir
```

Run `npm run dist:mac` only in a release environment with signing and
notarization credentials ready. Before publishing any release, prepare release
notes, SHA256 checksums, signed or annotated tags, and smoke-test evidence for
the editor/config UI plus any approved device and push-to-talk tests. Do not
publish release artifacts while hardening tasks or required smoke tests are not
green.

## License Boundary

This repository is split-licensed. The Electron launcher/editor under `app/`
is MIT-licensed, but the reverse-engineered protocol files are under
PolyForm Noncommercial 1.0.0:

- `src/Aris68Connector.js`
- `docs/DEVICE_PROTOCOL.md`
- `tools/*`

Do not treat those protocol files as a permissive commercial base, and do not
port them into another product without a separate license decision.
