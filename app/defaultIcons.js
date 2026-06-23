'use strict';

const LEGACY_DEFAULT_ICONS = {
  Spotify: '🎵',
  'YT Music': '📺',
  'Apple Music': '🍎',
  Tidal: '🌊',
};

function matchingDefault(tile, defaults, requireIconUrl = false) {
  if (!Array.isArray(defaults) || !tile) return null;
  return defaults.find(d =>
    d && d.iconAutoSeed === true && d.iconType === 'url' && d.iconUrl &&
    d.label === tile.label && d.type === tile.type && d.value === tile.value &&
    (!requireIconUrl || d.iconUrl === tile.iconUrl)
  ) || null;
}

function maybeApplyDefaultIconMetadata(tile, defaults) {
  if (!tile || tile.cover != null || tile.iconCache || tile.iconUrl || tile.iconImage) return false;
  if (tile.iconAutoSeed === true || (tile.iconType && tile.iconType !== 'emoji')) return false;
  const def = matchingDefault(tile, defaults);
  if (!def) return false;
  const legacyIcon = LEGACY_DEFAULT_ICONS[tile.label];
  if (tile.icon && tile.icon !== def.icon && tile.icon !== legacyIcon) return false;
  tile.icon = def.icon || tile.icon || '';
  tile.iconType = def.iconType;
  tile.iconUrl = def.iconUrl;
  tile.iconAutoSeed = true;
  return true;
}

async function seedDefaultIconCachesInGrid(grid, fetchIconToCache, options = {}) {
  if (!grid || !Array.isArray(grid.tiles) || typeof fetchIconToCache !== 'function') return false;
  const log = typeof options.log === 'function' ? options.log : () => {};
  const defaults = options.defaults;
  let changed = false;

  for (const tile of grid.tiles) {
    if (!tile || tile.cover != null) continue;
    if (maybeApplyDefaultIconMetadata(tile, defaults)) changed = true;
    if (tile.iconType !== 'url' || tile.iconAutoSeed !== true || !tile.iconUrl || tile.iconCache) continue;
    if (!matchingDefault(tile, defaults, true)) continue;

    let result;
    try { result = await fetchIconToCache(tile.iconUrl); }
    catch (e) { result = { ok: false, error: e && e.message }; }

    if (result && result.ok && result.cachePath) {
      tile.iconCache = result.cachePath;
      tile.iconAutoSeed = false;
      changed = true;
    } else {
      log('default icon seed failed: ' + (tile.label || tile.iconUrl) + (result && result.error ? ' (' + result.error + ')' : ''));
    }
  }

  return changed;
}

module.exports = { seedDefaultIconCachesInGrid };
