// In-memory notification feed. Initial refresh is never a notification. No history persisted.
const IMPORTANT=new Set(['REVIEW','RELEASE','CLOSE','DEBUG']);
/** @param {unknown} value @param {number} n */
const safe=(value,n)=>String(value||'').slice(0,n);
export class RunChangeFeed{
 constructor(){
  /** @type {Map<string,string>|null} */ this.previous=null;
  /** @type {Array<{id:string,title:string,body:string,runId:string,state:string,timestamp:number}>} */ this.items=[];
 }
 reset(){this.previous=null;this.items=[];}
 /** Local visible activity confirmation; not a simulated run-state change. */
 recordTest(){
  const item={id:`test:${Date.now()}`,title:'Notification test',body:'Windows toast requested by you.',runId:'',state:'TEST',timestamp:Date.now()};
  this.items.unshift(item);this.items=this.items.slice(0,25);return item;
 }
 /**
  * Record real local events (media, clipboard, file drop, toasts)
  * @param {string} title
  * @param {string} body
  * @param {string} [category]
  */
 recordEvent(title,body,category='EVENT'){
  const item={id:`${category.toLowerCase()}:${Date.now()}`,title:safe(title,80),body:safe(body,140),runId:'',state:category,timestamp:Date.now()};
  this.items.unshift(item);this.items=this.items.slice(0,25);return item;
 }
 /** @param {Array<{runId:string,state:string,goal:string}>} runs */
 update(runs){
  if(!Array.isArray(runs))return [];
  const latest=new Map(runs.filter(r=>r?.runId).map(r=>[safe(r.runId,96),safe(r.state,24)]));
  const emitted=[];
  if(this.previous){for(const run of runs){
   const before=this.previous.get(run.runId);
   if(before&&before!==run.state&&IMPORTANT.has(run.state)){
    const item={id:`${run.runId}:${before}:${run.state}`,title:`Xyeena · ${run.state.toLowerCase()}`,body:safe(run.goal||run.runId,100),runId:run.runId,state:run.state,timestamp:Date.now()};
    emitted.push(item);this.items.unshift(item);
   }
  }}
  this.previous=latest;
  this.items=this.items.slice(0,12);
  return emitted;
 }
}
