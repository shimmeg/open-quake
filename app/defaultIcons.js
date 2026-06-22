'use strict';

async function seedDefaultIconCachesInGrid(grid, fetchIconToCache, options = {}) {
  if (!grid || !Array.isArray(grid.tiles) || typeof fetchIconToCache !== 'function') return false;
  const log = typeof options.log === 'function' ? options.log : () => {};
  let changed = false;

  for (const tile of grid.tiles) {
    if (!tile || tile.cover != null) continue;
    if (tile.iconType !== 'url' || tile.iconAutoSeed !== true || !tile.iconUrl || tile.iconCache) continue;

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
