'use strict';

const TRANSPORT_KEYS = Object.freeze({
  playpause: 'audio_play',
  next: 'audio_next',
  prev: 'audio_prev',
  stop: 'audio_stop',
});

function createMediaKeys({ robot, log = () => {} } = {}) {
  function keyTap(key) {
    if (!(robot && typeof robot.keyTap === 'function')) return false;
    try {
      robot.keyTap(key);
      return true;
    } catch (e) {
      log('media key backend failed: ' + e.message);
      return false;
    }
  }

  return {
    transport(command) {
      const key = TRANSPORT_KEYS[command];
      return key ? keyTap(key) : false;
    },
    volume(value) {
      if (value === 'mute') return keyTap('audio_mute');
      if (value > 0) return keyTap('audio_vol_up');
      if (value < 0) return keyTap('audio_vol_down');
      return false;
    },
  };
}

module.exports = { createMediaKeys };
