// Clipboard history is always OFF at launch. Items never reach disk or the network.
// Background observation is only allowed after explicit consent in the running session.
/** @typedef {{id:number,text:string,at:number}} ClipItem */
export class ClipboardHistory {
  /** @type {ClipItem[]} */ items=[];
  enabled=false;
  /** @type {string|null} */ last=null;
  nextId=1;
  maxItems=25;
  maxLength=2048;
  enable(){this.enabled=true;this.last=null;}
  disable(){this.enabled=false;this.last=null;}
  clear(){this.items=[];this.last=null;}
  /** @param {unknown} input @param {number} [now] */
  accept(input,now=Date.now()){
    if(!this.enabled || typeof input!=='string')return false;
    if(this.last===null){this.last=input;return false;} // Do not retain clipboard from before opt-in.
    if(this.last===input)return false;
    this.last=input;
    const text=input.trim();
    if(!text || text.length>this.maxLength || looksSensitive(text))return false;
    this.items=this.items.filter(item=>item.text!==text);
    this.items.unshift({id:this.nextId++,text,at:Number.isFinite(now)?now:Date.now()});
    this.items.length=Math.min(this.items.length,this.maxItems);
    return true;
  }
}
/** Heuristic only. Never promise that all passwords, tokens or private text are detected.
 * @param {string} value */
export function looksSensitive(value){
  return /-----BEGIN (?:.* )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|authorization|password|passwd|secret)\s*[:=]\s*\S+|(?:sk-[A-Za-z0-9_-]{16,})|(?:gh[opusr]_[A-Za-z0-9]{20,})/i.test(value);
}
