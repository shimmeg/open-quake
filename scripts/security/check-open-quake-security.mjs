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

assertNoPattern(
  'app/main.js',
  /return\s+encodeURIComponent\s*\(\s*o\.key\s*\)\s*\+\s*['"]=['"]\s*\+\s*encodeURIComponent\s*\(\s*v\s*\)/,
  'no-secret-query-builder',
  'app URL builder must not serialize every option, including secrets, into URLs',
);

const sysserver = read('app/sysserver.js');
if (!/server\.listen\s*\(\s*0\s*,\s*['"]127\.0\.0\.1['"]/.test(sysserver)) {
  fail('sysserver-loopback', 'app/sysserver.js must keep sysserver.listen bound to 127.0.0.1');
}

if (failures.length) {
  console.error(`Security baseline failed: ${failures.length} issue(s)`);
  for (const failure of failures) {
    console.error(`- [${failure.id}] ${failure.detail}`);
  }
  process.exit(1);
}

console.log('Security baseline passed.');
