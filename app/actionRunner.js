'use strict';

function hasPathSeparator(value) {
  return /[\\/]/.test(value);
}

function resolveAppPath(value, deps) {
  return new Promise(resolve => {
    if (!value || typeof value !== 'string') return resolve(null);
    if (hasPathSeparator(value)) return resolve(deps.fs.existsSync(value) ? value : null);
    deps.execFile('where', [value], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const first = (stdout || '').split(/\r?\n/).map(s => s.trim()).find(Boolean);
      resolve(first && deps.fs.existsSync(first) ? first : null);
    });
  });
}

async function launchApp(value, deps) {
  const resolved = await resolveAppPath(value, deps);
  if (!resolved) return false;
  if (hasPathSeparator(value)) {
    const error = await deps.shell.openPath(resolved);
    if (error && deps.log) deps.log(`openPath error: ${error}`);
    return !error;
  }
  const child = deps.spawn(resolved, [], { detached: true, stdio: 'ignore', windowsHide: true });
  if (child && typeof child.unref === 'function') child.unref();
  return true;
}

function runShellCommand(value, deps) {
  if (!value || typeof value !== 'string') return false;
  deps.exec(value, { windowsHide: true });
  return true;
}

function lockWorkstation(deps) {
  deps.execFile('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true }, () => {});
  return true;
}

module.exports = {
  hasPathSeparator,
  resolveAppPath,
  launchApp,
  runShellCommand,
  lockWorkstation,
};
