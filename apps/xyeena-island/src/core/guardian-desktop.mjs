// Pure desktop geometry/state policies. No native access, tracking or persistence.
export const PRESENCE = Object.freeze(['docked', 'detaching', 'detached', 'returning']);
export const MODES = Object.freeze(['perch', 'follow']);
export const PANEL_SIZE = 180;

/** @param {string} presence @param {string} event */
export function presenceTransition(presence, event) {
  if (!PRESENCE.includes(presence)) throw new RangeError('Unknown guardian presence');
  switch (event) {
    case 'detach': return presence === 'docked' ? 'detaching' : presence;
    case 'arrived': return presence === 'detaching' ? 'detached' : presence;
    case 'return': return presence === 'detached' || presence === 'detaching' ? 'returning' : presence;
    case 'home': return presence === 'returning' ? 'docked' : presence;
    default: throw new RangeError('Unknown guardian presence event');
  }
}
/** @param {{x:number,y:number}} point @param {number} [size] */
export function isGuardianBody(point, size = PANEL_SIZE) {
  if (![point.x, point.y, size].every(Number.isFinite) || size < 24) return false;
  const x = (point.x - size * .5) / size;
  const y = (point.y - size * .49) / size;
  return (x / .35) ** 2 + (y / .37) ** 2 <= 1;
}
/** @param {{x:number,y:number,width:number,height:number}} work @param {{x:number,y:number}} position @param {number} [size] */
export function clampPosition(work, position, size = PANEL_SIZE) {
  const all = [work.x,work.y,work.width,work.height,position.x,position.y,size];
  if (!all.every(Number.isFinite) || work.width < size || work.height < size || size < 24) throw new RangeError('Invalid display geometry');
  const inset=8;
  const loX=work.x+inset, loY=work.y+inset;
  const hiX=work.x+work.width-size-inset,hiY=work.y+work.height-size-inset;
  return {x:Math.round(Math.max(loX,Math.min(Math.max(loX,hiX),position.x))),
    y:Math.round(Math.max(loY,Math.min(Math.max(loY,hiY),position.y)))};
}
/** @param {{x:number,y:number}} cursor @param {{x:number,y:number,width:number,height:number}} work @param {number} [size] */
export function followTarget(cursor,work,size=PANEL_SIZE) {
  const gap=72;
  const right=cursor.x+gap;
  const bottom=cursor.y+32;
  const target={x:right+size<work.x+work.width?right:cursor.x-size-gap,
    y:bottom+size<work.y+work.height?bottom:cursor.y-size-32};
  return clampPosition(work,target,size);
}
/** @param {unknown} value */
export function sanitizeGuardianMode(value){return typeof value==='string'&&MODES.includes(value) ? value : 'perch';}
/** @param {unknown} state */
export function guardianContextState(state){
  /** @type {Record<string,string>} */
  const map={playing:'dancing',meeting:'working',listening:'working',working:'working',thinking:'thinking',attention:'surprised',finished:'finished',error:'error'};
  return typeof state==='string'&&Object.hasOwn(map,state)?map[state]:'idle';
}
