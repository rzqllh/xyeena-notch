/** @typedef {{available:boolean,title:string,artist:string,source:string,playing:boolean,positionMs:number,durationMs:number,canSeek:boolean}} Media */
/** @param {unknown} raw @returns {Media} */
export function normalizeMedia(raw){
 const v=/** @type {Record<string,unknown>} */(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{});
 /** @param {unknown} value @param {number} n */
 const clean=(value,n)=>typeof value==='string'?value.slice(0,n):'';
 const durationMs=safeDuration(v.durationMs),positionMs=Math.min(safeDuration(v.positionMs),durationMs);
 return {available:v.available===true,title:clean(v.title,128),artist:clean(v.artist,96),source:clean(v.source,128),playing:v.playing===true,
  positionMs,durationMs,canSeek:v.canSeek===true&&durationMs>0};
}
/** @param {unknown} n */
export function safeDuration(n){return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=24*60*60*1000?n:0;}
/** @param {number} ms */
export function timeLabel(ms){const total=Math.max(0,Math.floor(ms/1000));return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');}
export const EMPTY_MEDIA=Object.freeze(normalizeMedia(null));
