import {lionGazeTarget,physicalPointerToCss} from './identity-lion.js';
/** Accept fresh native Windows cursor samples for the Island only. No polling/I-O. */
export function gazeFromNative(sample,face,now=Date.now()){
  if(!sample||typeof sample!=='object'||!face||!Number.isFinite(now))return null;
  const {cursor,origin,scale,at}=sample;
  if(!Number.isFinite(at)||at>now+1000||now-at>450)return null;
  const pointer=physicalPointerToCss(cursor,origin,scale);
  if(!pointer||![face.x,face.y].every(Number.isFinite))return null;
  return lionGazeTarget(pointer,face);
}
/** The native host must own and stop cursor polling. */
export function shouldSampleCursor({islandVisible=false,guardianVisible=false,enabled=false}={}){
  return Boolean(islandVisible&&guardianVisible&&enabled);
}
