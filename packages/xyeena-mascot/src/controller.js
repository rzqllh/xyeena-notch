import { isState, stateForEvent } from './states.js';
import { pickMascotState } from './events.js';

/** A small, deterministic domain controller. No polling, network, timers or UI coupling. */
export class GuardianController {
  constructor({clock=()=>Date.now()}={}) {
    this._clock=clock;this._tasks=new Map();this._listeners=new Set();
    this._transient=null;this.state='idle';
  }
  get tasks(){return [...this._tasks.values()].map(item=>({...item}));}
  subscribe(listener){
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    this._listeners.add(listener);listener(this.state,this.tasks);
    return ()=>this._listeners.delete(listener);
  }
  setTask(id,status,detail=''){
    if(typeof id!=='string'||!id.trim())throw new TypeError('id must be non-empty');
    this._tasks.set(id,{id,status:stateForEvent(status),detail});this._refresh();
  }
  removeTask(id){this._tasks.delete(id);this._refresh();}
  /** Transients are local gestures and never override blocking approval / errors. */
  emote(name,ttlMs=1800){
    if(!isState(name))throw new RangeError('Unknown emote');
    if(!Number.isFinite(ttlMs)||ttlMs<0)throw new RangeError('ttlMs must be non-negative');
    this._transient={name,expires:this._clock()+ttlMs};this._refresh();
  }
  tick(){this._refresh();}
  reset(){this._tasks.clear();this._transient=null;this._refresh();}
  _refresh(){
    if(this._transient&&this._clock()>=this._transient.expires)this._transient=null;
    const active=pickMascotState(this.tasks);
    const blocking=['approval','question','error','rate_limit'].includes(active);
    const next=blocking?active:(this._transient?.name??active);
    if(next!==this.state){this.state=next;for(const listener of this._listeners)listener(next,this.tasks);}
  }
}
