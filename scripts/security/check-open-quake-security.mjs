#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function fail(id, detail) {
  failures.push({ id, detail });
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function functionRanges(source) {
  const ranges = [];
  const re = /function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = re.exec(source))) {
    const openIndex = source.indexOf('{', match.index);
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex !== -1) {
      ranges.push({ name: match[1], start: match.index, end: closeIndex });
    }
  }
  return ranges;
}

function enclosingFunction(source, ranges, index) {
  return ranges.find((range) => range.start <= index && index <= range.end);
}

function assertNoPattern(rel, regex, id, message) {
  const source = read(rel);
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const globalRegex = new RegExp(regex.source, flags);
  let match;
  while ((match = globalRegex.exec(source))) {
    fail(id, `${rel}:${lineNumber(source, match.index)} ${message}`);
    if (match[0].length === 0) globalRegex.lastIndex++;
  }
}

function assertPattern(rel, regex, id, message) {
  const source = read(rel);
  if (!regex.test(source)) fail(id, `${rel}: ${message}`);
}

const main = read('app/main.js');
const mainFunctions = functionRanges(main);

assertNoPattern(
  'app/main.js',
  /\bnodeIntegration\s*:\s*true\b/,
  'no-node-integration',
  'BrowserWindow must not enable nodeIntegration',
);

assertNoPattern(
  'app/main.js',
  /\bcontextIsolation\s*:\s*false\b/,
  'context-isolation',
  'BrowserWindow must keep contextIsolation enabled',
);

assertNoPattern(
  'app/main.js',
  /setPermissionRequestHandler[\s\S]{0,400}\bcb\s*\(\s*true\s*\)/,
  'permission-allow-all',
  'permission handler must not unconditionally allow all requests',
);

const openExternalRe = /shell\.openExternal\s*\(/g;
let openExternalMatch;
while ((openExternalMatch = openExternalRe.exec(main))) {
  const fn = enclosingFunction(main, mainFunctions, openExternalMatch.index);
  if (!fn || !['openExternalUrl', 'openValidatedExternalUrl'].includes(fn.name)) {
    fail(
      'validated-open-external',
      `app/main.js:${lineNumber(main, openExternalMatch.index)} shell.openExternal must only be called inside the validated URL helper`,
    );
  }
}

for (const rel of ['app/ChatWidget.js', 'app/chatview.html']) {
  const source = read(rel);
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (
      /console\.(?:log|debug|info|warn|error)\s*\(/.test(line)
      && /\b(api[_-]?key|apiKey|authorization|bearer|key)\b/i.test(line)
    ) {
      fail('no-api-key-logging', `${rel}:${index + 1} renderer logging must not include API key material`);
    }
  });
}

