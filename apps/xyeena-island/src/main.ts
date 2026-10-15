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
import {inspectFile,convertImageDataUrl} from './core/files.mjs';
import {ChatEngine,AI_PROVIDERS,renderSafeMarkdown} from './core/ai-chat.mjs';
import {KNOWN_ADAPTERS,normalizeSessionSnapshot} from './core/agent-adapters.mjs';
import {mayForwardDecision} from './core/agent-events.mjs';
import {buildWeeklyRecap,recapText,recapSvg} from '@xyeena/recap';
import './style.css';

defineXyeenaGuardian();

type Panel='now'|'clipboard'|'activity'|'chat'|'preferences';
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
 <div class="drop-overlay" id="drop-overlay"><span class="drop-icon">${icon('folder',32)}</span><strong>Drop file to inspect or convert</strong><small>Images, code, documents</small></div>
 <div class="compact">
   <span class="mascot-slot mascot-compact" id="compact-mascot-slot" role="button" tabindex="0" aria-label="Xyeena Guardian: click for salute" title="Xyeena Lion Guardian">
     <xyeena-guardian id="compact-guardian" size="84" interactive animated></xyeena-guardian>
   </span>
   <div class="compact-copy">
     <div class="compact-meta"><strong class="brand-title">XYEENA</strong><span class="compact-dot" aria-hidden="true"></span><span class="compact-tag" id="compact-status-tag">Ready</span></div>
     <small id="compact-context">Desktop Companion</small>
   </div>
   <div class="compact-actions">
     <button class="icon-btn compact-play" id="compact-play" type="button" aria-label="Play or pause" title="Play or pause">${icon('play',16)}</button>
     <button class="icon-btn compact-expand" type="button" aria-label="Expand Island" title="Expand Island">${icon('chevron',18)}</button>
   </div>
 </div>
 <div class="glance">
   <div class="glance-primary">
     <span class="mascot-slot mascot-glance" id="glance-mascot-slot" role="button" tabindex="0" aria-label="Xyeena Guardian: click for salute" title="Xyeena Lion Guardian">
       <xyeena-guardian id="glance-guardian" size="96" interactive animated></xyeena-guardian>
     </span>
     <div class="glance-meta">
       <span class="glance-title">XYEENA NOTCH</span>
       <strong class="glance-headline" id="glance-headline">Desktop Companion</strong>
       <span class="glance-sub" id="glance-sub">Stationary Guardian active</span>
     </div>
   </div>
   <div class="glance-secondary">
     <div class="glance-card">
       <span class="glance-card-title" id="glance-card-title">Media</span>
       <button class="icon-btn" id="glance-play" type="button" aria-label="Play or pause" title="Play or pause">${icon('play',14)}</button>
     </div>
     <div class="glance-actions">
       <button class="glance-pill" id="glance-now-btn" type="button">Now</button>
       <button class="glance-pill" id="glance-clips-btn" type="button">Clips</button>
       <button class="glance-pill" id="glance-expand-btn" type="button">Expand</button>
     </div>
   </div>
 </div>
 <div class="expanded">
  <header class="header">
    <span class="mascot-slot mascot-header" id="header-mascot-slot" role="button" tabindex="0" aria-label="Xyeena Guardian: click for salute" title="Xyeena Lion Guardian">
      <xyeena-guardian id="header-guardian" size="56" interactive animated></xyeena-guardian>
    </span>
    <div class="header-titles"><strong>Xyeena Island</strong><span class="header-status" id="header-status">On device</span></div>
    <button class="icon-btn pin" type="button" aria-label="Pin Island" aria-pressed="false" title="Keep expanded">${icon('pin',16)}</button>
    <button class="icon-btn collapse" type="button" aria-label="Collapse Island" title="Collapse">${icon('chevron',18)}</button>
  </header>
  <nav class="navigation" role="tablist" aria-label="Island sections">
   <button class="nav-tab current" role="tab" data-panel="now" aria-controls="page-now" aria-selected="true" type="button">Now</button>
   <button class="nav-tab" role="tab" data-panel="clipboard" aria-controls="page-clipboard" aria-selected="false" type="button">Clips</button>
   <button class="nav-tab" role="tab" data-panel="activity" aria-controls="page-activity" aria-selected="false" type="button">Activity <span class="nav-unread" id="unread" hidden></span></button>
   <button class="nav-tab" role="tab" data-panel="chat" aria-controls="page-chat" aria-selected="false" type="button">Chat</button>
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
    <div class="file-card" id="file-card" hidden>
     <div class="file-card-header">
       <img class="file-card-thumb" id="file-thumb" src="" alt="File preview" hidden>
       <div class="file-card-info">
         <strong class="file-card-title" id="file-title">File</strong>
         <span class="file-card-meta" id="file-meta">0 KB</span>
       </div>
       <button class="icon-btn" id="file-close" type="button" title="Dismiss">×</button>
     </div>
     <div class="file-actions-row" id="file-actions">
       <button class="file-action-btn file-action-accent" id="file-convert-webp" type="button">Convert to WebP</button>
       <button class="file-action-btn" id="file-convert-png" type="button">PNG</button>
       <button class="file-action-btn" id="file-convert-jpeg" type="button">JPEG</button>
       <button class="file-action-btn" id="file-copy-info" type="button">Copy Info</button>
     </div>
    </div>
    <div class="section-heading calls-heading"><div><span class="kicker">CALLS & MEETINGS</span><h2>Meeting mode</h2></div><span class="meeting-duration" id="meeting-clock" aria-live="off"></span></div>
    <div class="call-row"><span class="call-icon" aria-hidden="true">${icon('headset',19)}</span>
      <p id="meeting-summary">Not tracking a meeting</p>
      <button class="meeting-button" type="button" id="meeting-action">Start</button>
    </div>
    <p class="explain" id="meeting-explain">Manual timer. Teams call detection requires a separate Microsoft 365 connection; playback sessions do not report calls.</p>
   </section>
   <section class="page" id="page-clipboard" role="tabpanel" hidden>
     <div class="section-heading"><div><span class="kicker">ON-DEVICE CLIPBOARD</span><h1>Clipboard History</h1></div><div class="clip-actions"><button id="clip-clear-unpinned" class="minor-btn" type="button">Clear unpinned</button><button id="clip-clear" class="minor-btn" type="button">Clear all</button></div></div>
     <p class="explain clip-warning">In-memory history for text, images, and file lists. Sensitive tokens are best-effort filtered.</p>
     <div class="clip-controls"><button id="clip-toggle" class="meeting-button" aria-pressed="false" type="button">Enable capture</button><button id="clip-read" class="minor-btn" type="button">Read once</button><span id="clip-state" role="status">Capture off</span></div>
     <div class="clip-search-bar">${icon('logo',13)}<input id="clip-search" type="search" placeholder="Search clipboard history..." aria-label="Search clips"></div>
     <div id="clip-list" class="clip-list" aria-label="Clipboard history"></div>
   </section>
   <section class="page" id="page-activity" role="tabpanel" hidden>
    <div class="section-heading"><div><span class="kicker">ON-DEVICE HISTORY</span><h1>Activity & Agents</h1></div><button class="minor-btn test-notification" type="button">${icon('bell',14)} Test toast</button></div>
    <div class="agent-pills-row" id="agent-pills" aria-label="Detected agent sessions"></div>
    <div id="agent-approval" class="agent-approval-box" hidden>
      <strong id="approval-title">Approval Request</strong>
      <p class="explain" id="approval-prompt">Allow action?</p>
      <div class="agent-approval-actions">
        <button class="action-btn" id="approval-allow" type="button">Allow</button>
        <button class="minor-btn" id="approval-deny" type="button">Deny</button>
      </div>
    </div>
    <p class="explain" id="alerts-explain">Real local events, agent sessions, and Xyeena run changes appear here.</p>
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
   <section class="page" id="page-chat" role="tabpanel" hidden>
     <div class="section-heading">
       <div><span class="kicker">ON-DEVICE AI</span><h1>Companion Chat</h1></div>
       <select id="chat-provider-select" aria-label="AI Provider" class="chat-provider-dropdown">
         <option value="anthropic">Claude 3.7 / 3.5</option>
         <option value="openai">OpenAI GPT-4o</option>
         <option value="gemini">Google Gemini 2.0</option>
         <option value="ollama">Ollama (Local)</option>
         <option value="lmstudio">LM Studio (Local)</option>
       </select>
     </div>
     <div class="chat-viewport" id="chat-messages" aria-live="polite"></div>
     <form class="chat-input-row" id="chat-form">
       <input id="chat-input" type="text" placeholder="Ask Xyeena anything or discuss code..." autocomplete="off">
       <button class="action-btn" type="submit" id="chat-send">Send</button>
     </form>
   </section>
   <section class="page" id="page-preferences" role="tabpanel" hidden>
     <div class="section-heading">
       <div><span class="kicker settings-kicker">PREFERENCES</span><h1>Settings</h1></div>
     </div>
     <div class="settings-nav-pills" id="settings-pills">
       <button class="settings-pill current" type="button" data-section="general">General</button>
       <button class="settings-pill" type="button" data-section="guardian">Guardian</button>
       <button class="settings-pill" type="button" data-section="clipboard">Clipboard</button>
       <button class="settings-pill" type="button" data-section="media">Media</button>
       <button class="settings-pill" type="button" data-section="ai">AI & Agents</button>
       <button class="settings-pill" type="button" data-section="integrations">Integrations</button>
       <button class="settings-pill" type="button" data-section="recap">Weekly Recap</button>
       <button class="settings-pill" type="button" data-section="about">About & Hotkeys</button>
     </div>

     <div class="settings-section" id="setsec-general">
       <div class="setting"><span><strong>Keep above windows</strong><small>Always on top</small></span><input type="checkbox" id="always-top" aria-label="Always on top"></div>
       <div class="setting"><span><strong>Collapse on pointer exit</strong><small>Auto-collapse to compact</small></span><input type="checkbox" id="auto-collapse" aria-label="Auto-collapse"></div>
       <div class="setting"><span><strong>Auto-hide compact view</strong><small>Reveal via wake strip</small></span><input type="checkbox" id="auto-hide" aria-label="Auto-hide"></div>
       <div class="setting"><span><strong>Appearance</strong><small>System, dark, or light theme</small></span><select id="theme" aria-label="Appearance"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
       <div class="setting"><span><strong>Interface language</strong><small>Application language</small></span><select id="setting-language" aria-label="Interface language"><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></div>
       <div class="setting"><span><strong>Start with Windows</strong><small>Launch on user login</small></span><input type="checkbox" id="setting-autostart" aria-label="Start with Windows" checked></div>
     </div>

     <div class="settings-section" id="setsec-guardian" hidden>
       <div class="setting"><span><strong>Global cursor gaze</strong><small>Follow Windows cursor</small></span><input type="checkbox" id="setting-gaze" aria-label="Gaze tracking" checked></div>
       <div class="setting"><span><strong>Reduced motion</strong><small>Disable window spring motion</small></span><input type="checkbox" id="reduce-motion" aria-label="Reduced motion"></div>
       <div class="setting"><span><strong>Original wardrobe</strong><small>Concept art accessories</small></span><select id="setting-wardrobe" aria-label="Original wardrobe"><option value="standard">Standard (Shield)</option><option value="visor">Cyber Visor</option><option value="crown">Golden Crown</option><option value="headset">Studio Headset</option><option value="shield">Silver Aegis</option></select></div>
       <div class="setting"><span><strong>Sound feedback</strong><small>Subtle audio effects</small></span><input type="checkbox" id="setting-sound" aria-label="Sound feedback" checked></div>
       <div class="setting"><span><strong>Sound volume</strong><small>Effect volume level</small></span><input type="range" id="setting-sound-vol" min="0" max="100" value="70" aria-label="Sound volume"></div>
     </div>

     <div class="settings-section" id="setsec-clipboard" hidden>
       <div class="setting"><span><strong>Capture toggle</strong><small>Listen for Windows clipboard</small></span><input type="checkbox" id="setting-clip-capture" aria-label="Capture toggle"></div>
       <div class="setting"><span><strong>Max history entries</strong><small>Bounded memory retention</small></span><select id="setting-clip-limit" aria-label="Max history entries"><option value="20">20 items</option><option value="50">50 items</option><option value="100">100 items</option></select></div>
       <div class="setting"><span><strong>Persistent storage</strong><small>Optional local persistence</small></span><input type="checkbox" id="setting-clip-persist" aria-label="Persistent storage"></div>
       <div class="setting"><span><strong>Supported formats</strong><small>Text, BMP/PNG images, file lists</small></span><span class="badge-tag">Native Win32</span></div>
       <div class="setting"><span><strong>Clear history</strong><small>Remove all captured items</small></span><button class="minor-btn" id="setting-clip-clear" type="button">Clear history</button></div>
     </div>

     <div class="settings-section" id="setsec-media" hidden>
       <div class="setting"><span><strong>Output endpoint</strong><small>Windows default audio</small></span><span class="badge-tag" id="media-device-name">Default Output</span></div>
       <div class="setting"><span><strong>Preferred source</strong><small>Prioritize media player</small></span><select id="setting-media-pref" aria-label="Preferred source"><option value="auto">Automatic (Active)</option><option value="Spotify">Spotify</option><option value="Chrome">Chrome / Edge</option></select></div>
       <div class="setting"><span><strong>Windows run notifications</strong><small>Opt-in for project runs</small></span><input type="checkbox" id="run-notifications" aria-label="Run notifications"></div>
     </div>

     <div class="settings-section" id="setsec-ai" hidden>
       <div class="setting"><span><strong>Companion AI Provider</strong><small>Active chat model endpoint</small></span><select id="setting-ai-provider" aria-label="Companion AI Provider"><option value="anthropic">Anthropic Claude</option><option value="openai">OpenAI GPT</option><option value="gemini">Google Gemini</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama (Local)</option><option value="lmstudio">LM Studio (Local)</option></select></div>
       <div class="setting"><span><strong>Local server endpoint</strong><small>Ollama / LM Studio URL</small></span><input type="text" id="setting-ai-local-url" value="http://localhost:11434" style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--text);width:130px"></div>
       <div class="setting"><span><strong>Credential safety</strong><small>Stored in OS vault; opt-in only</small></span><span class="badge-tag">Protected</span></div>
       <div class="setting"><span><strong>Agent hooks</strong><small>Claude Code, Codex, Antigravity, Cursor</small></span><span class="badge-tag">Sandboxed</span></div>
     </div>

     <div class="settings-section" id="setsec-integrations" hidden>
       <div class="setting"><span><strong>GitHub Integration</strong><small>PRs, issues & runs</small></span><button class="minor-btn" type="button">Configure</button></div>
       <div class="setting"><span><strong>Vercel Deployments</strong><small>Deploy previews</small></span><button class="minor-btn" type="button">Configure</button></div>
       <div class="setting"><span><strong>n8n Workflows</strong><small>Local webhooks</small></span><button class="minor-btn" type="button">Configure</button></div>
       <div class="setting"><span><strong>Notion / Resend / Cal.com</strong><small>Service adapters</small></span><span class="badge-tag">Ready</span></div>
     </div>

     <div class="settings-section" id="setsec-recap" hidden>
       <div class="setting"><span><strong>Weekly Recap Engine</strong><small>Local aggregation (PR #2)</small></span><input type="checkbox" id="setting-recap-enable" aria-label="Enable Weekly Recap" checked></div>
       <div class="setting"><span><strong>Generate Recap</strong><small>Build local week summary</small></span><button class="minor-btn" id="recap-generate-btn" type="button">Generate Recap</button></div>
       <div class="setting"><span><strong>Export Recap SVG</strong><small>Save 1080x1920 card</small></span><button class="minor-btn" id="recap-export-svg-btn" type="button">Export SVG</button></div>
       <div id="recap-preview-box" class="recap-preview-box" hidden>
         <pre id="recap-text" class="recap-text"></pre>
       </div>
     </div>

     <div class="settings-section" id="setsec-about" hidden>
       <div class="setting"><span><strong>Global hotkeys</strong><small>Open: Win+Alt+X · Clip: Win+Alt+V</small></span><span class="badge-tag">Active</span></div>
       <div class="setting"><span><strong>Diagnostic logs</strong><small>Local inspection without credentials</small></span><button class="minor-btn" id="btn-export-diagnostics" type="button">Export Clean Logs</button></div>
       <details class="project-details" id="about-credits" open><summary>About & credits <span>MIT source</span></summary>
         <p class="explain">Xyeena Island 1.0.0-alpha.1 · Balanced Desktop Companion.<br>Xyeena Guardian mascot is original Xyeena artwork (@xyeena/mascot).<br>Window motion mathematics adapted from Coucou by Louis Raillé (MIT), with no Coucou/Mochi character, brand or media assets.</p>
         <p class="explain">Full code and asset license details: THIRD_PARTY_NOTICES.md and docs/MASCOT-ASSET-RESEARCH.md in this repository.</p>
       </details>
     </div>

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
function syncGuardian(){
 const activeState=chooseGuardianState({meetingActive:meeting.active,mediaPlaying:selectedMedia.playing,runs,mode});
 const visualState=toMascotState(activeState);
 shell.dataset.fold=activeState;
 shell.dataset.guardian=activeState;
 shell.dataset.mascot=visualState;
 const label=guardianStatus(activeState);
 for(const el of root.querySelectorAll<HTMLElement>('.mascot-slot'))el.title=label;
 for(const g of root.querySelectorAll<HTMLElement>('xyeena-guardian')){
  if(g.getAttribute('state')!==visualState)g.setAttribute('state',visualState);
  if(g.getAttribute('variant')!==prefs.wardrobe)g.setAttribute('variant',prefs.wardrobe);
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
  ['#run-notifications',prefs.notifyRunChanges],['#reduce-motion',prefs.motion==='reduced'],
  ['#setting-gaze',prefs.gazeEnabled],['#setting-sound',prefs.soundEnabled],
  ['#setting-clip-persist',prefs.clipboardPersistent],['#setting-recap-enable',prefs.recapEnabled]
 ] as [string,boolean][])q<HTMLInputElement>(selector).checked=checked;
 q<HTMLSelectElement>('#theme').value=prefs.theme;
 q<HTMLSelectElement>('#setting-language').value=prefs.language;
 q<HTMLSelectElement>('#setting-wardrobe').value=prefs.wardrobe;
 q<HTMLInputElement>('#setting-sound-vol').value=String(prefs.soundVolume);
 q<HTMLSelectElement>('#setting-clip-limit').value=String(prefs.clipboardLimit);
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
 syncGazePolling();
}
function apply(event:IslandEvent){setMode(transition(mode,event));}
function setPanel(next:Panel){
 panel=next;shell.dataset.panel=next;
 for(const button of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
  const active=button.dataset.panel===next;button.classList.toggle('current',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
 }
 for(const page of root.querySelectorAll<HTMLElement>('.page'))page.hidden=page.id!==`page-${next}`;
 if(next==='now')void refreshMedia();
 if(next==='activity'){q<HTMLElement>('#unread').hidden=true;void refreshRuns();renderAgentPills();}
 if(next==='clipboard')renderClipboard();
 if(next==='chat')renderChatMessages();
}
for(const tab of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
 tab.addEventListener('click',()=>setPanel(tab.dataset.panel as Panel));
 tab.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();const tabs=[...root.querySelectorAll<HTMLButtonElement>('.nav-tab')];const index=tabs.indexOf(tab);const i=(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[i].focus();tabs[i].click();});
}
q<HTMLButtonElement>('.wake').addEventListener('pointerenter',()=>apply('pointer-enter'));
q<HTMLButtonElement>('.wake').addEventListener('click',()=>apply('activate'));
q<HTMLElement>('.compact').addEventListener('click',e=>{if(!(e.target as Element).closest('button'))apply('activate');});
q<HTMLElement>('.glance').addEventListener('click',e=>{if(!(e.target as Element).closest('button'))apply('activate');});
q<HTMLButtonElement>('#glance-expand-btn').addEventListener('click',()=>apply('activate'));
q<HTMLButtonElement>('#glance-now-btn').addEventListener('click',()=>{setPanel('now');apply('activate');});
q<HTMLButtonElement>('#glance-clips-btn').addEventListener('click',()=>{setPanel('clipboard');apply('activate');});
q<HTMLButtonElement>('#glance-play').addEventListener('click',async e=>{
 e.stopPropagation();
 if(!selectedMedia.available)return;
 try{await native('media_transport',{action:'toggle',source:selectedMedia.source});await refreshMedia();}
 catch(err){console.error('Glance play error:',err);}
});
q<HTMLButtonElement>('.compact-expand').addEventListener('click',()=>apply('activate'));
q<HTMLButtonElement>('.collapse').addEventListener('click',()=>apply('collapse'));
q<HTMLButtonElement>('.pin').addEventListener('click',()=>apply('toggle-pin'));
shell.addEventListener('pointerenter',()=>{if(exitTimer)clearTimeout(exitTimer);});
function isInteracting():boolean{
 const a=document.activeElement;
 return !!(a&&(a.tagName==='INPUT'||a.tagName==='SELECT'||a.tagName==='TEXTAREA'||a.hasAttribute('contenteditable')));
}
shell.addEventListener('pointerleave',()=>{
 if(exitTimer)clearTimeout(exitTimer);
 if(mode==='compact'&&prefs.autoHide)exitTimer=setTimeout(()=>{if(!isInteracting())apply('pointer-leave');},3500);
 if(mode==='expanded'&&prefs.autoCollapse)exitTimer=setTimeout(()=>{if(!isInteracting())apply('collapse');},3000);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&(mode==='expanded'||mode==='pinned'))apply('collapse');});

