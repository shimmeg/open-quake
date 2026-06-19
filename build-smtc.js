'use strict';
/*
 * build-smtc.js — compile native/smtc-art.cs -> app/native/smtc-art.exe with the .NET-Framework C#
 * compiler, referencing the Windows union metadata + the GAC facade contracts. [build tooling, MIT]
 *
 * Build/dev machine only (needs the Windows SDK winmd + .NET Framework, both already present for signing).
 * End users just run the prebuilt, bundled, signed exe — .NET Framework ships in Windows. Idempotent:
 * skips when the exe is already newer than the source. Wired into `npm start` and `npm run dist`.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'native', 'smtc-art.cs');
const OUT_DIR = path.join(ROOT, 'app', 'native');
const OUT = path.join(OUT_DIR, 'smtc-art.exe');
const log = m => console.log('[build:smtc] ' + m);
// Non-fatal: the album-art helper is best-effort. If we can't build it (missing toolchain, etc.) we warn
// and exit 0 so `npm start` / `npm run dist` proceed — a missing exe just means no cover art at runtime.
// (Release builds verify art on-device, so a genuinely missing helper is caught in testing.)
const bail = m => { console.warn('[build:smtc] ' + m + ' — skipping; album art will be unavailable.'); process.exit(0); };

if (!fs.existsSync(SRC)) bail('source missing: ' + SRC);
try { if (fs.existsSync(OUT) && fs.statSync(OUT).mtimeMs >= fs.statSync(SRC).mtimeMs) { log('up to date'); process.exit(0); } } catch (e) {}

const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
if (!fs.existsSync(csc)) bail('.NET-Framework csc not found: ' + csc);

function newestWinmd() {
  const base = 'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata';
  let dirs = [];
  try { dirs = fs.readdirSync(base).filter(d => /^\d+\./.test(d)).sort().reverse(); } catch (e) {}
  for (const d of dirs) { const p = path.join(base, d, 'Windows.winmd'); if (fs.existsSync(p)) return p; }
  return null;
}
function gacDll(name) {            // GAC_MSIL\<name>\<ver>__<token>\<name>.dll
  const base = path.join('C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL', name);
  let subs = [];
  try { subs = fs.readdirSync(base); } catch (e) {}
  for (const s of subs) { const p = path.join(base, s, name + '.dll'); if (fs.existsSync(p)) return p; }
  return null;
}

const winmd = newestWinmd();
if (!winmd) bail('Windows.winmd not found — install the Windows 10/11 SDK.');
const refs = [winmd];
for (const c of ['System.Runtime.WindowsRuntime', 'System.Runtime', 'System.Runtime.InteropServices.WindowsRuntime', 'System.ObjectModel', 'System.Threading.Tasks']) {
  const p = gacDll(c);
  if (!p) bail('GAC facade not found: ' + c);
  refs.push(p);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const args = ['/nologo', '/target:exe', '/platform:anycpu', '/out:' + OUT];
for (const r of refs) args.push('/reference:' + r);
args.push(SRC);
log('compiling -> ' + OUT);
try { execFileSync(csc, args, { stdio: 'inherit' }); } catch (e) { bail('compile failed'); }
log('built ' + (fs.existsSync(OUT) ? '(' + fs.statSync(OUT).size + ' bytes)' : '— but no exe?!'));
