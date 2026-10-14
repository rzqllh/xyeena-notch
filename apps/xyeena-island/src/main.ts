import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {isPermissionGranted,requestPermission,sendNotification} from '@tauri-apps/plugin-notification';
import {readText,writeText} from '@tauri-apps/plugin-clipboard-manager';
import {ClipboardHistory} from './core/clipboard.mjs';
import {timeLabel} from './core/media.mjs';
import {transition,shellDimensions} from './core/island-machine.mjs';
import type {IslandMode,IslandEvent} from './core/island-machine.mjs';
import {GeometryMotion,validFrame} from './core/motion.mjs';
import {DEFAULT_SETTINGS,STORAGE_KEY,sanitizeSettings} from './core/settings.mjs';
import {normalizeRuns} from './core/run-summaries.mjs';
import {normalizeSessions,pickSession,sourceLabel} from './core/media-sessions.mjs';
import {normalizeMeeting,elapsedMeeting,MEETING_KEY} from './core/meeting.mjs';
import {RunChangeFeed} from './core/notifications.mjs';
import {chooseGuardianState,toMascotState,guardianStatus,defineXyeenaGuardian} from './core/mascot.mjs';
import './style.css';

defineXyeenaGuardian();

type Panel='now'|'clipboard'|'activity'|'preferences';
type Prefs=ReturnType<typeof sanitizeSettings>;
type MediaOverview=ReturnType<typeof normalizeSessions>;
type Media=ReturnType<typeof pickSession>;
const root=document.querySelector<HTMLElement>('#app')!;
if(!root)throw new Error('Island container is missing');
const isTauri='__TAURI_INTERNALS__' in window;
function icon(name:string,size=18){
 const glyphs:Record<string,string>={
  logo:'M12 2 3.5 12l8.5 10 8.5-10L12 2zM12 7v10M8 12h8',
  chevron:'m7 10 5 5 5-5',pin:'m16 3 5 5-4 2-4 6-3 3-5-5 3-3 5-2zM11 17l-6 5',
  music:'M9 18V5l12-2v13M9 18c0 4-7 4-7 1s7-4 7-1m12-2c0 4-7 4-7 1s7-4 7-1',
  play:'m9 6 10 6-10 6z',pause:'M8 5v14M16 5v14',prev:'M6 5v14M19 5 8 12l11 7V5z',next:'M18 5v14M5 5l11 7-11 7V5z',
  bell:'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4',
  sliders:'M4 7h9m4 0h3M4 17h3m4 0h9M13 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  activity:'M3 12h4l3-6 4 12 3-6h4',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 3',
  folder:'M3 6h7l2 2h9v12H3V6z',refresh:'M20 7v5h-5M4 17v-5h5M5.6 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.3-2',
  alert:'M12 9v4m0 4h.01M12 2 2 21h20L12 2z',copy:'M8 4H19V17H8zM5 7H3V20h12v-2',volume:'M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8',mute:'M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6',headset:'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2M20 15h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2',
 };
 return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round"><path d="${glyphs[name]||glyphs.logo}"/></svg>`;
}

