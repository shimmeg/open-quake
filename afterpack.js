'use strict';
/*
 * afterPack.js — electron-builder afterPack hook. Signs bundled helper exe(s) that the normal Windows
 * `sign` hook never sees (it only signs electron-builder's own artifacts: the app exe, portable, NSIS,
 * uninstaller, elevate). Reuses sign.js's Azure Trusted Signing logic verbatim. Runs after the app dir
 * is packed into win-unpacked, so the *signed* helper is what gets wrapped into the portable + installer.
 */
const path = require('path');
const fs = require('fs');
const sign = require('./sign');

exports.default = async function (context) {
  const dir = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'app', 'native');
  let exes = [];
  try { exes = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.exe')); } catch (e) {}
  if (!exes.length) { console.log('  • afterPack: no bundled helper exe to sign'); return; }
  for (const f of exes) {
    const file = path.join(dir, f);
    console.log('  • afterPack: signing bundled helper →', file);
    await sign.default({ path: file });   // same Trusted Signing path as the main artifacts
  }
};