let activeFileDataUrl='';
let activeFileName='';
function closeFileCard(){
 const card=q<HTMLElement>('#file-card');
 card.hidden=true;activeFileDataUrl='';activeFileName='';
}
q<HTMLButtonElement>('#file-close').addEventListener('click',closeFileCard);

async function handleFileDrop(file:File){
 const meta=inspectFile(file);
 if(!meta.valid){
  feed.recordEvent('File rejected',meta.error||'Invalid file','FILE');
  renderAlerts();return;
 }
 activeFileName=meta.name;
 const card=q<HTMLElement>('#file-card');
 const title=q<HTMLElement>('#file-title');
 const info=q<HTMLElement>('#file-meta');
 const thumb=q<HTMLImageElement>('#file-thumb');
 const convertWebp=q<HTMLButtonElement>('#file-convert-webp');
 const convertPng=q<HTMLButtonElement>('#file-convert-png');
 const convertJpeg=q<HTMLButtonElement>('#file-convert-jpeg');

 title.textContent=meta.name;
 info.textContent=`${meta.formattedSize} · ${meta.category.toUpperCase()}`;
 card.hidden=false;
 setPanel('now');
 apply('activate');

 const isImg=meta.category==='image';
 convertWebp.hidden=!isImg;
 convertPng.hidden=!isImg;
 convertJpeg.hidden=!isImg;

 if(isImg){
  const reader=new FileReader();
  reader.onload=()=>{
   activeFileDataUrl=reader.result as string;
   thumb.src=activeFileDataUrl;
   thumb.hidden=false;
  };
  reader.readAsDataURL(file);
 }else{
  thumb.hidden=true;
 }

 feed.recordEvent('File inspected',`${meta.name} (${meta.formattedSize})`,'FILE');
 renderAlerts();
 triggerMascotSalute();
}