root.innerHTML=`
<div class="island" data-mode="compact" data-panel="now" role="region" aria-label="Xyeena Island">
 <button class="wake" type="button" aria-label="Show Xyeena Island"><span></span></button>
 <div class="compact">
   <span class="mascot-slot mascot-compact" id="compact-mascot-slot" role="button" tabindex="0" aria-label="Xyeena Guardian: click for salute" title="Watching over your workspace">
     <xyeena-guardian id="compact-guardian" size="26" interactive animated></xyeena-guardian>
   </span>
   <span class="compact-copy"><strong>Xyeena</strong><small id="compact-context">Ready</small></span>
   <span class="compact-dot" aria-hidden="true"></span>
   <button class="icon-btn compact-expand" type="button" aria-label="Expand Island">${icon('chevron',19)}</button>
 </div>
 <div class="expanded">
  <header class="header">
    <span class="mascot-slot mascot-header" id="header-mascot-slot" role="button" tabindex="0" aria-label="Xyeena Guardian: click for salute" title="Watching over your workspace">
      <xyeena-guardian id="header-guardian" size="30" interactive animated></xyeena-guardian>
    </span>
    <strong>Xyeena</strong><span class="header-status" id="header-status">Ready</span>
    <button class="icon-btn pin" type="button" aria-label="Pin Island" aria-pressed="false" title="Keep expanded">${icon('pin',16)}</button>
    <button class="icon-btn guardian-toggle" type="button" title="Send Guardian to desktop" aria-label="Send Guardian to desktop" aria-pressed="false">🦁</button>
    <button class="icon-btn collapse" type="button" aria-label="Collapse Island" title="Collapse">${icon('chevron',18)}</button>
  </header>
  <nav class="navigation" role="tablist" aria-label="Island sections">
   <button class="nav-tab current" role="tab" data-panel="now" aria-controls="page-now" aria-selected="true" type="button">Now</button>
   <button class="nav-tab" role="tab" data-panel="clipboard" aria-controls="page-clipboard" aria-selected="false" type="button">Clips</button>
   <button class="nav-tab" role="tab" data-panel="activity" aria-controls="page-activity" aria-selected="false" type="button">Activity <span class="nav-unread" id="unread" hidden></span></button>
   <button class="nav-tab nav-settings" role="tab" data-panel="preferences" aria-controls="page-preferences" aria-selected="false" type="button">${icon('sliders',15)} Settings</button>
  </nav>
  <main class="viewport">
   <section class="page" id="page-now" role="tabpanel">
    <div class="section-heading"><div><span class="kicker">PLAYBACK</span><h1>Now playing</h1></div><button class="minor-btn media-refresh" type="button">${icon('refresh',14)} Refresh</button></div>
    <div class="player">
      <div class="art" aria-hidden="true">${icon('music',23)}</div>
      <div class="track"><strong id="track-title">No playback session</strong><span id="track-artist">Waiting for compatible Windows media</span>
       <span class="track-source" id="track-state">No session</span></div>
      <div class="player-actions">
       <button class="media-btn" data-media="previous" type="button" aria-label="Previous track">${icon('prev',18)}</button>
       <button class="media-btn transport" data-media="toggle" type="button" aria-label="Play or pause">${icon('play',19)}</button>
       <button class="media-btn" data-media="next" type="button" aria-label="Next track">${icon('next',18)}</button>
      </div>
    </div>
    <div class="advanced-media" aria-label="Advanced playback controls">
     <div class="timeline"><span id="position-label">0:00</span><input id="media-seek" type="range" min="0" max="1000" step="1" value="0" disabled aria-label="Playback position"><span id="duration-label">0:00</span></div>
     <div class="audio-toolbar">
      <div class="mode-controls"><button id="shuffle" class="small-tool" type="button" disabled title="Request shuffle for selected player" aria-label="Shuffle">Shuffle</button><button id="repeat" class="small-tool" type="button" disabled title="Request repeat for selected player" aria-label="Repeat">Repeat: Off</button></div>
      <div class="volume-controls" title="Windows default output device, not app-specific"><button id="mute" type="button" aria-label="Mute Windows output" class="icon-btn">${icon('volume',15)}</button><input id="master-volume" type="range" min="0" max="100" value="50" aria-label="Windows master output volume"><output id="volume-value">50%</output></div>
     </div>
     <div id="media-feedback" class="feedback" role="status">Volume controls Windows default output, not individual apps.</div>
    </div>
    <div class="source-line"><label for="media-choice">Playback source</label><select id="media-choice" aria-label="Windows playback source"><option value="">No compatible source</option></select></div>
    <div class="section-heading calls-heading"><div><span class="kicker">CALLS & MEETINGS</span><h2>Meeting mode</h2></div><span class="meeting-duration" id="meeting-clock" aria-live="off"></span></div>
    <div class="call-row"><span class="call-icon" aria-hidden="true">${icon('headset',19)}</span>
      <p id="meeting-summary">Not tracking a meeting</p>
      <button class="meeting-button" type="button" id="meeting-action">Start</button>
    </div>
    <p class="explain" id="meeting-explain">Manual timer. Teams call detection requires a separate Microsoft 365 connection; playback sessions do not report calls.</p>
   </section>
   <section class="page" id="page-clipboard" role="tabpanel" hidden>
     <div class="section-heading"><div><span class="kicker">PRIVATE / THIS SESSION</span><h1>Clipboard</h1></div><button id="clip-clear" class="minor-btn" type="button">Clear</button></div>
     <p class="explain clip-warning">Text-only history lives in memory and is cleared on exit. Clipboard contents may contain secrets; the filter cannot detect every sensitive value.</p>
     <div class="clip-controls"><button id="clip-toggle" class="meeting-button" aria-pressed="false" type="button">Enable capture</button><button id="clip-read" class="minor-btn" type="button">Read clipboard once</button><span id="clip-state" role="status">Capture off</span></div>
     <div id="clip-list" class="clip-list" aria-label="Clipboard text history"></div>
   </section>
   <section class="page" id="page-activity" role="tabpanel" hidden>
    <div class="section-heading"><div><span class="kicker">ON-DEVICE HISTORY</span><h1>Activity</h1></div><button class="minor-btn test-notification" type="button">${icon('bell',14)} Test toast</button></div>
    <p class="explain" id="alerts-explain">Only actual local events and Xyeena run changes appear here.</p>
    <div class="history alert-history" id="alerts"></div>
    <details class="project-details" id="project-details">
      <summary>Connect Xyeena Agentic project <span>Optional</span></summary>
      <p class="explain activity-explain">Projects need Xyeena Agentic run snapshots. Island doesn't create runs or install hooks.</p>
      <div class="path-row"><label class="path-wrap">${icon('folder',16)}<input id="project-root" type="text" placeholder="Absolute project folder" aria-label="Absolute path to Xyeena project" spellcheck="false" autocomplete="off"/></label><button class="action-btn connect" type="button">Connect</button></div>
      <p class="status-line" id="project-status" role="status">Not connected</p>
      <div id="runs" class="history"></div>
      <button class="minor-btn disconnect" type="button" hidden>Disconnect</button>
    </details>
   </section>
   <section class="page" id="page-preferences" role="tabpanel" hidden>
    <span class="kicker settings-kicker">PREFERENCES</span>
    <div class="setting"><span><strong>Keep above windows</strong><small>Always on top</small></span><input type="checkbox" id="always-top" aria-label="Always on top"></div>
    <div class="setting"><span><strong>Collapse on pointer exit</strong><small>Stay expanded when pinned</small></span><input type="checkbox" id="auto-collapse" aria-label="Auto-collapse"></div>
    <div class="setting"><span><strong>Auto-hide compact view</strong><small>Reveal using the wake strip</small></span><input type="checkbox" id="auto-hide" aria-label="Auto-hide"></div>
    <div class="setting"><span><strong>Windows run notifications</strong><small>Opt-in for connected project changes</small></span><input type="checkbox" id="run-notifications" aria-label="Run notifications"></div>
    <div class="setting"><span><strong>Appearance</strong><small>Match Windows or choose a theme</small></span><select id="theme" aria-label="Appearance"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
    <div class="setting"><span><strong>Guardian on desktop</strong><small>Perch quietly or follow your pointer</small></span><select id="guardian-mode" aria-label="Guardian desktop behavior"><option value="perch">Perch</option><option value="follow">Follow pointer</option></select></div>
    <div class="setting"><span><strong>Reduced motion</strong><small>Disable window transitions</small></span><input type="checkbox" id="reduce-motion" aria-label="Reduced motion"></div>
    <details class="project-details" id="about-credits"><summary>About & credits <span>MIT source</span></summary>
      <p class="explain">Xyeena Island 1.0.0-alpha.1 · Local Windows companion. Xyeena Guardian mascot is original Xyeena artwork (@xyeena/mascot). Window motion mathematics adapted from Coucou by Louis Raillé (MIT), with no Coucou/Mochi character, brand or media assets.</p>
      <p class="explain">Full code and asset license details: THIRD_PARTY_NOTICES.md and docs/MASCOT-ASSET-RESEARCH.md in this source repository.</p>
    </details>
    <div class="settings-end"><button class="minor-btn recenter" type="button">Recenter</button><button class="minor-btn footer-hide" type="button">Hide to tray</button><span>1.0.0-alpha.1 · On device</span></div>
   </section>
  </main>
 </div>
</div>`;

