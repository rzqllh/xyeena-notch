// Original Xyeena Fold companion semantics. No Coucou/Mochi character assets or choreography.
// Pure input-to-state mapping; no process, microphone, camera, or network inspection.
const BUSY=new Set(['TRIAGE','DISCOVER','DEFINE','PLAN','EXECUTE','VERIFY','REVIEW','DEBUG','RELEASE']);
const ATTENTION=new Set(['DEBUG']);
export const FOLD_STATES=Object.freeze(['idle','listening','playing','working','attention']);
/** @typedef {'idle'|'listening'|'playing'|'working'|'attention'} FoldState */
/** @param {{meetingActive?:boolean,mediaPlaying?:boolean,runs?:Array<{state?:string}>}} source @returns {FoldState} */
export function chooseFoldState(source={}) {
 const runs=Array.isArray(source.runs)?source.runs:[];
 if(runs.some(x=>ATTENTION.has(x?.state||'')))return 'attention';
 if(source.meetingActive)return 'listening';
 if(runs.some(x=>BUSY.has(x?.state||'')))return 'working';
 if(source.mediaPlaying)return 'playing';
 return 'idle';
}
/** @param {string} state */
export function foldStatus(state){
 switch(state){
 case 'listening':return 'Meeting timer active';
 case 'playing':return 'Media playing';
 case 'working':return 'Xyeena workflow in progress';
 case 'attention':return 'Xyeena workflow needs review';
 default:return 'Idle';
 }
}
/** @param {string} state */
export function isFoldState(state){return FOLD_STATES.includes(state);}
/** CSS-only motion is compositor-friendly; reduced motion CSS disables all transitions. */
export const FOLD_ART=`<svg class="fold-art" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
 <path class="fold-shadow" d="M9 15 25 4 41 17 38 35 21 44 6 32Z"/>
 <path class="fold-body" d="M7 14 25 4 40 17 36 35 20 42 6 31Z"/>
 <path class="fold-facet" d="M25 4 40 17 25 24 20 42 18 23Z"/>
 <path class="fold-ridge" d="M7 14 18 23 25 24 40 17"/>
 <g class="fold-face"><circle cx="17" cy="27" r="1.65"/><circle cx="26" cy="30" r="1.65"/><path d="M19 33Q21 35 23 34"/></g>
 <path class="fold-spark" d="M39 5V12M35.5 8.5H42.5"/>
</svg>`;
