import {normalizeMedia,EMPTY_MEDIA} from './media.mjs';
/**
 * @param {unknown} value
 * @returns {{sessions:ReturnType<typeof normalizeMedia>[], currentSource:string}}
 */
export function normalizeSessions(value){
 const raw=/** @type {Record<string,unknown>} */ (value && typeof value==='object'&&!Array.isArray(value)?value:{});
 const source=typeof raw.currentSource==='string'?raw.currentSource.slice(0,128):'';
 const sessions=Array.isArray(raw.sessions)?raw.sessions.slice(0,16).map(normalizeMedia).filter(s=>s.available):[];
 return {sessions,currentSource:source};
}
/** @param {ReturnType<typeof normalizeSessions>} overview @param {string} requested */
export function pickSession(overview,requested=''){
 return overview.sessions.find(s=>s.source===requested)
  ||overview.sessions.find(s=>s.source===overview.currentSource)
  ||overview.sessions.find(s=>s.playing)
  ||overview.sessions[0]||EMPTY_MEDIA;
}
/** @param {string} source */
export function sourceLabel(source){
 const text=String(source||'').split(/[!\\/]/).pop()||String(source||'');
 return text.replace(/\.exe$/i,'').replace(/_/g,' ').slice(0,48)||'Unknown player';
}