function q<T extends HTMLElement>(selector:string):T{const el=root.querySelector<T>(selector);if(!el)throw new Error('Missing UI: '+selector);return el;}
const shell=q<HTMLElement>('.island');
const stored=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}catch{return {};}})();
let prefs:Prefs=sanitizeSettings({...DEFAULT_SETTINGS,...stored});
const initialMeeting=(()=>{try{return JSON.parse(localStorage.getItem(MEETING_KEY)||'null');}catch{return null;}})();
let meeting=normalizeMeeting(initialMeeting);
let mode:IslandMode='compact',panel:Panel='now';
const motion=new GeometryMotion(shellDimensions(mode));
const feed=new RunChangeFeed();
let lastGuardianState='idle';
let guardianContextSent=false;
function syncGuardian(){
 const activeState=chooseGuardianState({meetingActive:meeting.active,mediaPlaying:selectedMedia.playing,runs,mode});
 const visualState=toMascotState(activeState);
 shell.dataset.fold=activeState;
 shell.dataset.guardian=activeState;
 shell.dataset.mascot=visualState;
 if(activeState!==lastGuardianState||!guardianContextSent){
  lastGuardianState=activeState;
  guardianContextSent=true;
  if(isTauri)void native('guardian_update_context',{context:activeState}).catch(err=>console.warn('Guardian state:',err));
 }
 const label=guardianStatus(activeState);
 for(const el of root.querySelectorAll<HTMLElement>('.mascot-slot'))el.title=label;
 for(const g of root.querySelectorAll<HTMLElement>('xyeena-guardian')){
  if(g.getAttribute('state')!==visualState)g.setAttribute('state',visualState);
 }
}
function triggerMascotSalute(){
 for(const g of root.querySelectorAll<any>('xyeena-guardian')){
  if(typeof g.greet==='function')g.greet();
 }
}
for(const slot of root.querySelectorAll<HTMLElement>('.mascot-slot')){
 slot.addEventListener('click',e=>{e.stopPropagation();triggerMascotSalute();});
 slot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();triggerMascotSalute();}});
}
let runs:ReturnType<typeof normalizeRuns>=[];
let sourcePath=(()=>{try{return localStorage.getItem('xyeena-island-project-root')||'';}catch{return '';}})();
let overview:MediaOverview={sessions:[],currentSource:''};
let selectedSource='', selectedMedia:Media=pickSession(overview);
const clipboard=new ClipboardHistory();
let clipBusy=false,clipTimer:ReturnType<typeof setInterval>|null=null;
let masterVolume={available:false,percent:0,muted:false,scope:'Windows master output'};
let shuffleEnabled=false,repeatMode:'off'|'list'|'track'='off';
let mediaBusy=false,runBusy=false,raf=0,resizeInFlight=false;
let nextFrame:{width:number,height:number}|null=null,exitTimer:ReturnType<typeof setTimeout>|undefined;
const isReduced=()=>prefs.motion==='reduced'||(prefs.motion==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function storePrefs(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(prefs));}catch{}}
function saveMeeting(){try{localStorage.setItem(MEETING_KEY,JSON.stringify(meeting));}catch{}}
function updatePrefs(changes:Partial<Prefs>){prefs=sanitizeSettings({...prefs,...changes});storePrefs();syncPreferences();}
function syncPreferences(){
 const theme=prefs.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):prefs.theme;
 document.documentElement.dataset.theme=theme;
 document.documentElement.dataset.motion=isReduced()?'reduced':'normal';
 for(const [selector,checked] of [
  ['#always-top',prefs.alwaysOnTop],['#auto-collapse',prefs.autoCollapse],['#auto-hide',prefs.autoHide],
  ['#run-notifications',prefs.notifyRunChanges],['#reduce-motion',prefs.motion==='reduced']
 ] as [string,boolean][])q<HTMLInputElement>(selector).checked=checked;
 q<HTMLSelectElement>('#theme').value=prefs.theme;
}
syncPreferences();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',syncPreferences);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncPreferences);
async function native(command:string,payload:Record<string,unknown>={}){
 if(!isTauri)throw new Error('Available only in the Windows application');
 return invoke(command,payload);
}
function sendFrame(frame:{width:number,height:number}){
 if(!isTauri||!validFrame(frame))return;
 nextFrame=frame;if(resizeInFlight)return;
 resizeInFlight=true;
 void(async()=>{try{while(nextFrame){const latest=nextFrame;nextFrame=null;await native('set_island_frame',{width:latest.width,height:latest.height});}}
 catch(err){console.error('Window resize:',err);nextFrame=null;}
 finally{resizeInFlight=false;}})();
}
function tickMotion(now:number){raf=0;sendFrame(motion.step(now));if(motion.animating)raf=requestAnimationFrame(tickMotion);else sendFrame(motion.value);}
function setMode(next:IslandMode,instant=false){
 if(exitTimer)clearTimeout(exitTimer);
 if(mode===next&&!instant)return;
 mode=next;shell.dataset.mode=mode;
 q<HTMLButtonElement>('.pin').setAttribute('aria-pressed',String(mode==='pinned'));
 prefs=sanitizeSettings({...prefs,pinned:mode==='pinned'});storePrefs();
 if(raf)cancelAnimationFrame(raf);
 const target=shellDimensions(next),closing=target.width<motion.value.width;
 motion.target(target,{closing,reduced:instant||isReduced()||!isTauri,now:performance.now()});
 if(motion.animating)raf=requestAnimationFrame(tickMotion);else sendFrame(target);
 syncGuardian();
}
function apply(event:IslandEvent){setMode(transition(mode,event));}
function setPanel(next:Panel){
 panel=next;shell.dataset.panel=next;
 for(const button of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
  const active=button.dataset.panel===next;button.classList.toggle('current',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
 }
 for(const page of root.querySelectorAll<HTMLElement>('.page'))page.hidden=page.id!==`page-${next}`;
 if(next==='now')void refreshMedia();
 if(next==='activity'){q<HTMLElement>('#unread').hidden=true;void refreshRuns();}
 if(next==='clipboard')renderClipboard();
}
for(const tab of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
 tab.addEventListener('click',()=>setPanel(tab.dataset.panel as Panel));
 tab.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();const tabs=[...root.querySelectorAll<HTMLButtonElement>('.nav-tab')];const index=tabs.indexOf(tab);const i=(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[i].focus();tabs[i].click();});
}
q<HTMLButtonElement>('.wake').addEventListener('pointerenter',()=>apply('pointer-enter'));
q<HTMLButtonElement>('.wake').addEventListener('click',()=>apply('activate'));
q<HTMLElement>('.compact').addEventListener('click',e=>{if(!(e.target as Element).closest('button'))apply('activate');});
q<HTMLButtonElement>('.compact-expand').addEventListener('click',()=>apply('activate'));
q<HTMLButtonElement>('.collapse').addEventListener('click',()=>apply('collapse'));
q<HTMLButtonElement>('.pin').addEventListener('click',()=>apply('toggle-pin'));
// Desktop Guardian is a second window in this SAME Tauri app (never a second process).
type GuardianPresence={detached:boolean;mode:'perch'|'follow';context:string};
let guardianDetached=false;
function applyGuardianPresence(p:GuardianPresence){
 guardianDetached=p.detached;
 shell.dataset.guardianDetached=String(guardianDetached);
 const button=q<HTMLButtonElement>('.guardian-toggle');
 button.setAttribute('aria-pressed',String(guardianDetached));
 button.setAttribute('aria-label',guardianDetached?'Return Guardian to Island':'Send Guardian to desktop');
 button.title=guardianDetached?'Return Guardian to Island':'Send Guardian to desktop';
 q<HTMLSelectElement>('#guardian-mode').value=p.mode;
}
q<HTMLButtonElement>('.guardian-toggle').addEventListener('click',async()=>{
 const button=q<HTMLButtonElement>('.guardian-toggle');button.disabled=true;
 try{
  if(guardianDetached)await native('guardian_return');
  else await native('guardian_detach',{mode:q<HTMLSelectElement>('#guardian-mode').value});
  applyGuardianPresence(await invoke<GuardianPresence>('guardian_status'));
 }catch(err){console.error('Guardian desktop:',err);button.title='Guardian unavailable: '+String(err);}
 finally{button.disabled=false;}
});
q<HTMLSelectElement>('#guardian-mode').addEventListener('change',async e=>{
 if(!guardianDetached)return;
 try{applyGuardianPresence(await invoke<GuardianPresence>('guardian_set_mode',{mode:(e.target as HTMLSelectElement).value}));}
 catch(err){console.error('Guardian mode:',err);}
});
shell.addEventListener('pointerenter',()=>{if(exitTimer)clearTimeout(exitTimer);});
shell.addEventListener('pointerleave',()=>{
 if(exitTimer)clearTimeout(exitTimer);
 if(mode==='compact'&&prefs.autoHide)exitTimer=setTimeout(()=>apply('pointer-leave'),3500);
 if(mode==='expanded'&&prefs.autoCollapse)exitTimer=setTimeout(()=>apply('collapse'),3000);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&(mode==='expanded'||mode==='pinned'))apply('collapse');});

