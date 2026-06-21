#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, 'native', 'macos', 'open-quake-media-key.m');
const outDir = path.join(root, 'app', 'native');
const output = path.join(outDir, 'open-quake-media-key');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

if (process.platform !== 'darwin') {
  console.log('macOS media-key helper build skipped on non-macOS host.');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

run('xcrun', [
  'clang',
  '-fobjc-arc',
  '-mmacosx-version-min=12.0',
  source,
  '-framework', 'AppKit',
  '-framework', 'CoreGraphics',
  '-framework', 'IOKit',
  '-o', output,
]);

fs.chmodSync(output, 0o755);

try {
  run('codesign', ['--force', '--sign', '-', output]);
} catch (e) {
  console.warn(`macOS media-key helper ad-hoc signing skipped: ${e.message}`);
}

console.log(`Built macOS media-key helper: ${path.relative(root, output)}`);
