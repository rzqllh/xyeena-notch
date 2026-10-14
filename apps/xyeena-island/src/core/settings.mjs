/** @typedef {{pinned:boolean,alwaysOnTop:boolean,autoCollapse:boolean,autoHide:boolean,motion:'system'|'reduced',theme:'system'|'dark'|'light',notifyRunChanges:boolean,showMedia:boolean}} IslandSettings */
/** @type {Readonly<IslandSettings>} */
export const DEFAULT_SETTINGS=Object.freeze({
  pinned:false, alwaysOnTop:true, autoCollapse:true, autoHide:true, motion:'system', theme:'dark', notifyRunChanges:false, showMedia:true
});
export const STORAGE_KEY='xyeena-island-preferences-v1';
/** @param {unknown} value @returns {IslandSettings} */
export function sanitizeSettings(value) {
  const obj = /** @type {Record<string,unknown>} */ (value && typeof value==='object'&&!Array.isArray(value) ? value : {});
  return {
    pinned:typeof obj.pinned==='boolean'?obj.pinned:DEFAULT_SETTINGS.pinned,
    alwaysOnTop:typeof obj.alwaysOnTop==='boolean'?obj.alwaysOnTop:DEFAULT_SETTINGS.alwaysOnTop,
    autoCollapse:typeof obj.autoCollapse==='boolean'?obj.autoCollapse:DEFAULT_SETTINGS.autoCollapse,
    autoHide:typeof obj.autoHide==='boolean'?obj.autoHide:DEFAULT_SETTINGS.autoHide,
    motion:obj.motion==='reduced'?'reduced':'system',
    theme:obj.theme==='dark'||obj.theme==='light'||obj.theme==='system'?obj.theme:DEFAULT_SETTINGS.theme,
    notifyRunChanges:typeof obj.notifyRunChanges==='boolean'?obj.notifyRunChanges:DEFAULT_SETTINGS.notifyRunChanges,
    showMedia:typeof obj.showMedia==='boolean'?obj.showMedia:DEFAULT_SETTINGS.showMedia,
  };
}