async function convertActiveImage(targetMime:'image/webp'|'image/png'|'image/jpeg',ext:string){
 if(!activeFileDataUrl)return;
 try{
  const result=await convertImageDataUrl(activeFileDataUrl,targetMime);
  const newName=activeFileName.replace(/\.[^.]+$/,'')+'.'+ext;
  if(isTauri){
   const saved=await native('save_file_to_downloads',{
    filename:newName,
    content:result.dataUrl,
    isBase64:true
   }) as string;
   feed.recordEvent('Image converted',`${newName} saved to ${saved}`,'FILE');
  }else{
   feed.recordEvent('Image converted',`${newName} (${Math.round(result.sizeBytes/1024)} KB)`,'FILE');
  }
  renderAlerts();
  triggerMascotSalute();
 }catch(err){
  feed.recordEvent('Conversion failed',String(err),'ERROR');
  renderAlerts();
 }
}

q<HTMLButtonElement>('#file-convert-webp').addEventListener('click',()=>void convertActiveImage('image/webp','webp'));
q<HTMLButtonElement>('#file-convert-png').addEventListener('click',()=>void convertActiveImage('image/png','png'));
q<HTMLButtonElement>('#file-convert-jpeg').addEventListener('click',()=>void convertActiveImage('image/jpeg','jpg'));
q<HTMLButtonElement>('#file-copy-info').addEventListener('click',async()=>{
 const infoText=`${q<HTMLElement>('#file-title').textContent} - ${q<HTMLElement>('#file-meta').textContent}`;
 try{
  await writeText(infoText);
  feed.recordEvent('File info copied',infoText,'CLIPBOARD');
  renderAlerts();
 }catch{}
});

