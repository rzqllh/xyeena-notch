// Local manual meeting timer. Never claims that an app/meeting was auto-detected.
export const MEETING_KEY='xyeena-island-meeting-v1';
/** @param {unknown} value */
export function normalizeMeeting(value){
 const v=/** @type {Record<string,unknown>} */ (value && typeof value==='object'&&!Array.isArray(value)?value:{});
 return {active:v.active===true,startedAt:typeof v.startedAt==='number'&&Number.isSafeInteger(v.startedAt)&&v.startedAt>0?v.startedAt:0};
}
/** @param {number} startedAt @param {number} now */
export function elapsedMeeting(startedAt,now=Date.now()){
 const seconds=Math.max(0,Math.floor((now-startedAt)/1000));
 const hours=Math.floor(seconds/3600),mins=Math.floor(seconds%3600/60);
 return hours?`${hours}h ${String(mins).padStart(2,'0')}m`:`${mins}m`;
}
