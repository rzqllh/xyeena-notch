// Defensive presentation model for the opt-in read-only native snapshot summaries.
const states=new Set(['TRIAGE','DISCOVER','DEFINE','PLAN','EXECUTE','VERIFY','REVIEW','RELEASE','CLOSE','DEBUG']);
/** @typedef {{runId:string,goal:string,state:string,createdAt:string}} PublicRun */
/** @param {unknown} value @returns {PublicRun[]} */
export function normalizeRuns(value) {
 if(!Array.isArray(value))return [];
 return value.slice(0,8).filter(x=>x&&typeof x==='object').map(x=>({
   runId:String(x.run_id||'').slice(0,96),
   goal:String(x.goal||'Untitled run').slice(0,160),
   state:states.has(x.state)?x.state:'UNKNOWN',
   createdAt:String(x.created_at||'').slice(0,48),
 })).filter(x=>x.runId);
}