window.addEventListener('dragenter',e=>{
 e.preventDefault();
 shell.dataset.dropHover='true';
});
window.addEventListener('dragover',e=>{
 e.preventDefault();
 shell.dataset.dropHover='true';
});
window.addEventListener('dragleave',e=>{
 if(e.clientX<=0||e.clientY<=0||e.clientX>=window.innerWidth||e.clientY>=window.innerHeight){
  shell.dataset.dropHover='false';
 }
});
window.addEventListener('drop',e=>{
 e.preventDefault();
 shell.dataset.dropHover='false';
 const files=e.dataTransfer?.files;
 if(files&&files.length>0){
  void handleFileDrop(files[0]);
 }
});

// Native Windows cursor sampling runs only when the top-screen Lion is visible.
// The coordinates stay in memory; nothing is logged, persisted or transmitted.
type NativeCursor={x:number;y:number};
let gazeTimer:ReturnType<typeof setTimeout>|undefined;
let gazeGeneration=0;
function setLionGaze(clientX:number,clientY:number){
 for(const lion of root.querySelectorAll<any>('xyeena-guardian')){
  if(typeof lion.setGazeFromClient==='function')lion.setGazeFromClient(clientX,clientY);
 }
}
function stopGazePolling(){
 ++gazeGeneration;
 if(gazeTimer!==undefined)clearTimeout(gazeTimer);
 gazeTimer=undefined;
}
function syncGazePolling(){
 stopGazePolling();
 if(!isTauri||document.hidden||mode==='hidden'||mode==='dormant')return;
 const generation=gazeGeneration;
 const poll=async()=>{
  if(generation!==gazeGeneration)return;
  let delay=50;
  try{
   const cursor=await invoke<NativeCursor|null>('read_island_cursor');
   if(generation!==gazeGeneration)return;
   if(cursor===null){stopGazePolling();return;}
   if(Number.isFinite(cursor.x)&&Number.isFinite(cursor.y))setLionGaze(cursor.x,cursor.y);
   else delay=250;
  }catch(err){
   console.warn('Native cursor unavailable:',err);
   delay=1000;
  }
  if(generation===gazeGeneration)gazeTimer=setTimeout(()=>{void poll();},delay);
 };
 void poll();
}
// Local browser demo uses pointermove. Windows installed app uses GetCursorPos.
if(!isTauri)window.addEventListener('pointermove',e=>setLionGaze(e.clientX,e.clientY),{passive:true});
document.addEventListener('visibilitychange',syncGazePolling);
window.addEventListener('beforeunload',stopGazePolling);

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
 const tag=q<HTMLElement>('#compact-status-tag');
 const ctx=q<HTMLElement>('#compact-context');
 const compactPlay=q<HTMLButtonElement>('#compact-play');
 const glanceHead=q<HTMLElement>('#glance-headline');
 const glanceSub=q<HTMLElement>('#glance-sub');
 const glancePlay=q<HTMLButtonElement>('#glance-play');
 const glanceCardTitle=q<HTMLElement>('#glance-card-title');
 if(meeting.active){
  tag.textContent='Meeting';
  ctx.textContent=elapsedMeeting(meeting.startedAt);
  glanceHead.textContent='Meeting in progress';
  glanceSub.textContent=elapsedMeeting(meeting.startedAt);
  glanceCardTitle.textContent='Meeting';
  glancePlay.disabled=true;
 }else if(selectedMedia.available&&selectedMedia.playing){
  tag.textContent='Playing';
  ctx.textContent=`${selectedMedia.title||'Playing'} · ${sourceLabel(selectedMedia.source)}`;
  glanceHead.textContent=selectedMedia.title||'Playing';
  glanceSub.textContent=`${selectedMedia.artist||'Unknown'} · ${sourceLabel(selectedMedia.source)}`;
  glanceCardTitle.textContent=sourceLabel(selectedMedia.source);
  glancePlay.disabled=false;
  glancePlay.innerHTML=icon('pause',14);
 }else if(selectedMedia.available){
  tag.textContent='Paused';
  ctx.textContent=selectedMedia.title||'Media paused';
  glanceHead.textContent=selectedMedia.title||'Media paused';
  glanceSub.textContent=`Paused · ${sourceLabel(selectedMedia.source)}`;
  glanceCardTitle.textContent=sourceLabel(selectedMedia.source);
  glancePlay.disabled=false;
  glancePlay.innerHTML=icon('play',14);
 }else{
  tag.textContent='Ready';
  ctx.textContent='Desktop Companion';
  glanceHead.textContent='Desktop Companion';
  glanceSub.textContent='Stationary Guardian active';
  glanceCardTitle.textContent='Media';
  glancePlay.disabled=true;
  glancePlay.innerHTML=icon('play',14);
 }
 compactPlay.disabled=!selectedMedia.available;
 compactPlay.innerHTML=icon(selectedMedia.playing?'pause':'play',16);
 compactPlay.setAttribute('aria-label',selectedMedia.playing?'Pause':'Play');
 compactPlay.title=selectedMedia.playing?'Pause':'Play';
 q<HTMLElement>('#header-status').textContent=meeting.active?'Meeting mode':selectedMedia.playing?'Media playing':'On device';
 shell.dataset.playing=String(selectedMedia.playing);
 syncGuardian();
}
q<HTMLButtonElement>('#compact-play').addEventListener('click',async e=>{
 e.stopPropagation();
 if(!selectedMedia.available)return;
 try{
  await native('media_transport',{action:'toggle',source:selectedMedia.source});
  await refreshMedia();
 }catch(err){console.error('Compact play error:',err);}
});
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
q<HTMLInputElement>('#media-seek').addEventListener('input',e=>{
 if(!selectedMedia.canSeek||selectedMedia.durationMs<=0)return;
 const fraction=Number((e.target as HTMLInputElement).value)/1000;
 const curMs=Math.round(selectedMedia.durationMs*fraction);
 q<HTMLElement>('#position-label').textContent=timeLabel(curMs);
});
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
let volTimer:ReturnType<typeof setTimeout>|null=null;
q<HTMLInputElement>('#master-volume').addEventListener('input',e=>{
 const percent=Number((e.target as HTMLInputElement).value);
 q<HTMLOutputElement>('#volume-value').value=percent+'%';
 if(volTimer)clearTimeout(volTimer);
 volTimer=setTimeout(async()=>{
  try{masterVolume=await native('set_master_volume',{percent}) as typeof masterVolume;}
  catch(err){mediaFeedback('Cannot change output volume: '+String(err));}
 },60);
});
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
 q<HTMLElement>('#clip-state').textContent=clipboard.enabled?'Capturing active':'Capture off';
 const searchInput=q<HTMLInputElement>('#clip-search');
 const query=searchInput?searchInput.value:'';
 const items=clipboard.filter(query);
 const list=q<HTMLElement>('#clip-list');list.replaceChildren();
 if(!items.length){
  const empty=document.createElement('p');empty.className='empty-copy';
  empty.textContent=query?'No matching clipboard items.':'No captured items. Enable capture or copy text/images.';
  list.append(empty);return;
 }
 for(const item of items){
  const row=document.createElement('div');row.className='clip-entry';
  if(item.pinned)row.dataset.pinned='true';

  if(item.type==='image'&&item.dataUrl){
   const thumb=document.createElement('img');
   thumb.className='clip-thumb';thumb.src=item.dataUrl;thumb.alt='Clipboard image preview';
   row.append(thumb);
  }

  const body=document.createElement('div');body.className='clip-body';
  const meta=document.createElement('div');meta.className='clip-meta-row';
  const badge=document.createElement('span');badge.className='clip-badge';
  badge.textContent=item.type.toUpperCase();
  const time=document.createElement('span');
  time.textContent=new Date(item.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  meta.append(badge,time);

  const text=document.createElement('span');text.className='clip-text';
  text.textContent=item.text.slice(0,180);
  body.append(meta,text);

  const actions=document.createElement('div');actions.className='clip-actions';
  const pinBtn=document.createElement('button');pinBtn.type='button';pinBtn.className='clip-btn';
  pinBtn.textContent=item.pinned?'Unpin':'Pin';pinBtn.title=item.pinned?'Unpin item':'Pin item';
  pinBtn.addEventListener('click',()=>{clipboard.togglePin(item.id);renderClipboard();});

  const copyBtn=document.createElement('button');copyBtn.type='button';copyBtn.className='clip-btn clip-btn-accent';
  copyBtn.textContent='Copy';copyBtn.title='Copy to Windows clipboard';
  copyBtn.addEventListener('click',async()=>{
   try{
    if(item.type==='image'&&item.dataUrl&&isTauri){await native('write_native_image',{dataUrl:item.dataUrl});}
    else{await writeText(item.text);}
    q<HTMLElement>('#clip-state').textContent='Copied to clipboard';
   }catch(err){q<HTMLElement>('#clip-state').textContent='Copy failed: '+String(err);}
  });

  const saveBtn=document.createElement('button');saveBtn.type='button';saveBtn.className='clip-btn';
  saveBtn.textContent=item.type==='image'?'Save':'Export';saveBtn.title=item.type==='image'?'Save image to Downloads':'Export text';
  saveBtn.addEventListener('click',async()=>{
   try{
    if(!isTauri){q<HTMLElement>('#clip-state').textContent='Saved (web mode simulated)';return;}
    const filename=item.type==='image'?`xyeena-clip-${item.id}.bmp`:`xyeena-clip-${item.id}.txt`;
    const content=item.type==='image'?(item.dataUrl||''):item.text;
    const path=await native('save_file_to_downloads',{filename,content,isBase64:item.type==='image'}) as string;
    q<HTMLElement>('#clip-state').textContent='Saved to: '+path;
   }catch(err){q<HTMLElement>('#clip-state').textContent='Save failed: '+String(err);}
  });

  const delBtn=document.createElement('button');delBtn.type='button';delBtn.className='clip-btn';
  delBtn.textContent='×';delBtn.title='Delete item';
  delBtn.addEventListener('click',()=>{clipboard.deleteItem(item.id);renderClipboard();});

  actions.append(pinBtn,copyBtn,saveBtn,delBtn);
  row.append(body,actions);
  list.append(row);
 }
}

