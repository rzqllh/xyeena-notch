/** Deterministic functional timeline helpers; independent of DOM and requestAnimationFrame. */
export const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const lerp = (a,b,t) => a+(b-a)*clamp01(t);
export const easeOut = x => 1 - (1-clamp01(x))**3;
export const easeInOut = x => {const t=clamp01(x); return t*t*(3-2*t);};
export const segment = (t,start,end) => end <= start ? Number(t>=end) : clamp01((t-start)/(end-start));
/** Xyeena's distinct guardian greeting: rise, crest flare, paw salute, settle. */
export function greetingFrame(t, reduced=false) {
  if(reduced) return {phase:'settled',rise:1,crest:0,paw:0,ring:0,tilt:0,done:true};
  const rise=easeOut(segment(t,0,.55));
  const crest=Math.sin(Math.PI*segment(t,.3,1.25));
  const paw=Math.sin(Math.PI*segment(t,.6,1.9));
  const ring=segment(t,.48,1.75);
  const tilt=Math.sin(segment(t,.6,1.9)*Math.PI*3)*0.045*paw;
  return {phase:t<.55?'rise':t<1.9?'salute':t<2.45?'settle':'settled',rise,crest,paw,ring,tilt,done:t>=2.45};
}
/** Xyeena upload: shield gateway opens / receives document / charges / resolves. */
export function uploadFrame(t, progress=0, reduced=false) {
  const p=clamp01(progress);
  if(reduced) return {phase:p>=1?'done':'transfer',gateway:0,document:0,charge:p,progress:p,done:p>=1};
  const phase=t<.45?'prepare':t<1.1?'receive':p>=1?'resolve':'transfer';
  return {phase,gateway:Math.sin(Math.PI*segment(t,0,1.25)),document:1-easeInOut(segment(t,.45,1.1)),charge:easeOut(p),progress:p,done:p>=1};
}
