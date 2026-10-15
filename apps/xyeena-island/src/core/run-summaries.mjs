// Defensive presentation model for the opt-in read-only native snapshot summaries.
const states=new Set(['TRIAGE','DISCOVER','DEFINE','PLAN','EXECUTE','VERIFY','REVIEW','RELEASE','CLOSE','DEBUG','DONE','SUCCESS','FINISHED']);
/** @typedef {{runId:string,goal:string,state:string,createdAt:string,finishedAt?:string}} PublicRun */
/** @param {unknown} value @returns {PublicRun[]} */
export function normalizeRuns(value) {
 if(!Array.isArray(value))return [];
 return value.slice(0,8).filter(x=>x&&typeof x==='object').map(x=>({
   runId:String(x.run_id||x.runId||'').slice(0,96),
   goal:String(x.goal||'Untitled run').slice(0,160),
   state:states.has(x.state)?x.state:'UNKNOWN',
   createdAt:String(x.created_at||x.createdAt||'').slice(0,48),
   finishedAt:(x.finished_at||x.finishedAt)?String(x.finished_at||x.finishedAt).slice(0,48):undefined,
 })).filter(x=>x.runId);
}