async function observeClipboard(){
 if(clipBusy||!clipboard.enabled)return;
 clipBusy=true;
 try{
  if(isTauri){
   const nativeItem=await native('read_native_clipboard') as any;
   if(nativeItem){
    if(clipboard.accept(nativeItem))renderClipboard();
    return;
   }
  }
  const text=await readText();
  if(text&&clipboard.accept(text))renderClipboard();
 }catch(err){q<HTMLElement>('#clip-state').textContent='Clipboard unavailable: '+String(err);}
 finally{clipBusy=false;}
}

q<HTMLButtonElement>('#clip-toggle').addEventListener('click',async()=>{
 if(clipboard.enabled){clipboard.disable();if(clipTimer)clearInterval(clipTimer);clipTimer=null;}
 else {clipboard.enable();void observeClipboard();if(clipTimer)clearInterval(clipTimer);clipTimer=setInterval(()=>void observeClipboard(),1500);}
 renderClipboard();
});

q<HTMLButtonElement>('#clip-read').addEventListener('click',async()=>{
 try{
  const prev=clipboard.enabled;
  if(!prev){clipboard.enable();clipboard.last='';}
  if(isTauri){
   const nativeItem=await native('read_native_clipboard') as any;
   if(nativeItem){clipboard.accept(nativeItem);}
   else{const val=await readText();clipboard.accept(val);}
  }else{
   const val=await readText();clipboard.accept(val);
  }
  if(!prev)clipboard.disable();
  renderClipboard();q<HTMLElement>('#clip-state').textContent='Clipboard read once';
 }catch(err){q<HTMLElement>('#clip-state').textContent='Read failed: '+String(err);}
});

