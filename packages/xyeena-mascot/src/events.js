import { stateForEvent } from './states.js';
/** Priority is for UI attention, not permission to run actions. */
const priority = Object.freeze({approval:100,question:95,error:90,rate_limit:80,upload:70,working:60,searching:58,thinking:56,finished:35,idle:0});
/** Resolves simultaneous tasks without letting a background success hide a blocking approval. */
export function pickMascotState(tasks=[]) {
  if(!Array.isArray(tasks)||tasks.length===0) return 'idle';
  let chosen='idle', maximum=-1;
  for(const task of tasks) {
    if(!task || typeof task!=='object')continue;
    const mapped=stateForEvent(task.status ?? task.state);
    const score=priority[mapped] ?? 10;
    if(score>maximum){chosen=mapped;maximum=score;}
  }
  return chosen;
}
/** Integration helper for existing agent transports. Adapter never performs network calls. */
export function connectAgentEvents(target, subscribe) {
  if(!target || typeof target.setState!=='function') throw new TypeError('target must implement setState');
  if(typeof subscribe!=='function') throw new TypeError('subscribe must be a function');
  const unsubscribe=subscribe(event=> {
    if(Array.isArray(event?.tasks))target.setState(pickMascotState(event.tasks));
    else target.setState(stateForEvent(typeof event==='string'?event:(event?.status ?? event?.state)));
  });
  return typeof unsubscribe==='function'?unsubscribe:()=>{};
}