function renderMeeting(){
 const label=meeting.active?'Meeting mode on':'Not tracking a meeting';
 q<HTMLElement>('#meeting-summary').textContent=label;
 q<HTMLElement>('#meeting-clock').textContent=meeting.active?elapsedMeeting(meeting.startedAt):'';
 q<HTMLButtonElement>('#meeting-action').textContent=meeting.active?'End':'Start';
 q<HTMLElement>('#meeting-explain').textContent=meeting.active
  ?'Manual timer · Xyeena is not monitoring your microphone or recording a call.'
  :'Manual meeting timer. Teams presence requires Microsoft 365 permission; playback APIs do not detect calls.';
 updateCompact();
}
q<HTMLButtonElement>('#meeting-action').addEventListener('click',()=>{
 meeting=meeting.active?{active:false,startedAt:0}:{active:true,startedAt:Date.now()};saveMeeting();renderMeeting();
});
function updateCompact(){
 q<HTMLElement>('#compact-context').textContent=meeting.active?'Meeting · '+elapsedMeeting(meeting.startedAt)
  :(selectedMedia.available&&selectedMedia.playing?(selectedMedia.title||'Playing'):'Ready');
 q<HTMLElement>('#header-status').textContent=meeting.active?'Meeting mode':selectedMedia.playing?'Media playing':'On device';
 shell.dataset.playing=String(selectedMedia.playing);
 syncGuardian();
}
function renderMedia(){
 const media=selectedMedia;
 q<HTMLElement>('#track-title').textContent=media.available?(media.title||'Untitled media'):'No playback session';
 q<HTMLElement>('#track-artist').textContent=media.available?(media.artist||'No artist information'):'Start playback in an app that supports Windows media controls.';
 q<HTMLElement>('#track-state').textContent=media.available?`${sourceLabel(media.source)} · ${media.playing?'Playing':'Paused'}`:'Not a call detector';
 const select=q<HTMLSelectElement>('#media-choice');
 select.replaceChildren();
 if(!overview.sessions.length){const option=new Option('No compatible playback', '');select.add(option);select.disabled=true;}
 else{
  for(const item of overview.sessions){const option=new Option(sourceLabel(item.source),item.source);select.add(option);}
  select.disabled=overview.sessions.length<2;select.value=media.source;
 }
 const seek=q<HTMLInputElement>('#media-seek');seek.disabled=!media.canSeek;
 seek.value=media.durationMs>0?String(Math.round(media.positionMs/media.durationMs*1000)):'0';
 q<HTMLElement>('#position-label').textContent=timeLabel(media.positionMs);
 q<HTMLElement>('#duration-label').textContent=timeLabel(media.durationMs);
 q<HTMLButtonElement>('#shuffle').disabled=!media.available;
 q<HTMLButtonElement>('#repeat').disabled=!media.available;
 for(const control of root.querySelectorAll<HTMLButtonElement>('[data-media]'))control.disabled=!media.available;
 q<HTMLButtonElement>('[data-media="toggle"]').innerHTML=icon(media.playing?'pause':'play',19);
 updateCompact();
}
async function refreshMedia(){
 if(mediaBusy||!isTauri)return;
 mediaBusy=true;
 try{
  overview=normalizeSessions(await native('get_media_sessions'));
  selectedMedia=pickSession(overview,selectedSource);
  if(!overview.sessions.some(s=>s.source===selectedSource))selectedSource=selectedMedia.source;
  renderMedia();
 }catch(err){q<HTMLElement>('#track-artist').textContent='Windows playback unavailable: '+String(err);}
 finally{mediaBusy=false;}
}
// Player capabilities are optional. Report rejection rather than updating the UI optimistically.
function mediaFeedback(message:string){q<HTMLElement>('#media-feedback').textContent=message;}
q<HTMLInputElement>('#media-seek').addEventListener('change',async e=>{
 if(!selectedMedia.canSeek)return;
 const fraction=Math.max(0,Math.min(1,Number((e.target as HTMLInputElement).value)/1000));
 const positionMs=Math.round(selectedMedia.durationMs*fraction);
 try{const accepted=await native('media_seek',{positionMs,source:selectedMedia.source});
   mediaFeedback(accepted?'Playback position updated.':'Player rejected seek.');await refreshMedia();}
 catch(err){mediaFeedback('Seeking unavailable: '+String(err));}
});
q<HTMLButtonElement>('#shuffle').addEventListener('click',async()=>{
 if(!selectedMedia.available)return;
 try{const applied=await native('media_shuffle',{enabled:!shuffleEnabled,source:selectedMedia.source});
  if(applied)shuffleEnabled=!shuffleEnabled;
  q<HTMLButtonElement>('#shuffle').setAttribute('aria-pressed',String(shuffleEnabled));
  mediaFeedback(applied?'Shuffle change requested; player state may differ.':'Selected player does not support shuffle.');}
 catch(err){mediaFeedback('Shuffle unavailable: '+String(err));}
});
q<HTMLButtonElement>('#repeat').addEventListener('click',async()=>{
 if(!selectedMedia.available)return;
 const next=repeatMode==='off'?'list':repeatMode==='list'?'track':'off';
 try{const applied=await native('media_repeat',{mode:next,source:selectedMedia.source});
  if(applied){repeatMode=next;q<HTMLButtonElement>('#repeat').textContent='Repeat: '+next;}
  mediaFeedback(applied?'Repeat change requested; player state may differ.':'Selected player does not support repeat.');}
 catch(err){mediaFeedback('Repeat unavailable: '+String(err));}
});
async function refreshVolume(){
 if(!isTauri)return;
 try{const snapshot=await native('get_master_volume') as typeof masterVolume;
  masterVolume=snapshot;
  q<HTMLInputElement>('#master-volume').value=String(snapshot.percent);
  q<HTMLOutputElement>('#volume-value').value=snapshot.percent+'%';
  q<HTMLButtonElement>('#mute').innerHTML=icon(snapshot.muted?'mute':'volume',15);
  q<HTMLButtonElement>('#mute').setAttribute('aria-label',snapshot.muted?'Unmute Windows output':'Mute Windows output');
 }catch(err){q<HTMLInputElement>('#master-volume').disabled=true;mediaFeedback('Output volume unavailable: '+String(err));}
}
q<HTMLInputElement>('#master-volume').addEventListener('change',async e=>{
 const percent=Number((e.target as HTMLInputElement).value);
 if(!Number.isInteger(percent)||percent<0||percent>100)return;
 try{masterVolume=await native('set_master_volume',{percent}) as typeof masterVolume;await refreshVolume();}
 catch(err){mediaFeedback('Cannot change output volume: '+String(err));await refreshVolume();}
});
q<HTMLButtonElement>('#mute').addEventListener('click',async()=>{
 try{masterVolume=await native('set_master_mute',{muted:!masterVolume.muted}) as typeof masterVolume;await refreshVolume();}
 catch(err){mediaFeedback('Cannot toggle output mute: '+String(err));}
});

