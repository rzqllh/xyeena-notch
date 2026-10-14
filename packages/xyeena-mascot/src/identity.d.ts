export type Point = {x:number;y:number};
export type PhysicalCursorSample = {cursor:Point;origin:Point;scale:number;at:number};
export declare const LION_PALETTE: Readonly<Record<string,string>>;
export declare function clamp(value:number,lo:number,hi:number):number;
export declare function lionGazeTarget(pointer:Point,face:Point,options?:{deadZone?:number;rangeX?:number;rangeY?:number}):Point;
export declare function physicalPointerToCss(pointer:Point,windowOrigin:Point,scale:number):Point|null;
export declare class IdentityLionRig {
 eye:Point;head:Point;target:Point;time:number;motion:boolean;emotion:string;
 setPointer(pointer:Point,face:Point,options?:{deadZone?:number;rangeX?:number;rangeY?:number}):void;
 setGaze(x:number,y:number):void;setReducedMotion(on:boolean):void;setEmotion(state:string):void;
 advance(dtSeconds:number):void;draw(ctx:CanvasRenderingContext2D,width?:number,height?:number):void;
}
export declare function gazeFromNative(sample:PhysicalCursorSample|null,face:Point,now?:number):Point|null;
export declare function shouldSampleCursor(input?:{islandVisible?:boolean;guardianVisible?:boolean;enabled?:boolean}):boolean;
