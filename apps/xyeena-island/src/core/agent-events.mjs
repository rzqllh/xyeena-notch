// A future-facing protocol boundary only. NOT connected to agent hooks or permission execution.
// Deliberately drop prompts, file contents, tokens, tool arguments and unknown event fields.
export const EVENT_KINDS=Object.freeze(['session.started','session.updated','session.completed','permission.requested','permission.resolved']);
const PROVIDERS=new Set(['xyeena','claude-code','codex','gemini-cli','copilot-cli','cursor','antigravity','opencode','amp','hermes','other']);
/** @param {unknown} value @param {number} max @returns {string} */
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
/** @param {unknown} x @returns {x is Record<string, unknown>} */
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
/** @param {unknown} raw @returns {null|{kind:string,provider:string,sessionId:string,requestId:string,status:string,timestamp:number}} */
export function normalizeAgentEvent(raw){
 if(!isRecord(raw))return null;
 const kind=clean(raw.kind,64),provider=clean(raw.provider,50),sessionId=clean(raw.sessionId,128);
 if(!EVENT_KINDS.includes(kind)||!PROVIDERS.has(provider)||!sessionId)return null;
 const requestId=clean(raw.requestId,128);
 if(kind.startsWith('permission.')&&!requestId)return null;
 const status=clean(raw.status,32);
 const timestamp=Number(raw.timestamp);
 if(!Number.isSafeInteger(timestamp)||timestamp<0)return null;
 return Object.freeze({kind,provider,sessionId,requestId,status,timestamp});
}
/**
 * Consent can only be forwarded when the UI action explicitly references the
 * exact session + request, and the request is neither stale nor expired.
 * This is validation, NOT a permission decision or acknowledgement.
 * @param {unknown} waiting @param {unknown} action @param {number} now
 */
export function mayForwardDecision(waiting,action,now=Date.now()){
 if(!isRecord(waiting)||!isRecord(action)||!Number.isSafeInteger(now))return false;
 return waiting.status==='pending'
  && typeof waiting.sessionId==='string'&&waiting.sessionId.length>0
  && typeof waiting.requestId==='string'&&waiting.requestId.length>0
  && waiting.sessionId===action.sessionId&&waiting.requestId===action.requestId
  && waiting.provider===action.provider
  && typeof waiting.expiresAt==='number'&&Number.isSafeInteger(waiting.expiresAt)&&now<waiting.expiresAt
  && (action.decision==='deny'||action.decision==='allow')
  && action.explicitUserAction===true;
}