q<HTMLSelectElement>('#media-choice').addEventListener('change',e=>{
 selectedSource=(e.target as HTMLSelectElement).value;selectedMedia=pickSession(overview,selectedSource);renderMedia();
});
q<HTMLButtonElement>('.media-refresh').addEventListener('click',()=>void refreshMedia());
for(const button of root.querySelectorAll<HTMLButtonElement>('[data-media]'))button.addEventListener('click',async()=>{
 if(!selectedMedia.available)return;
 const action=button.dataset.media;button.disabled=true;
 try{await native('media_transport',{action,source:selectedMedia.source});await refreshMedia();}
 catch(err){q<HTMLElement>('#track-artist').textContent='Playback control unavailable: '+String(err);}
 finally{button.disabled=!selectedMedia.available;}
});

// Clipboard monitoring never starts by default or on application restart.
function renderClipboard(){
 const toggle=q<HTMLButtonElement>('#clip-toggle');
 toggle.textContent=clipboard.enabled?'Pause capture':'Enable capture';toggle.setAttribute('aria-pressed',String(clipboard.enabled));
 q<HTMLElement>('#clip-state').textContent=clipboard.enabled?'Capturing text only':'Capture off';
 const list=q<HTMLElement>('#clip-list');list.replaceChildren();
 if(!clipboard.items.length){const empty=document.createElement('p');empty.className='empty-copy';empty.textContent='No captured text. Enable capture or read the clipboard once.';list.append(empty);return;}
 for(const item of clipboard.items){
  const row=document.createElement('div');row.className='clip-entry';
  const text=document.createElement('span');text.textContent=item.text.slice(0,180);
  const btn=document.createElement('button');btn.type='button';btn.className='minor-btn';btn.textContent='Copy';
  btn.addEventListener('click',async()=>{try{await writeText(item.text);q<HTMLElement>('#clip-state').textContent='Copied';}catch(err){q<HTMLElement>('#clip-state').textContent='Copy failed: '+String(err);}});
  row.append(text,btn);list.append(row);
 }
}
async function observeClipboard(){
 if(clipBusy||!clipboard.enabled||!isTauri)return;
 clipBusy=true;
 try{if(clipboard.accept(await readText()))renderClipboard();}
 catch(err){q<HTMLElement>('#clip-state').textContent='Clipboard unavailable: '+String(err);}
 finally{clipBusy=false;}
}
q<HTMLButtonElement>('#clip-toggle').addEventListener('click',async()=>{
 if(clipboard.enabled){clipboard.disable();if(clipTimer)clearInterval(clipTimer);clipTimer=null;}
 else {clipboard.enable();void observeClipboard();clipTimer=setInterval(()=>void observeClipboard(),2000);}
 renderClipboard();
});
q<HTMLButtonElement>('#clip-read').addEventListener('click',async()=>{
 if(!isTauri){q<HTMLElement>('#clip-state').textContent='Windows app only';return;}
 try{const value=await readText();
  // One-time read intentionally never starts background monitoring.
  const prev=clipboard.enabled;
  if(!prev){clipboard.enable();clipboard.last='';}
  clipboard.accept(value);
  if(!prev)clipboard.disable();
  renderClipboard();q<HTMLElement>('#clip-state').textContent='Clipboard read once';
 }catch(err){q<HTMLElement>('#clip-state').textContent='Read failed: '+String(err);}
});
q<HTMLButtonElement>('#clip-clear').addEventListener('click',()=>{clipboard.clear();renderClipboard();});
window.addEventListener('pagehide',()=>{clipboard.clear();if(clipTimer)clearInterval(clipTimer);});

