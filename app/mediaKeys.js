'use strict';

const path = require('path');
const nodeFs = require('fs');
const childProcess = require('child_process');

const TRANSPORT_KEYS = Object.freeze({
  playpause: 'audio_play',
  next: 'audio_next',
  prev: 'audio_prev',
});

const MAC_HELPER_COMMANDS = Object.freeze({
  playpause: 'playpause',
  next: 'next',
  prev: 'previous',
});

const HELPER_NAME = 'open-quake-media-key';

function unpackedAsarPath(file) {
  return file.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

function defaultHelperPath() {
  return unpackedAsarPath(path.join(__dirname, 'native', HELPER_NAME));
}

function defaultLoadRobot(log) {
  try {
    return require('robotjs');
  } catch (e) {
    log('robotjs unavailable (media-key fallback off): ' + e.message);
    return null;
  }
}

function createMediaKeys({
  robot,
  loadRobot,
  platform = process.platform,
  helperPath = defaultHelperPath(),
  fs = nodeFs,
  spawnSync = childProcess.spawnSync,
  log = () => {},
} = {}) {
  const hasInjectedRobot = Object.prototype.hasOwnProperty.call(arguments[0] || {}, 'robot');
  let robotBackend = robot;

  function getRobot() {
    if (hasInjectedRobot) return robotBackend;
    if (robotBackend !== undefined) return robotBackend;
    robotBackend = typeof loadRobot === 'function' ? loadRobot() : defaultLoadRobot(log);
    return robotBackend;
  }

  function runHelper(command) {
    if (platform !== 'darwin' || !command) return false;
    if (!helperPath || !(fs && typeof fs.existsSync === 'function' && fs.existsSync(helperPath))) return false;
    try {
      const result = spawnSync(helperPath, [command], {
        shell: false,
        stdio: 'ignore',
        timeout: 1000,
        windowsHide: true,
      });
      if (result && result.status === 0) return true;
      if (result && result.error) log('macOS media key helper failed: ' + result.error.message);
      else log('macOS media key helper exited with status ' + (result && result.status));
      return false;
    } catch (e) {
      log('macOS media key helper failed: ' + e.message);
      return false;
    }
  }

  function keyTap(key) {
    const backend = getRobot();
    if (!(backend && typeof backend.keyTap === 'function')) return false;
    try {
      backend.keyTap(key);
      return true;
    } catch (e) {
      log('robotjs media key fallback failed: ' + e.message);
      return false;
    }
  }

  return {
    transport(command) {
      if (runHelper(MAC_HELPER_COMMANDS[command])) return true;
      const key = TRANSPORT_KEYS[command];
      return key ? keyTap(key) : false;
    },
    volume(value) {
      if (value === 'mute' && runHelper('mute')) return true;
      if (value > 0 && runHelper('volume-up')) return true;
      if (value < 0 && runHelper('volume-down')) return true;
      if (value === 'mute') return keyTap('audio_mute');
      if (value > 0) return keyTap('audio_vol_up');
      if (value < 0) return keyTap('audio_vol_down');
      return false;
    },
  };
}

module.exports = { createMediaKeys };
