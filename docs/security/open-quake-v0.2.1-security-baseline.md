# open-quake v0.2.1 Security Baseline

Date: 2026-06-19

This is the starting inventory for the security-hardening fork. It records the current local fork state and the upstream v0.2.1 audit anchor before remediation work.

## Git Baseline

- Local worktree: `/Users/anton/.codex/worktrees/d32c/open-quake`
- Current branch: `codex/security-hardening-open-quake`
- Current HEAD: `028a42eebb94e195e39498dcc28e347b430ac2cf` (`Open WebUI options: mark Model required, add API-key help`)
- Configured remote: `origin git@github.com:shimmeg/open-quake.git`
- Local `git fetch --all --tags`: succeeded.
- Local tag `v0.2.1`: not present after fetching configured remotes.
- Upstream tag check: `git ls-remote --tags https://github.com/TeeJS/open-quake.git v0.2.1` returned `b2688d92241759145ecbacc4a07471990453e39f`.
- Package version in `package.json`: `0.2.1`.
- Local HEAD is newer than the upstream release commit but still carries package version `0.2.1`.

## Runtime And Dependency Baseline

Local verification environment:

- Node.js: `v26.3.0`
- npm: `11.16.0`
- Project engine declares: `>=18 <25`, so local npm reports `EBADENGINE`.

Installed top-level package versions after `npm ci`:

- `electron@23.3.13`
- `electron-builder@24.13.3`
- `@electron/rebuild@3.7.2`
- `node-hid@3.3.0`
- `robotjs@0.6.0`
- `systeminformation@5.31.7`

Install result:

- `npm ci`: passed.
- Notable warnings: unsupported local Node version; deprecated build-stack packages; install scripts pending approval for `electron`, `node-hid`, and `robotjs`.

Audit results:

- `npm audit --json --registry=https://registry.npmjs.org`: failed with 10 high findings.
- Full audit high findings: `electron`, `electron-builder`, `@electron/rebuild`, `@electron/node-gyp`, `app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`, `make-fetch-happen`, `cacache`, `tar`.
- Electron audit range reports `electron <=39.8.4` vulnerable, with fix available at `electron@42.4.1`.
- Build stack fix suggestions include `electron-builder@26.15.3` and `@electron/rebuild@4.0.4`.
- `npm audit --omit=dev --json --registry=https://registry.npmjs.org`: passed with 0 vulnerabilities.

## BrowserWindow Profiles

`app/main.js` creates two application windows:

- Panel window in `placePanel()`:
  - `nodeIntegration: true`
  - `contextIsolation: false`
  - `webviewTag: true`
  - Loads `app/index.html`.
  - Security impact: panel renderer has Node/Electron access and embeds a dashboard `<webview>`.

- Config/editor window in `openConfigWindow()`:
  - `nodeIntegration: true`
  - `contextIsolation: false`
  - Loads `app/config.html`.
  - Security impact: editor renderer has Node/Electron access and sends config data directly over IPC.

The dashboard guest is a `<webview id="web" partition="persist:dashboards">` in `app/index.html`. The guest itself does not request Node integration, and the persistent partition keeps dashboard session state across runs.

## IPC Channels

Main process receives:

- `launch`: calls `runAction(a)`.
- `volume`: calls `robot.keyTap()` for media volume/mute if `robotjs` is available.
- `switchGrid`: switches active page.
- `toggleRotation`: toggles page rotation.
- `openConfig`: opens the editor window.
- `introDone`: persists intro dismissal.
- `openExternal`: allows URLs matching `^https?:` and calls `shell.openExternal(url)`.
- `saveConfigFromEditor`: replaces and persists the full config object.
- `setLighting`: persists and writes live lighting values to device via `Aris68Connector`.

Main process handles:

- `getConfig`: returns full config, including secrets.
- `getApps`: returns app definitions.
- `pickProgram`: opens a file picker for executable-like files.
- `pickImage`: opens a file picker for image files.
- `getAppIcon`: resolves program icons.
- `getLighting`: reads current device lighting.
- `saveLightingToDevice`: writes lighting settings to device flash.

Renderer usage:

- `app/index.html` uses `ipcRenderer` for panel events and dashboard external-link forwarding.
- `app/config.html` uses `ipcRenderer` and Node's `url.pathToFileURL`.

## Webview And Permission Surface