function status(message:string){q<HTMLElement>('#project-status').textContent=message;}
function renderRuns(){
 const list=q<HTMLElement>('#runs');list.replaceChildren();
 if(!sourcePath){list.hidden=true;return;}
 list.hidden=false;
 if(!runs.length){const p=document.createElement('p');p.className='empty-copy';p.textContent='No recorded Xyeena runs in this project. Xyeena CLI must create them first.';list.append(p);return;}
 for(const run of runs){const el=document.createElement('div');el.className='history-row';
  const info=document.createElement('div');const title=document.createElement('strong');title.textContent=run.goal||'Untitled run';
  const id=document.createElement('small');id.textContent=run.runId;info.append(title,id);
  const phase=document.createElement('span');phase.className='phase';phase.textContent=run.state;el.append(info,phase);list.append(el);}
}
function renderAlerts(){
 const list=q<HTMLElement>('#alerts');list.replaceChildren();
 if(!feed.items.length){const p=document.createElement('p');p.className='empty-copy';p.textContent='No run changes yet. Use Test toast to verify Windows notifications.';list.append(p);return;}
 for(const item of feed.items){const row=document.createElement('div');row.className='history-row';
 const left=document.createElement('div');const title=document.createElement('strong');title.textContent=item.title;
 const body=document.createElement('small');body.textContent=item.body;left.append(title,body);row.append(left);list.append(row);}
}
async function toast(title:string,body:string,ask=false){
 if(!isTauri)return false;
 try{
  let allowed=await isPermissionGranted();
  if(!allowed&&ask)allowed=(await requestPermission())==='granted';
  if(!allowed)return false;
  sendNotification({title:title.slice(0,80),body:body.slice(0,120)});return true;
 }catch(e){console.warn('Toast unavailable:',e);return false;}
}
q<HTMLButtonElement>('.test-notification').addEventListener('click',async()=>{
 const item=feed.recordTest();renderAlerts();triggerMascotSalute();
 const ok=await toast('Xyeena Island','Windows notification test',true);
 q<HTMLElement>('#alerts-explain').textContent=ok?'Test recorded and Windows toast requested.':'Test recorded locally; Windows notification was blocked or unavailable.';
});
async function refreshRuns(){
 if(!sourcePath||runBusy||!isTauri)return;
 runBusy=true;
 try{
  runs=normalizeRuns(await native('read_xyeena_runs',{projectRoot:sourcePath}));
  const changes=feed.update(runs);
  for(const item of changes)if(prefs.notifyRunChanges)void toast(item.title,item.body);
  if(changes.length&&panel!=='activity')q<HTMLElement>('#unread').hidden=false;
  renderRuns();renderAlerts();syncGuardian();status(`${runs.length} recorded run${runs.length===1?'':'s'} · Read-only`);
 }catch(err){status('Unable to read project: '+String(err));}
 finally{runBusy=false;}
}
q<HTMLButtonElement>('.connect').addEventListener('click',()=>{
 const input=q<HTMLInputElement>('#project-root').value.trim();
 if(!input){status('Enter a project path first.');return;}
 sourcePath=input;try{localStorage.setItem('xyeena-island-project-root',sourcePath);}catch{}
 feed.reset();runs=[];renderAlerts();renderRuns();
 q<HTMLButtonElement>('.disconnect').hidden=false;void refreshRuns();
});
q<HTMLInputElement>('#project-root').addEventListener('keydown',e=>{if(e.key==='Enter')q<HTMLButtonElement>('.connect').click();});
q<HTMLButtonElement>('.disconnect').addEventListener('click',()=>{
 sourcePath='';runs=[];feed.reset();syncGuardian();try{localStorage.removeItem('xyeena-island-project-root');}catch{}
 q<HTMLInputElement>('#project-root').value='';q<HTMLButtonElement>('.disconnect').hidden=true;
 status('Not connected');renderRuns();renderAlerts();
});

