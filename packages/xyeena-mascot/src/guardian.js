import { STATES, isState, isVariant } from './states.js';
import { mascotArt, eyeMarkup, badgeMarkup, accessoryMarkup } from './art.js';
import { greetingFrame, uploadFrame, clamp01 } from './motion.js';
import { guardianStyles } from './guardian-styles.js';
let sequence=0;
const tag='xyeena-guardian';
const raf=typeof requestAnimationFrame==='function'?requestAnimationFrame.bind(globalThis):()=>0;
const caf=typeof cancelAnimationFrame==='function'?cancelAnimationFrame.bind(globalThis):()=>{};

const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class XyeenaGuardian extends BaseElement {
  static get observedAttributes(){return ['state','variant','size','animated'];}
  constructor(){
    super();this._id=`xyg-${++sequence}`;this._raf=0;this._token=0;this._progress=0;this._sound=null;
    if(typeof this.attachShadow === 'function'){
      this.attachShadow({mode:'open'});
      this.shadowRoot.innerHTML=`<style>${guardianStyles}</style>${mascotArt(this._id)}`;
      this._eyes=this.shadowRoot.querySelector('[data-eyes]');
      this._badge=this.shadowRoot.querySelector('[data-badge]');
      this._accessory=this.shadowRoot.querySelector('[data-accessory]');
      this._svg=this.shadowRoot.querySelector('svg');
    }
    this._reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._onPointer=e=>{
      if(this._reduce||!this.hasAttribute('interactive'))return;
      const r=this.getBoundingClientRect();const dx=((e.clientX-r.left)/Math.max(1,r.width)-.5)*5;
      const dy=((e.clientY-r.top)/Math.max(1,r.height)-.5)*3;
      this.style.setProperty('--look-x',`${dx.toFixed(1)}px`);
      this.style.setProperty('--look-y',`${dy.toFixed(1)}px`);
    };
    this._onLeave=()=>{this.style.setProperty('--look-x','0px');this.style.setProperty('--look-y','0px');};
  }
  connectedCallback(){
    if(!this.hasAttribute('state'))this.setAttribute('state','idle');
    if(!this.hasAttribute('variant'))this.setAttribute('variant','standard');
    this._paint();this._onSize();
    this.addEventListener('pointermove',this._onPointer,{passive:true});
    this.addEventListener('pointerleave',this._onLeave,{passive:true});
  }
  disconnectedCallback(){this._cancelTimeline();this.removeEventListener('pointermove',this._onPointer);this.removeEventListener('pointerleave',this._onLeave);}
  attributeChangedCallback(name,oldValue,newValue){
    if(oldValue===newValue)return;
    if(name==='size'){this._onSize();return;}
    if(name==='animated'){
      this.shadowRoot.querySelector('style').textContent=guardianStyles+(!this.animated?' .float-rig,.eye-pair,.gaze-rig{animation:none!important}':'');
      return;
    }
    if(name==='state'&&isState(newValue)){
      if(this.dataset.greeting==='true'&&newValue!=='greeting')this._cancelTimeline();
      if(this.dataset.uploading==='true'&&newValue!=='upload')this._cancelTimeline();
    }
    this._paint();
  }
  get state(){return this.getAttribute('state')??'idle';}
  set state(value){this.setState(value);}
  get variant(){return this.getAttribute('variant')??'standard';}
  set variant(value){this.setVariant(value);}
  get animated(){return this.getAttribute('animated')!=='false';}
  set animated(value){this.setAttribute('animated',value?'true':'false');}
  get progress(){return this._progress;}
  set progress(value){this.setUploadProgress(value);}
  setState(value){
    if(!isState(value))throw new RangeError(`Unknown Xyeena state: ${String(value)}`);
    if(this.state===value)return;
    const from=this.state;this.setAttribute('state',value);
    this.dispatchEvent(new CustomEvent('xyeena-state-change',{detail:{from,to:value},bubbles:true,composed:true}));
  }
  setVariant(value){if(!isVariant(value))throw new RangeError(`Unknown Xyeena variant: ${String(value)}`);this.setAttribute('variant',value);}
  setSize(size){if(!Number.isFinite(size)||size<24||size>1200)throw new RangeError('size must be between 24 and 1200');this.setAttribute('size',String(size));}
  _onSize(){const n=Number(this.getAttribute('size'));this.style.setProperty('--mascot-size',`${Number.isFinite(n)&&n>=24&&n<=1200?n:260}px`);}
  _paint(){
    const name=isState(this.state)?this.state:'idle',cfg=STATES[name];
    this.style.setProperty('--accent',cfg.color);
    const desiredEyes=eyeMarkup(cfg.eyes);
    if(this._lastEyes!==desiredEyes){
      const next=document.createElementNS('http://www.w3.org/2000/svg','g');
      next.innerHTML=desiredEyes;
      if(this._lastEyes!==undefined&&this.animated&&!this._reduce&&typeof next.animate==='function'){
        const existing=Array.from(this._eyes.children);
        next.animate([{opacity:0,transform:'scaleY(.72)'},{opacity:1,transform:'scaleY(1)'}],{duration:175,easing:'ease-out'});
        this._eyes.append(next);
        for(const old of existing){
          const exit=old.animate([{opacity:1},{opacity:0}],{duration:155,fill:'forwards'});
          exit.onfinish=()=>old.remove();
        }
      }else this._eyes.replaceChildren(next);
      this._lastEyes=desiredEyes;
    }
    this._badge.innerHTML=badgeMarkup(cfg.badge);
    this._badge.setAttribute('aria-hidden','true');
    const variant=isVariant(this.variant)?this.variant:'standard';
    this._accessory.innerHTML=accessoryMarkup(variant,this._id);
    this._svg.querySelector('title').textContent=`Xyeena lion guardian: ${cfg.label}. ${cfg.message}`;
  }
  _cancelTimeline(){this._token++;caf(this._raf);this._raf=0;this.dataset.greeting='false';this.dataset.uploading='false';
    for(const prop of ['--intro-rise','--intro-tilt','--paw','--crest','--ring','--gateway','--document','--charge'])this.style.removeProperty(prop);
  }
  _tone(freq=600){
    if(!this.hasAttribute('sound'))return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this._sound??=new AC();if(this._sound.state!=='running')return;
      const o=this._sound.createOscillator(),g=this._sound.createGain();
      o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,this._sound.currentTime);
      g.gain.exponentialRampToValueAtTime(.035,this._sound.currentTime+.015);
      g.gain.exponentialRampToValueAtTime(.0001,this._sound.currentTime+.13);
      o.connect(g);g.connect(this._sound.destination);o.start();o.stop(this._sound.currentTime+.14);
    }catch{/* Audio is strictly optional. */}
  }
  /** Original short guardian salute. Can be interrupted by a real task event. */
  greet(){
    this._cancelTimeline();const oldState=this.state;this.setState('greeting');
    const token=++this._token;this.dataset.greeting='true';const start=performance.now();
    const step=now=>{
      if(token!==this._token||!this.isConnected)return;
      const f=greetingFrame((now-start)/1000,this._reduce||!this.animated);
      this.style.setProperty('--intro-rise',String(f.rise));this.style.setProperty('--intro-tilt',`${f.tilt}rad`);
      this.style.setProperty('--paw',String(f.paw));this.style.setProperty('--crest',String(f.crest));this.style.setProperty('--ring',String(f.ring));
      if(f.done){this._cancelTimeline();if(this.state==='greeting')this.setState(isState(oldState)?oldState:'idle');
        this.dispatchEvent(new CustomEvent('xyeena-greeting-complete',{bubbles:true,composed:true}));return;}
      this._raf=raf(step);
    };
    this._tone(660);this._raf=raf(step);
  }
  /** Start the visual portal. Uploading bytes remains the responsibility of the caller. */
  beginUpload(){
    this._cancelTimeline();this._progress=0;this.setState('upload');
    const token=++this._token,start=performance.now();this.dataset.uploading='true';
    const step=now=>{
      if(token!==this._token||!this.isConnected)return;
      const f=uploadFrame((now-start)/1000,this._progress,this._reduce||!this.animated);
      this.style.setProperty('--gateway',String(f.gateway));this.style.setProperty('--document',String(f.document));this.style.setProperty('--charge',String(f.charge));
      if(f.done&&now-start>=1150){this._cancelTimeline();this.setState('finished');
        this.dispatchEvent(new CustomEvent('xyeena-upload-complete',{bubbles:true,composed:true}));return;}
      this._raf=raf(step);
    };
    this._raf=raf(step);
  }
  setUploadProgress(value){
    if(!Number.isFinite(value))throw new TypeError('Upload progress must be a finite number');
    this._progress=clamp01(value);
    this.dispatchEvent(new CustomEvent('xyeena-upload-progress',{detail:{progress:this._progress},bubbles:true,composed:true}));
  }
  cancelUpload(){this._cancelTimeline();if(this.state==='upload')this.setState('idle');}
}
export function defineXyeenaGuardian(){
  if(typeof customElements === 'undefined') return null;
  if(!customElements.get(tag))customElements.define(tag,XyeenaGuardian);
  return customElements.get(tag);
}
