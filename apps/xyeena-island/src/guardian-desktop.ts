import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {defineXyeenaGuardian} from '@xyeena/mascot';
import {guardianContextState} from './core/guardian-desktop.mjs';
import './guardian-desktop.css';

type GuardianStatus={detached:boolean;mode:'perch'|'follow';context:string};
type Pointer={x:number;y:number;near:boolean};
const root=document.querySelector<HTMLDivElement>('#guardian-root');
if(!root)throw new Error('Guardian root missing');
defineXyeenaGuardian();
root.innerHTML=`<main class="desktop-scene" aria-label="Xyeena Guardian">
  <xyeena-guardian id="lion" state="idle" variant="standard" animated="true" size="148" interactive role="button" aria-label="Xyeena Guardian. Double-click to return home." tabindex="0"></xyeena-guardian>
  <div id="guardian-menu" class="context-menu" hidden role="group" aria-label="Guardian actions">
   <button type="button" id="go-home">Return home</button><button type="button" id="change-mode">Switch mode</button><button type="button" id="sleep">Sleep</button>
  </div>
 </main>`;
const lion=root.querySelector<HTMLElement>('#lion')!;
const menu=root.querySelector<HTMLDivElement>('#guardian-menu')!;
const modeButton=root.querySelector<HTMLButtonElement>('#change-mode')!;
const win=getCurrentWindow();
let mode:'perch'|'follow'='perch',context='idle',awake=true,pressed=false,ready=false;
let movedTimer:ReturnType<typeof setTimeout>|undefined;
let gazeX=0,gazeY=0,desiredX=0,desiredY=0,raf=0,last=0;
function applyContext(){lion.setAttribute('state',awake?guardianContextState(context):'sleeping');}
function setStatus(state:GuardianStatus){mode=state.mode;context=state.context;root!.dataset.mode=mode;modeButton.textContent=mode==='perch'?'Follow cursor':'Perch in place';applyContext();}
function animate(t:number){
 raf=0;
 if(!awake||!ready)return;
 const dt=Math.min(.05,Math.max(0,(t-(last||t))/1000));last=t;
 const factor=1-Math.exp(-13*dt);
 gazeX+=(desiredX-gazeX)*factor;gazeY+=(desiredY-gazeY)*factor;
 lion.style.setProperty('--look-x',`${gazeX.toFixed(2)}px`);
 lion.style.setProperty('--look-y',`${gazeY.toFixed(2)}px`);
 if(Math.abs(gazeX-desiredX)>.025||Math.abs(gazeY-desiredY)>.025)raf=requestAnimationFrame(animate);
}
function gaze(pointer:Pointer){
 if(!ready||!awake)return;
 desiredX=Math.max(-4.5,Math.min(4.5,pointer.x*4.5));desiredY=Math.max(-2.5,Math.min(2.5,pointer.y*2.5));
 if(!raf)raf=requestAnimationFrame(animate);
}
async function showMenu(open:boolean){
 menu.hidden=!open;
 try{await invoke('guardian_set_menu',{open});}catch(e){console.warn('Guardian menu unavailable:',e);}
}
async function returnHome(){await showMenu(false);await invoke('guardian_return');}
root.querySelector<HTMLButtonElement>('#go-home')!.addEventListener('click',()=>void returnHome());
modeButton.addEventListener('click',async()=>{
 const next=mode==='perch'?'follow':'perch';
 try{setStatus(await invoke<GuardianStatus>('guardian_set_mode',{mode:next}));await showMenu(false);}catch(e){console.warn('Guardian mode:',e);}
});
root.querySelector<HTMLButtonElement>('#sleep')!.addEventListener('click',async()=>{
 awake=!awake;root!.querySelector<HTMLButtonElement>('#sleep')!.textContent=awake?'Sleep':'Wake';
 applyContext();await invoke('guardian_set_sleeping',{sleeping:!awake});await showMenu(false);
});
lion.addEventListener('dblclick',()=>void returnHome());
lion.addEventListener('contextmenu',e=>{e.preventDefault();if(mode==='perch')void showMenu(menu.hidden);});
lion.addEventListener('pointerdown',e=>{
 if(e.button!==0||mode!=='perch')return;
 pressed=true;
 void invoke('guardian_set_dragging',{dragging:true}).then(()=>win.startDragging()).catch(err=>console.warn('Drag:',err))
  .finally(()=>{pressed=false;void invoke('guardian_set_dragging',{dragging:false});void invoke('guardian_save_position');});
});
lion.addEventListener('click',()=>{
 if(mode==='follow'||pressed)return;
 lion.setAttribute('state','surprised');window.setTimeout(applyContext,650);
});
lion.addEventListener('keydown',e=>{
 if(e.key==='Enter'||e.key===' '){e.preventDefault();void showMenu(!menu.hidden);}
 if(e.key==='Escape')void showMenu(false);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape')void showMenu(false);});

async function start(){
 await listen<GuardianStatus>('guardian:presence',e=>setStatus(e.payload));
 await listen<Pointer>('guardian:cursor',e=>gaze(e.payload));
 await listen<string>('guardian:context',e=>{context=e.payload;applyContext();});
 await win.onMoved(()=>{
  if(mode!=='perch'||pressed)return;
  if(movedTimer)clearTimeout(movedTimer);
  movedTimer=setTimeout(()=>void invoke('guardian_save_position').catch(()=>{}),500);
 });
 setStatus(await invoke<GuardianStatus>('guardian_status'));
 ready=true;
}
void start().catch(e=>{console.error('Detached Guardian failed:',e);root!.dataset.error='true';});
window.addEventListener('pagehide',()=>{ready=false;if(raf)cancelAnimationFrame(raf);if(movedTimer)clearTimeout(movedTimer);});