q<HTMLInputElement>('#always-top').addEventListener('change',async e=>{
 const old=prefs.alwaysOnTop,value=(e.target as HTMLInputElement).checked;updatePrefs({alwaysOnTop:value});
 try{await native('set_window_priority',{enabled:value});}catch(err){updatePrefs({alwaysOnTop:old});console.error(err);}
});
q<HTMLInputElement>('#auto-collapse').addEventListener('change',e=>updatePrefs({autoCollapse:(e.target as HTMLInputElement).checked}));
q<HTMLInputElement>('#auto-hide').addEventListener('change',e=>updatePrefs({autoHide:(e.target as HTMLInputElement).checked}));
q<HTMLSelectElement>('#theme').addEventListener('change',e=>updatePrefs({theme:(e.target as HTMLSelectElement).value as Prefs['theme']}));
q<HTMLInputElement>('#reduce-motion').addEventListener('change',e=>updatePrefs({motion:(e.target as HTMLInputElement).checked?'reduced':'system'}));
q<HTMLInputElement>('#run-notifications').addEventListener('change',async e=>{
 const enable=(e.target as HTMLInputElement).checked;
 if(!enable){updatePrefs({notifyRunChanges:false});return;}
 const accepted=isTauri&&(await isPermissionGranted()||(await requestPermission())==='granted');
 updatePrefs({notifyRunChanges:accepted});
});
q<HTMLButtonElement>('.footer-hide').addEventListener('click',()=>void native('hide_island_window').catch(console.error));
q<HTMLButtonElement>('.recenter').addEventListener('click',()=>void native('recenter_island',{mode}).catch(console.error));