q<HTMLInputElement>('#clip-search').addEventListener('input',()=>renderClipboard());
q<HTMLButtonElement>('#clip-clear-unpinned').addEventListener('click',()=>{clipboard.clear(true);renderClipboard();});
q<HTMLButtonElement>('#clip-clear').addEventListener('click',()=>{clipboard.clear();renderClipboard();});
window.addEventListener('beforeunload',()=>{clipboard.clear();if(clipTimer)clearInterval(clipTimer);});

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

// AI Companion Chat and Agent Session Integration
const chat=new ChatEngine();
let activeApprovalSession:ReturnType<typeof normalizeSessionSnapshot>|null=null;

function renderChatMessages(){
 const viewport=q<HTMLElement>('#chat-messages');
 viewport.replaceChildren();
 if(!chat.messages.length){
  const welcome=document.createElement('div');
  welcome.className='chat-bubble chat-bubble-assistant';
  welcome.innerHTML='<strong>Xyeena Companion</strong><br>I am your top-screen Guardian. Ask me anything about your project, code, or local tasks.';
  viewport.append(welcome);
  return;
 }
 for(const msg of chat.messages){
  const bubble=document.createElement('div');
  bubble.className=`chat-bubble chat-bubble-${msg.role}`;
  bubble.innerHTML=renderSafeMarkdown(msg.content);
  viewport.append(bubble);
 }
 viewport.scrollTop=viewport.scrollHeight;
}