- `app/index.html` embeds arbitrary dashboard URLs from user config in an Electron `<webview>`.
- Dashboard links can be opened externally when `linksExternal` is enabled.
- `app/main.js` registers `dashSession.setPermissionRequestHandler((wc, permission, cb) => cb(true))`.
- Current permission behavior is unconditional allow for all guest permission requests in the persistent dashboard session.
- Dashboard auth injection:
  - Header auth: `webRequest.onBeforeSendHeaders` injects configured custom headers when dashboard host matches.
  - Basic auth: `app.on('login')` supplies configured credentials when dashboard host matches.
  - Home Assistant token: panel renderer seeds `hassTokens` into dashboard guest `localStorage`.

## Command Execution Paths

`app/main.js` imports `exec` from `child_process`.

Current command paths:

- `resolveAppPath(value)`:
  - For bare names, runs `exec(\`where "${value}"\`)`.
  - Risk: shell interpolation around user-controlled app values.

- `runAction(a)`:
  - `type: url`: calls `shell.openExternal(a.value)` directly.
  - `type: app`: runs `exec(\`start "" "${a.value}"\`)`.
  - `type: cmd`: runs `exec(a.value)`.
  - `type: open`: calls `shell.openPath(a.value)`.
  - `type: system`, `value: lock`: runs `exec('rundll32.exe user32.dll,LockWorkStation')`.
  - Risk: shell metacharacters in configured app/cmd values; URL path bypasses the IPC URL validation helper.

Other command paths:

- `app/sysmetrics.js`: uses `execFile` for `powershell.exe` and NVIDIA query helpers.
- `app/nowplaying.js`: uses `execFile('powershell.exe', ...)`.
- These use argument arrays rather than shell interpolation.

## Network Listeners And Outbound Requests

Local listeners:

- `app/sysserver.js` starts one HTTP server with `server.listen(0, '127.0.0.1', ...)`.
- Routes are GET-only and include `/`, `/music`, `/chat`, `/ChatWidget.js`, `/owui-widget.css`, `/metrics`, `/nowplaying`, `/musictiles`, `/media/<cmd>`, and `/launch?i=N`.
- Binding to `127.0.0.1` is a positive control and must be preserved.

Outbound or embedded network use:

- Dashboard `<webview>` loads user-configured dashboard URLs.
- Dashboard auth can inject headers or Basic credentials into matching dashboard hosts.
- Open WebUI chat app posts chat requests to the configured endpoint.
- Push-to-talk records audio while the knob is held and posts it to the configured Open WebUI transcription endpoint at `/api/v1/audio/transcriptions`.
- No OTA or auto-updater logic was found in the current app code.

## Secret Storage And Exposure

Secret storage:

- Runtime config path: `app.getPath('userData')/config.json`.
- Legacy config migration source: `app/config.json` if present in development.
- Bundled default: `app/config.default.json`.
- Dashboard tokens, custom header secrets, Basic auth credentials, and Open WebUI API keys are stored in plaintext config.

Current exposure paths:

- `appPageUrl(page)` serializes served app options into the loopback URL query string.
- The Open WebUI `api_key`, `endpoint`, and `model` are placed into `http://127.0.0.1:<port>/chat?...`.
- `app/chatview.html` reads the API key from `location.search` and uses it for transcription.
- `app/ChatWidget.js` reads `api_key` from `window.location.search` and logs processed query parameters, including API key state.
- `getConfig` exposes the complete config object, including secrets, to the privileged editor renderer.

## Markdown And HTML Rendering

- `app/ChatWidget.js` bundles `marked` and renders assistant Markdown into HTML sinks.
- No explicit DOMPurify or equivalent sanitizer was identified in the current code.
- `app/config.html`, `app/index.html`, and local app pages also use `innerHTML`; many values are escaped through local helpers, but Markdown output remains the high-risk path.

## Privacy Documentation Gap

`PRIVACY.md` currently says open-quake does not record or transmit audio. Current behavior contradicts that:

- Push-to-talk records microphone audio while the knob is held.
- The audio clip is sent to the user's configured Open WebUI transcription endpoint.
- Documentation must be updated before release readiness.

## License Boundary

This fork must preserve the existing license split:

- App code is primarily MIT.
- Driver/protocol materials are PolyForm Noncommercial, including `src/Aris68Connector.js`, `docs/DEVICE_PROTOCOL.md`, and `tools/*`.
- Do not treat the driver/protocol files as a free commercial base or port them into DecoKeeAI without a separate license decision.

## Initial Remediation Targets

- Add automated static security guard.
- Upgrade Electron/runtime build stack or document blockers.
- Remove privileged renderer settings.
- Restrict dashboard permissions and external navigation.
- Harden `runAction()` command execution.
- Remove Open WebUI secrets from URLs and renderer logs.
- Sanitize Markdown output and add CSP where practical.
- Update privacy/security documentation.
