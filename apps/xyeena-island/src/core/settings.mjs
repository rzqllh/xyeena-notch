/** @typedef {{
 *   pinned: boolean,
 *   alwaysOnTop: boolean,
 *   autoCollapse: boolean,
 *   autoHide: boolean,
 *   motion: 'system' | 'reduced',
 *   theme: 'system' | 'dark' | 'light',
 *   notifyRunChanges: boolean,
 *   showMedia: boolean,
 *   language: 'en' | 'id',
 *   gazeEnabled: boolean,
 *   soundEnabled: boolean,
 *   soundVolume: number,
 *   wardrobe: 'standard' | 'visor' | 'crown' | 'headset' | 'shield',
 *   clipboardLimit: number,
 *   clipboardPersistent: boolean,
 *   recapEnabled: boolean,
 *   preferredMedia: string
 * }} IslandSettings */

/** @type {Readonly<IslandSettings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  pinned: false,
  alwaysOnTop: true,
  autoCollapse: true,
  autoHide: true,
  motion: 'system',
  theme: 'dark',
  notifyRunChanges: false,
  showMedia: true,
  language: 'id',
  gazeEnabled: true,
  soundEnabled: true,
  soundVolume: 70,
  wardrobe: 'standard',
  clipboardLimit: 50,
  clipboardPersistent: false,
  recapEnabled: true,
  preferredMedia: 'auto'
});

export const STORAGE_KEY = 'xyeena-island-preferences-v1';

/** @param {unknown} value @returns {IslandSettings} */
export function sanitizeSettings(value) {
  const obj = /** @type {Record<string, unknown>} */ (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  const wardrobeValues = ['standard', 'visor', 'crown', 'headset', 'shield'];
  const prefMediaValues = ['auto', 'Spotify', 'Chrome'];
  return {
    pinned: typeof obj.pinned === 'boolean' ? obj.pinned : DEFAULT_SETTINGS.pinned,
    alwaysOnTop: typeof obj.alwaysOnTop === 'boolean' ? obj.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
    autoCollapse: typeof obj.autoCollapse === 'boolean' ? obj.autoCollapse : DEFAULT_SETTINGS.autoCollapse,
    autoHide: typeof obj.autoHide === 'boolean' ? obj.autoHide : DEFAULT_SETTINGS.autoHide,
    motion: obj.motion === 'reduced' ? 'reduced' : 'system',
    theme: obj.theme === 'dark' || obj.theme === 'light' || obj.theme === 'system' ? obj.theme : DEFAULT_SETTINGS.theme,
    notifyRunChanges: typeof obj.notifyRunChanges === 'boolean' ? obj.notifyRunChanges : DEFAULT_SETTINGS.notifyRunChanges,
    showMedia: typeof obj.showMedia === 'boolean' ? obj.showMedia : DEFAULT_SETTINGS.showMedia,
    language: obj.language === 'id' || obj.language === 'en' ? obj.language : DEFAULT_SETTINGS.language,
    gazeEnabled: typeof obj.gazeEnabled === 'boolean' ? obj.gazeEnabled : DEFAULT_SETTINGS.gazeEnabled,
    soundEnabled: typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    soundVolume: typeof obj.soundVolume === 'number' && Number.isFinite(obj.soundVolume) && obj.soundVolume >= 0 && obj.soundVolume <= 100 ? Math.round(obj.soundVolume) : DEFAULT_SETTINGS.soundVolume,
    wardrobe: wardrobeValues.includes(/** @type {string} */ (obj.wardrobe)) ? /** @type {'standard'|'visor'|'crown'|'headset'|'shield'} */ (obj.wardrobe) : DEFAULT_SETTINGS.wardrobe,
    clipboardLimit: typeof obj.clipboardLimit === 'number' && [20, 50, 100].includes(obj.clipboardLimit) ? obj.clipboardLimit : DEFAULT_SETTINGS.clipboardLimit,
    clipboardPersistent: typeof obj.clipboardPersistent === 'boolean' ? obj.clipboardPersistent : DEFAULT_SETTINGS.clipboardPersistent,
    recapEnabled: typeof obj.recapEnabled === 'boolean' ? obj.recapEnabled : DEFAULT_SETTINGS.recapEnabled,
    preferredMedia: prefMediaValues.includes(/** @type {string} */ (obj.preferredMedia)) ? /** @type {string} */ (obj.preferredMedia) : DEFAULT_SETTINGS.preferredMedia,
  };
}