const queryReaders = [
  ['app/chatview.html', /\bget\s*\(\s*['"]api_key['"]\s*\)/],
  ['app/ChatWidget.js', /\bget\s*\(\s*['"]api_key['"]\s*\)/],
];
for (const [rel, regex] of queryReaders) {
  assertNoPattern(rel, regex, 'no-api-key-query-read', 'Open WebUI API key must not be read from URL query parameters');
}

const chatWidget = read('app/ChatWidget.js');
if (!/\bfunction\s+sanitizeRenderedMarkdown\s*\(/.test(chatWidget)) {
  fail('markdown-sanitizer', 'app/ChatWidget.js must sanitize marked output before HTML insertion');
}
if (!/sanitizeRenderedMarkdown\s*\(\s*k\.parse\s*\(/.test(chatWidget)) {
  fail('markdown-sanitizer', 'app/ChatWidget.js must pass marked output through sanitizeRenderedMarkdown()');
}
if (!/\.startsWith\s*\(\s*['"]on['"]\s*\)/.test(chatWidget)) {
  fail('markdown-sanitizer-events', 'app/ChatWidget.js sanitizer must remove event-handler attributes');
}
if (!/OQ_MARKDOWN_URL_PROTOCOLS/.test(chatWidget) || !/javascript:/i.test(chatWidget)) {
  fail('markdown-sanitizer-urls', 'app/ChatWidget.js sanitizer must enforce a URL protocol allowlist that excludes javascript: URLs');
}

for (const rel of ['app/index.html', 'app/config.html', 'app/chatview.html', 'app/sysview.html', 'app/musicview.html', 'apps/clock.html']) {
  assertPattern(
    rel,
    /<meta\s+http-equiv=["']Content-Security-Policy["']/i,
    'local-page-csp',
    'local app pages must declare a Content-Security-Policy meta tag',
  );
}

const sysserver = read('app/sysserver.js');
assertPattern(
  'app/sysserver.js',
  /Content-Security-Policy/,
  'local-server-csp',
  'localhost app server responses must include a Content-Security-Policy header',
);

const appPageUrl = mainFunctions.find((fn) => fn.name === 'appPageUrl');
if (!appPageUrl) {
  fail('no-secret-query-builder', 'app/main.js must keep appPageUrl explicit enough for secret URL checks');
} else {
  const source = main.slice(appPageUrl.start, appPageUrl.end + 1);
  const safeCalls = source.match(/appOptionQuery\s*\(\s*def\s*,\s*opts\s*,\s*o\s*=>\s*o\.type\s*!==\s*['"]secret['"]\s*\)/g) || [];
  if (safeCalls.length < 2) {
    fail('no-secret-query-builder', `app/main.js:${lineNumber(main, appPageUrl.start)} appPageUrl must exclude secret app options from served query strings and file URL hashes`);
  }
  if (/appOptionQuery\s*\(\s*def\s*,\s*opts\s*\)/.test(source)) {
    fail('no-secret-query-builder', `app/main.js:${lineNumber(main, appPageUrl.start)} appPageUrl must not serialize app options without a secret-exclusion filter`);
  }
}

if (!/server\.listen\s*\(\s*0\s*,\s*['"]127\.0\.0\.1['"]/.test(sysserver)) {
  fail('sysserver-loopback', 'app/sysserver.js must keep sysserver.listen bound to 127.0.0.1');
}

// --- Tier 1 hardening regression guards (XSS / CSRF / IPC sender validation) ---

// Panel renderer must build tiles via DOM/textContent, never interpolate config-controlled
// label/icon into innerHTML (stored-XSS -> openQuakePanel.launch() command-execution vector).
// (The panel script lives in the extracted app/index.js since the CSP hardening.)
const indexJs = read('app/index.js');
if (/innerHTML[^\n;]*\$\{[^}]*\bt\.(label|icon)\b/.test(indexJs)) {
  fail('panel-tile-xss', 'app/index.js must not interpolate tile label/icon into innerHTML');
}
if (!/\.textContent\s*=\s*t\.label/.test(indexJs)) {
  fail('panel-tile-xss', 'app/index.js must render the tile label via textContent');
}

// Served Music grid must escape config-controlled icon fields before HTML insertion.
const musicJs = read('app/musicview.js');
if (!/esc\(t\.iconSrc\)/.test(musicJs) || !/esc\(t\.icon\b/.test(musicJs)) {
  fail('music-tile-xss', 'app/musicview.js must escape t.iconSrc / t.icon before HTML insertion');
}

// Localhost server must reject a foreign Host (DNS rebinding) on every route and require a
// same-origin request for the side-effecting / data / secret routes (CSRF guard).
if (!/function hostOk\s*\(/.test(sysserver) || !/if \(!hostOk\(req\)\)/.test(sysserver)) {
  fail('sysserver-host-guard', 'app/sysserver.js must reject requests whose Host is not the loopback origin');
}
if (!/sec-fetch-site/.test(sysserver) || !/if \(!sameOrigin\(req\)\)/.test(sysserver)) {
  fail('sysserver-csrf-guard', 'app/sysserver.js must require a same-origin request for side-effecting/secret routes');
}
if (/if \(!origin\)\s*return true/.test(sysserver)) {
  fail('sysserver-csrf-guard', 'app/sysserver.js sameOrigin() must fail closed when both Origin and Sec-Fetch-Site are absent');
}

// Privileged IPC channels must validate the sender window (panel vs editor) before acting.
if (!/function isFrom\s*\(/.test(main)) {
  fail('ipc-sender-validation', 'app/main.js must define an isFrom() sender check');
}
for (const ch of ['launch', 'saveConfigFromEditor', 'getConfig', 'fetchIconUrl']) {
  const re = new RegExp(`ipcMain\\.(?:on|handle)\\('${ch}'[\\s\\S]{0,160}?isFrom\\(`);
  if (!re.test(main)) fail('ipc-sender-validation', `app/main.js ipc '${ch}' handler must validate the sender via isFrom()`);
}

// --- CSP: every page runs under a strict script-src 'self' with no inline <script> ---
// Inline scripts were extracted to external files so 'unsafe-inline' could be dropped from script-src
// (the defense-in-depth layer behind the renderer-side escaping). These guards keep it that way.
const inlineScriptRe = /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i;   // a <script> with no src= and a non-whitespace body
for (const rel of ['app/index.html', 'app/config.html', 'app/chatview.html', 'app/sysview.html', 'app/musicview.html', 'apps/clock.html']) {
  const src = read(rel);
  const scriptSrc = (src.match(/script-src[^;"]*/) || [''])[0];
  if (/'unsafe-inline'/.test(scriptSrc)) {
    fail('csp-script-unsafe-inline', `${rel}: CSP script-src must not allow 'unsafe-inline'`);
  }
  if (inlineScriptRe.test(src)) {
    fail('csp-inline-script', `${rel}: inline <script> body found — extract it to an external file (script-src is 'self')`);
  }
}
const serverScriptSrc = (sysserver.match(/script-src[^"]*/) || [''])[0];
if (/'unsafe-inline'/.test(serverScriptSrc)) {
  fail('csp-server-script-unsafe-inline', "app/sysserver.js LOCAL_APP_CSP script-src must not allow 'unsafe-inline'");
}

if (failures.length) {
  console.error(`Security baseline failed: ${failures.length} issue(s)`);
  for (const failure of failures) {
    console.error(`- [${failure.id}] ${failure.detail}`);
  }
  process.exit(1);
}

console.log('Security baseline passed.');