async function initialize(){
 setPanel('now');renderRuns();renderAlerts();renderMedia();renderMeeting();
 if(sourcePath){q<HTMLInputElement>('#project-root').value=sourcePath;q<HTMLButtonElement>('.disconnect').hidden=false;q<HTMLDetailsElement>('#project-details').open=true;void refreshRuns();}
 if(isTauri){
  try{
   await listen<GuardianPresence>('guardian:presence',event=>applyGuardianPresence(event.payload));
   applyGuardianPresence(await invoke<GuardianPresence>('guardian_status'));
   await listen<string>('island:tray',e=>{if(e.payload==='expand'){setMode('compact',true);setMode('expanded');}if(e.payload==='compact')setMode('compact',true);});
   await native('set_window_priority',{enabled:prefs.alwaysOnTop});
  }catch(err){console.error('Island init:',err);}
 }
 setMode(prefs.pinned?'pinned':'compact',true);
 void refreshMedia();void refreshVolume();renderClipboard();
 setInterval(()=>{if(!document.hidden||mode==='compact')void refreshMedia();},5000);
 setInterval(()=>{if(panel==='now'&&!document.hidden)void refreshVolume();},10000);
 setInterval(()=>{if(sourcePath&&(prefs.notifyRunChanges||!document.hidden))void refreshRuns();},10000);
 setInterval(()=>{if(meeting.active)renderMeeting();},15000);
}
void initialize();
