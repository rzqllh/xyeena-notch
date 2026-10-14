// Xyeena Island motion. Spring/curve mathematics adapted from Coucou Windows
// src/core/anim.ts (MIT, Copyright 2026 Louis Raillé); see THIRD_PARTY_NOTICES.md.
// Animation is evaluated every requestAnimationFrame. Native IPC is coalesced;
// actual presentation rate depends on WebView2, system load, and native resizing.
export const MOTION_MS = 320; // legacy compatibility; closing uses CLOSE_MS.
export const CLOSE_MS = 340;
export const RESPONSE = 0.5;
export const DAMPING = 0.72;
/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** @param {number} t */
export const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a,b,t) => a + (b-a)*t;
/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
export function cubicBezier(x1,y1,x2,y2){
 /** @param {number} t */
 const cx=t=>((1-t)**2*3*t*x1)+(3*(1-t)*t*t*x2)+t**3;
 /** @param {number} t */
 const cy=t=>((1-t)**2*3*t*y1)+(3*(1-t)*t*t*y2)+t**3;
 /** @param {number} x */
 return x=>{
  let lo=0, hi=1, t=clamp(x,0,1);
  for(let i=0;i<12;i++){
   if(cx(t)<x)lo=t;else hi=t;
   t=(lo+hi)/2;
  }
  return cy(t);
 };
}
export const closeCurve=cubicBezier(0.45,0,0.2,1);
export class Spring {
 /** @param {number} value @param {number} response @param {number} damping */
 constructor(value,response=RESPONSE,damping=DAMPING){this.value=value;this.target=value;this.velocity=0;this.omega=0;this.zeta=0;this.configure(response,damping);}
 /** @param {number} response @param {number} damping */
 configure(response,damping){this.omega=2*Math.PI/response;this.zeta=damping;}
 /** @param {number} value */
 set(value){this.value=value;this.target=value;this.velocity=0;}
 get settled(){return Math.abs(this.target-this.value)<0.06&&Math.abs(this.velocity)<0.35;}
 /** @param {number} dt */
 step(dt){
  const steps=Math.max(1,Math.ceil(clamp(dt,0,0.08)/(1/240)));
  const h=clamp(dt,0,0.08)/steps;
  for(let i=0;i<steps;i++){
   const acceleration=this.omega**2*(this.target-this.value)-2*this.zeta*this.omega*this.velocity;
   this.velocity+=acceleration*h;this.value+=this.velocity*h;
  }
 }
}
export class Tracked {
 /** @param {number} value */
 constructor(value){this.spring=new Spring(value);/** @type {'idle'|'spring'|'curve'} */ this.mode='idle';this.from=value;this.to=value;this.start=0;this.duration=0;}
 get value(){return this.spring.value;}
 get animating(){return this.mode!=='idle';}
 /** @param {number} v */
 jump(v){this.spring.set(v);this.mode='idle';}
 /** @param {number} v */
 springTo(v){this.spring.configure(RESPONSE,DAMPING);this.spring.target=v;this.mode='spring';}
 /** @param {number} v @param {number} now @param {number} duration */
 curveTowards(v,now,duration=CLOSE_MS){this.from=this.value;this.to=v;this.start=now;this.duration=duration;this.spring.target=v;this.spring.velocity=0;this.mode='curve';}
 /** @param {number} dt @param {number} now */
 step(dt,now){
  if(this.mode==='spring'){
   this.spring.step(dt);
   if(this.spring.settled){this.spring.set(this.spring.target);this.mode='idle';}
  }else if(this.mode==='curve'){
   const t=clamp((now-this.start)/this.duration,0,1);
   this.spring.value=lerp(this.from,this.to,closeCurve(t));
   if(t>=1){this.spring.set(this.to);this.mode='idle';}
  }
 }
}
/** @typedef {{width:number,height:number}} Frame */
/** @param {Frame} f */
export const validFrame=f=>Number.isFinite(f.width)&&Number.isFinite(f.height)
 && f.width>=184&&f.width<=640&&f.height>=7&&f.height<=420;
/** @param {Frame} from @param {Frame} to @param {number} progress */
export function interpolateFrame(from,to,progress){const t=ease(progress);return {width:lerp(from.width,to.width,t),height:lerp(from.height,to.height,t)};}
export class GeometryMotion {
 /** @param {Frame} frame */
 constructor(frame){this.w=new Tracked(frame.width);this.h=new Tracked(frame.height);this.last=0;}
 get value(){return {width:this.w.value,height:this.h.value};}
 get animating(){return this.w.animating||this.h.animating;}
 /** @param {Frame} frame */
 jump(frame){this.w.jump(frame.width);this.h.jump(frame.height);this.last=0;}
 /** @param {Frame} frame @param {{closing?:boolean,reduced?:boolean,now?:number}} options */
 target(frame,{closing=false,reduced=false,now=0}={}){
  if(reduced){this.jump(frame);return;}
  if(closing){this.w.curveTowards(frame.width,now);this.h.curveTowards(frame.height,now);}
  else{this.w.springTo(frame.width);this.h.springTo(frame.height);}
 }
 /** @param {number} now */
 step(now){const dt=this.last?Math.max(0,(now-this.last)/1000):1/60;this.last=now;this.w.step(dt,now);this.h.step(dt,now);return this.value;}
}
