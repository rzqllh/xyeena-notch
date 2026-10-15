/** Xyn: original Xyeena Lion Guardian state palette and facial language. */
const configure = (label, color, eyes='dot', badge='none', motion='float', message='') => Object.freeze({label,color,eyes,badge,motion,message});
export const STATES = Object.freeze({
  idle: configure('Idle','#7c9fff','dot','none','float','Watching over your workspace'),
  working: configure('Working','#57abff','dot','dots','pulse','Working through the task'),
  thinking: configure('Thinking','#b58aff','look','dots','ponder','Considering the options'),
  searching: configure('Searching','#9185ff','look','search','scan','Looking for information'),
  question: configure('Question','#43dbd6','wide','question','tilt','A decision is needed'),
  approval: configure('Approval','#f5bc66','wide','alert','hold','Waiting for your approval'),
  finished: configure('Finished','#4bd7a5','happy','spark','celebrate','Task completed'),
  error: configure('Error','#f47788','flat','alert','wobble','Something needs attention'),
  rate_limit: configure('Rate limit','#efa471','tired','clock','slow','Waiting to retry'),
  sleeping: configure('Sleeping','#a0a9bd','sleep','none','sleep','Resting'),
  dizzy: configure('Dizzy','#ec87c1','spiral','none','tilt','Reorienting'),
  greeting: configure('Greeting','#f3c380','happy','spark','wave','Hello from Xyeena'),
  upload: configure('Upload','#4fd9be','focused','upload','charge','Preparing a file'),
  yawn: configure('Yawn','#9ea8cc','sleep','none','sleep','A little sleepy'),
  surprised: configure('Surprised','#edba8d','wide','alert','hop','What happened?'),
  proud: configure('Proud','#e6c16c','happy','spark','celebrate','Nicely done'),
  wink: configure('Wink','#f3c380','wink','none','tilt','Got it'),
  annoyed: configure('Annoyed','#ec9a83','flat','none','wobble','Not quite'),
  love: configure('Love','#f08cab','heart','heart','pulse','Much appreciated'),
  dancing: configure('Dancing','#d19afa','happy','spark','dance','Celebrating'),
});
export const VARIANTS = Object.freeze([
  'standard','shield','visor','headset','crown','beanie','santa','witch','glasses','sunglasses','scarf','bow'
]);
export const isState = name => Object.hasOwn(STATES, name);
export const isVariant = name => VARIANTS.includes(name);

/** Pure mapping: caller remains the authority for real task status. */
export const EVENT_STATES = Object.freeze({
  idle:'idle', started:'working', running:'working', working:'working', thinking:'thinking',
  searching:'searching', needs_input:'question', question:'question', needs_approval:'approval',
  approval:'approval', uploading:'upload', upload:'upload', completed:'finished', success:'finished',
  failed:'error', error:'error', rate_limited:'rate_limit', sleeping:'sleeping',
  cancelled:'idle', paused:'idle'
});
export function stateForEvent(event) {
  if (typeof event !== 'string') return 'idle';
  return EVENT_STATES[event] ?? (isState(event) ? event : 'idle');
}