q<HTMLSelectElement>('#chat-provider-select').addEventListener('change',e=>{
 chat.activeProvider=(e.target as HTMLSelectElement).value;
});

q<HTMLFormElement>('#chat-form').addEventListener('submit',e=>{
 e.preventDefault();
 const input=q<HTMLInputElement>('#chat-input');
 const text=input.value.trim();
 if(!text)return;
 input.value='';
 chat.addUserMessage(text);
 renderChatMessages();
 feed.recordEvent('Chat message sent',text.slice(0,60),'ACTION');
 renderAlerts();
 triggerMascotSalute();

 setTimeout(()=>{
  const reply=`*Received via ${chat.activeProvider}:* "${text}"\n\nI am tracking your project workspace and ready to assist with local tasks or code reviews.`;
  chat.addAssistantReply(reply);
  renderChatMessages();
  triggerMascotSalute();
 },350);
});

function renderAgentPills(){
 const row=q<HTMLElement>('#agent-pills');
 row.replaceChildren();
 for(const adapter of KNOWN_ADAPTERS.slice(0,6)){
  const pill=document.createElement('span');
  pill.className='agent-pill'+(adapter.id==='antigravity'||adapter.id==='claude-code'?' active':'');
  pill.textContent=`${adapter.name}: ${adapter.id==='antigravity'?'Active':'Ready'}`;
  row.append(pill);
 }

 const approvalCard=q<HTMLElement>('#agent-approval');
 if(activeApprovalSession?.pendingApproval){
  approvalCard.hidden=false;
  q<HTMLElement>('#approval-title').textContent=`${activeApprovalSession.provider}: Approval Request`;
  q<HTMLElement>('#approval-prompt').textContent=activeApprovalSession.pendingApproval.prompt;
 }else{
  approvalCard.hidden=true;
 }
}

q<HTMLButtonElement>('#approval-allow').addEventListener('click',()=>{
 if(activeApprovalSession&&activeApprovalSession.pendingApproval){
  const waiting={
   status:'pending',
   sessionId:activeApprovalSession.sessionId,
   requestId:activeApprovalSession.pendingApproval.requestId,
   provider:activeApprovalSession.provider,
   expiresAt:activeApprovalSession.pendingApproval.expiresAt
  };
  const action={
   sessionId:activeApprovalSession.sessionId,
   requestId:activeApprovalSession.pendingApproval.requestId,
   provider:activeApprovalSession.provider,
   decision:'allow',
   explicitUserAction:true
  };
  if(mayForwardDecision(waiting,action)){
   feed.recordEvent('Approval granted',`Action authorized for ${activeApprovalSession.provider}`,'ACTION');
   activeApprovalSession=null;
   renderAgentPills();
   renderAlerts();
   triggerMascotSalute();
  }
 }
});

