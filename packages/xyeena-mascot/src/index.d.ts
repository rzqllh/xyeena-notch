export type XyeenaState = 'idle' | 'working' | 'thinking' | 'searching' | 'question' | 'approval' | 'finished' | 'error' | 'rate_limit' | 'sleeping' | 'dizzy' | 'greeting' | 'upload' | 'yawn' | 'surprised' | 'proud' | 'wink' | 'annoyed' | 'love' | 'dancing';
export type XyeenaVariant = 'standard' | 'shield' | 'visor' | 'headset' | 'crown' | 'beanie' | 'santa' | 'witch' | 'glasses' | 'sunglasses' | 'scarf' | 'bow';
export interface XyeenaStateConfig { label:string; color:string; eyes:string; badge:string; motion:string; message:string }
export declare const STATES: Readonly<Record<XyeenaState,XyeenaStateConfig>>;
export declare const VARIANTS: readonly XyeenaVariant[];
export declare const EVENT_STATES: Readonly<Record<string,XyeenaState>>;
export declare function isState(name: unknown): name is XyeenaState;
export declare function isVariant(name: unknown): name is XyeenaVariant;
export declare function stateForEvent(event: string): XyeenaState;
export declare function pickMascotState(tasks: readonly {status?:string,state?:string}[]): XyeenaState;
export declare function connectAgentEvents(target: {setState(state:XyeenaState):void}, subscribe:(handler:(event:unknown)=>void)=>void|(()=>void)):()=>void;
export declare function greetingFrame(t:number,reduced?:boolean): {phase:string;rise:number;crest:number;paw:number;ring:number;tilt:number;done:boolean};
export declare function uploadFrame(t:number,progress?:number,reduced?:boolean): {phase:string;gateway:number;document:number;charge:number;progress:number;done:boolean};
export declare function superellipse(cx:number,cy:number,rx:number,ry:number,exponent?:number,steps?:number):string;
export declare class XyeenaGuardian extends HTMLElement {
  state: XyeenaState;
  variant: XyeenaVariant;
  animated: boolean;
  progress: number;
  setState(value:XyeenaState):void;
  setVariant(value:XyeenaVariant):void;
  setSize(value:number):void;
  setGaze(x:number,y:number):void;
  setGazeFromClient(clientX:number,clientY:number):void;
  greet():void;
  beginUpload():void;
  setUploadProgress(value:number):void;
  cancelUpload():void;
}
export declare function defineXyeenaGuardian():CustomElementConstructor;

export declare class LivingLionRig {
  constructor(canvas:HTMLCanvasElement,options?:{size?:number,state?:string,reducedMotion?:boolean});
  size:number;
  state:string;
  reducedMotion:boolean;
  resize(size:number):void;
  setState(state:string):void;
  setReducedMotion(reduced:boolean):void;
  setGaze(x:number,y:number):void;
  setGazeFromClient(clientX:number,clientY:number):void;
  salute(duration?:number):void;
  start():void;
  stop():void;
  render():void;
}

export declare class GuardianController {
  constructor(options?:{clock?:()=>number});
  readonly state:XyeenaState;
  readonly tasks:Array<{id:string;status:XyeenaState;detail:string}>;
  subscribe(listener:(state:XyeenaState,tasks:Array<{id:string;status:XyeenaState;detail:string}>)=>void):()=>void;
  setTask(id:string,status:string,detail?:string):void;
  removeTask(id:string):void;
  emote(state:XyeenaState,ttlMs?:number):void;
  tick():void;
  reset():void;
}