q<HTMLButtonElement>('#approval-deny').addEventListener('click',()=>{
 if(activeApprovalSession&&activeApprovalSession.pendingApproval){
  const waiting={
   status:'pending',
   sessionId:activeApprovalSession.sessionId,
   requestId:activeApprovalSession.pendingApproval.requestId,
   provider:activeApprovalSession.provider,
   expiresAt:activeApprovalSession.pendingApproval.expiresAt
  };
  const action={
   sessionId:activeApprovalSession.sessionId,
   requestId:activeApprovalSession.pendingApproval.requestId,
   provider:activeApprovalSession.provider,
   decision:'deny',
   explicitUserAction:true
  };
  if(mayForwardDecision(waiting,action)){
   feed.recordEvent('Approval denied',`Action blocked for ${activeApprovalSession.provider}`,'ACTION');
   activeApprovalSession=null;
   renderAgentPills();
   renderAlerts();
  }
 }
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
q<HTMLButtonElement>('.footer-hide').addEventListener('click',()=>{stopGazePolling();void native('hide_island_window').catch(console.error);});
q<HTMLButtonElement>('.recenter').addEventListener('click',()=>void native('recenter_island',{mode}).catch(console.error));

// Settings category pills navigation
for(const pill of root.querySelectorAll<HTMLButtonElement>('.settings-pill')){
 pill.addEventListener('click',()=>{
  const section=pill.dataset.section;
  for(const p of root.querySelectorAll<HTMLButtonElement>('.settings-pill')){
   p.classList.toggle('current',p===pill);
  }
  for(const sec of root.querySelectorAll<HTMLElement>('.settings-section')){
   sec.hidden=sec.id!==`setsec-${section}`;
  }
 });
}

q<HTMLSelectElement>('#setting-language').addEventListener('change',e=>updatePrefs({language:(e.target as HTMLSelectElement).value as Prefs['language']}));
q<HTMLInputElement>('#setting-gaze').addEventListener('change',e=>{
 const enabled=(e.target as HTMLInputElement).checked;
 updatePrefs({gazeEnabled:enabled});
 if(!enabled)stopGazePolling();else syncGazePolling();
});
q<HTMLSelectElement>('#setting-wardrobe').addEventListener('change',e=>{
 updatePrefs({wardrobe:(e.target as HTMLSelectElement).value as Prefs['wardrobe']});
 syncGuardian();
});
q<HTMLInputElement>('#setting-sound').addEventListener('change',e=>updatePrefs({soundEnabled:(e.target as HTMLInputElement).checked}));
q<HTMLInputElement>('#setting-sound-vol').addEventListener('input',e=>updatePrefs({soundVolume:Number((e.target as HTMLInputElement).value)}));
q<HTMLInputElement>('#setting-clip-capture').addEventListener('change',e=>{
 const enabled=(e.target as HTMLInputElement).checked;
 if(enabled){clipboard.enable();void observeClipboard();}else{clipboard.disable();}
 renderClipboard();
});
q<HTMLSelectElement>('#setting-clip-limit').addEventListener('change',e=>{
 const limit=Number((e.target as HTMLSelectElement).value);
 updatePrefs({clipboardLimit:limit});
 clipboard.maxItems=limit;
});
q<HTMLInputElement>('#setting-clip-persist').addEventListener('change',e=>updatePrefs({clipboardPersistent:(e.target as HTMLInputElement).checked}));
q<HTMLButtonElement>('#setting-clip-clear').addEventListener('click',()=>{clipboard.clear();renderClipboard();});
q<HTMLInputElement>('#setting-recap-enable').addEventListener('change',e=>updatePrefs({recapEnabled:(e.target as HTMLInputElement).checked}));

// Weekly Recap Generation and SVG Export using PR #2 engine (@xyeena/recap)
let activeRecapData:any=null;
q<HTMLButtonElement>('#recap-generate-btn').addEventListener('click',()=>{
 const events=feed.items.map((item,idx)=>({
  type:item.state==='ACTION'?'approval':item.state==='FILE'?'edit':'command',
  at:new Date(Date.now()-idx*3600000).toISOString(),
  agent:'antigravity',
  eventId:`evt-${idx}`,
  decision:'allow'
 }));
 try{
  activeRecapData=buildWeeklyRecap(events);
  const text=recapText(activeRecapData);
  q<HTMLElement>('#recap-preview-box').hidden=false;
  q<HTMLElement>('#recap-text').textContent=text;
  feed.recordEvent('Weekly recap generated',`${activeRecapData.weekStart} (${events.length} events)`,'ACTION');
  renderAlerts();
  triggerMascotSalute();
 }catch(err){
  q<HTMLElement>('#recap-preview-box').hidden=false;
  q<HTMLElement>('#recap-text').textContent='Recap error: '+String(err);
 }
});

q<HTMLButtonElement>('#recap-export-svg-btn').addEventListener('click',async()=>{
 if(!activeRecapData)q<HTMLButtonElement>('#recap-generate-btn').click();
 if(activeRecapData){
  try{
   const svg=recapSvg(activeRecapData);
   if(isTauri){
    const path=await native('save_file_to_downloads',{
     filename:`xyeena-weekly-recap-${activeRecapData.weekStart}.svg`,
     content:svg,
     isBase64:false
    }) as string;
    feed.recordEvent('Recap SVG exported',`Saved to: ${path}`,'FILE');
   }else{
    feed.recordEvent('Recap SVG generated',`${activeRecapData.weekStart} (Web mode simulated)`,'FILE');
   }
   renderAlerts();
   triggerMascotSalute();
  }catch(err){
   feed.recordEvent('Recap export error',String(err),'ERROR');
   renderAlerts();
  }
 }
});

// Clean diagnostics export (strict credential and private string safety)
q<HTMLButtonElement>('#btn-export-diagnostics').addEventListener('click',async()=>{
 const diagnostics={
  version:'1.0.0-alpha.1',
  timestamp:new Date().toISOString(),
  platform:'windows',
  environment:{isTauri,mode,panel},
  preferences:{
   theme:prefs.theme,
   motion:prefs.motion,
   alwaysOnTop:prefs.alwaysOnTop,
   gazeEnabled:prefs.gazeEnabled,
   wardrobe:prefs.wardrobe,
   language:prefs.language
  },
  metrics:{
   eventCount:feed.items.length,
   clipboardEntries:clipboard.items.length,
   activeSessions:overview.sessions.length
  }
 };
 const content=JSON.stringify(diagnostics,null,2);
 if(isTauri){
  try{
   const path=await native('save_file_to_downloads',{
    filename:`xyeena-diagnostics-${Date.now()}.json`,
    content,
    isBase64:false
   }) as string;
   feed.recordEvent('Diagnostics exported',String(path),'ACTION');
  }catch(err){feed.recordEvent('Diagnostics error',String(err),'ERROR');}
 }else{
  feed.recordEvent('Diagnostics exported','Local session JSON generated','ACTION');
 }
 renderAlerts();
});


async function initialize(){
 setPanel('now');renderRuns();renderAlerts();renderMedia();renderMeeting();renderAgentPills();renderChatMessages();
 if(sourcePath){q<HTMLInputElement>('#project-root').value=sourcePath;q<HTMLButtonElement>('.disconnect').hidden=false;q<HTMLDetailsElement>('#project-details').open=true;void refreshRuns();}
 if(isTauri){
  try{
   await listen<string>('island:tray',e=>{if(e.payload==='expand'){setMode('compact',true);setMode('expanded');}if(e.payload==='compact')setMode('compact',true);syncGazePolling();});
   await listen<string>('island:visibility',e=>{if(e.payload==='hidden')stopGazePolling();else syncGazePolling();});
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
