import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {isPermissionGranted,requestPermission,sendNotification} from '@tauri-apps/plugin-notification';
import {readText,writeText} from '@tauri-apps/plugin-clipboard-manager';
import {ClipboardHistory} from './core/clipboard.mjs';
import {providerCredentials} from './core/provider-credentials.mjs';
import {timeLabel} from './core/media.mjs';
import {transition,shellDimensions} from './core/island-machine.mjs';
import type {IslandMode,IslandEvent} from './core/island-machine.mjs';
import {GeometryMotion,validFrame} from './core/motion.mjs';
import {DEFAULT_SETTINGS,STORAGE_KEY,sanitizeSettings} from './core/settings.mjs';
import {normalizeRuns} from './core/run-summaries.mjs';
import {normalizeSessions,pickSession,sourceLabel} from './core/media-sessions.mjs';
import {sessionStore} from './core/session-store.mjs';
import type {NativeAgentEvent,NativeSessionSnapshot,MonitoredSession,ApprovalSnapshot} from './core/session-store.d.mts';
import {RunChangeFeed} from './core/notifications.mjs';
import {chooseGuardianState,toMascotState,guardianStatus,defineXyeenaGuardian} from './core/mascot.mjs';
import {inspectFile,convertImageDataUrl} from './core/files.mjs';
import {ChatEngine,AI_PROVIDERS,renderSafeMarkdown,ApiError} from './core/ai-chat.mjs';
import {KNOWN_ADAPTERS,getAdapter,normalizeSessionSnapshot} from './core/agent-adapters.mjs';
import {mayForwardDecision} from './core/agent-events.mjs';
import {buildWeeklyRecap,recapText,recapSvg} from '@xyeena/recap';
import {icon} from './core/icons.mjs';
import {SUPPORTED_INTEGRATIONS,normalizeGitHubStatus,normalizeIntegrationResult} from './core/integrations.mjs';
import {DEFAULT_SNIPPETS,cleanDictatedText,expandSnippets,updateDictationStats,FlowDictationController} from './core/flow.mjs';
import './style.css';

defineXyeenaGuardian();

type Panel='now'|'clipboard'|'activity'|'chat'|'preferences';
const PANEL_HEIGHTS: Record<Panel, number> = {
 now: 396,
 clipboard: 340,
 activity: 360,
 chat: 420,
 preferences: 420
};
let lastPrimaryPanel: Panel = 'now';
type Prefs=ReturnType<typeof sanitizeSettings>;
type MediaOverview=ReturnType<typeof normalizeSessions>;
type Media=ReturnType<typeof pickSession>;
const root=document.querySelector<HTMLElement>('#app')!;
const isTauri='__TAURI_INTERNALS__' in window;
document.body.dataset.tauri=String(isTauri);


root.innerHTML=`
<div class="island" data-mode="compact" data-panel="now" role="region" aria-label="Xyeena Island">
 <div class="notch-shoulder notch-shoulder-left" aria-hidden="true">
   <svg width="17" height="16" viewBox="0 0 17 16" fill="none">
     <path class="shoulder-fill" d="M 0 0 C 8.8 0, 16 7.2, 16 16 L 17 16 L 17 0 L 16 0 Z"/>
     <path class="shoulder-rim" d="M 0 0 C 8.8 0, 16 7.2, 16 16"/>
   </svg>
 </div>
 <div class="notch-shoulder notch-shoulder-right" aria-hidden="true">
   <svg width="17" height="16" viewBox="0 0 17 16" fill="none">
     <path class="shoulder-fill" d="M 0 0 L 0 16 L 1 16 C 1 7.2, 8.2 0, 17 0 Z"/>
     <path class="shoulder-rim" d="M 1 16 C 1 7.2, 8.2 0, 17 0"/>
   </svg>
 </div>
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
      <xyeena-guardian id="header-guardian" size="54" interactive animated></xyeena-guardian>
    </span>
    <div class="header-titles"><strong>Xyeena Island</strong><span class="header-status" id="header-status">On device</span></div>
    <button class="icon-btn pin" type="button" aria-label="Pin Island" aria-pressed="false" title="Keep expanded">${icon('pin',16)}</button>
    <button class="icon-btn collapse" type="button" aria-label="Collapse Island" title="Collapse">${icon('chevron',18)}</button>
  </header>
  <nav class="navigation" role="tablist" aria-label="Island sections">
   <button class="nav-tab current" role="tab" data-panel="now" aria-controls="page-now" aria-selected="true" type="button">Now</button>
   <button class="nav-tab" role="tab" data-panel="clipboard" aria-controls="page-clipboard" aria-selected="false" type="button">Clips</button>
   <button class="nav-tab" role="tab" data-panel="activity" aria-controls="page-activity" aria-selected="false" type="button">Agents <span class="nav-unread" id="unread" hidden></span></button>
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
       <button class="file-action-btn" id="file-open-editor" type="button" hidden>Open in Editor</button>
       <button class="file-action-btn" id="file-ask-xyn" type="button">Ask Xyn</button>
       <button class="file-action-btn" id="file-copy-info" type="button">Copy Info</button>
     </div>
    </div>
   </section>
    <section class="page" id="page-clipboard" role="tabpanel" hidden>
      <div class="section-heading"><div><span class="kicker" id="clip-kicker">ON-DEVICE CLIPBOARD</span><h1 id="clip-heading">Clipboard History</h1></div><div class="clip-actions"><button id="clip-clear-unpinned" class="minor-btn" type="button">Clear unpinned</button><button id="clip-clear" class="minor-btn" type="button">Clear all</button></div></div>
      <p class="explain clip-warning" id="clip-explain">In-memory history for text, images, and file lists. Sensitive tokens are best-effort filtered. Clears on exit for privacy.</p>
      <div class="clip-controls"><button id="clip-toggle" class="toggle-btn" aria-pressed="false" type="button">Enable capture</button><button id="clip-read" class="minor-btn" type="button">Read once</button><span id="clip-state" role="status">Capture off</span></div>
      <div class="clip-search-bar">${icon('search',14)}<input id="clip-search" type="search" placeholder="Search clipboard history..." aria-label="Search clips"></div>
      <div id="clip-list" class="clip-list" aria-label="Clipboard history"></div>
    </section>
    <section class="page" id="page-activity" role="tabpanel" hidden>
     <div class="section-heading"><div><span class="kicker" id="act-kicker">CODING AGENTS</span><h1 id="act-heading">Agent Sessions</h1></div><button class="minor-btn" id="refresh-activity-btn" type="button">${icon('refresh',14)} Refresh</button></div>
     <div class="agent-pills-row" id="agent-pills" aria-label="Detected agent sessions"></div>
     <div id="session-detail-card" class="session-detail-card" hidden>
       <div class="session-card-header">
         <div class="session-provider-info">
           <span id="session-provider-icon"></span>
           <strong id="session-provider-name">Agent</strong>
           <span id="session-status-dot" class="status-dot"></span>
           <span id="session-status-text" class="status-text">Thinking</span>
         </div>
         <span id="session-workspace" class="session-workspace-badge"></span>
       </div>
       <div class="session-nav-actions" id="session-nav-actions">
         <button id="btn-open-editor" class="file-action-btn" type="button" title="Open workspace in Editor">${icon('folder',13)} Editor</button>
         <button id="btn-open-terminal" class="file-action-btn" type="button" title="Open terminal in workspace">${icon('activity',13)} Terminal</button>
         <button id="btn-workspace-diff" class="file-action-btn" type="button" title="Preview workspace git diff">${icon('copy',13)} Diff</button>
       </div>
       <div id="session-telemetry-bar" class="session-telemetry-bar">
         <span id="session-telemetry-duration" class="telemetry-pill">0s</span>
         <span id="session-telemetry-events" class="telemetry-pill">0 events</span>
         <span id="session-telemetry-files" class="telemetry-pill">0 files</span>
         <span id="session-telemetry-usage" class="telemetry-pill">Telemetry: Live</span>
       </div>
       <div id="session-files-ticker" class="session-files-ticker" hidden>
         <div class="ticker-header">
           <span>${icon('folder',12)} Touched Files (<span id="session-files-count">0</span>)</span>
         </div>
         <div id="session-files-list" class="session-files-list"></div>
       </div>
       <div id="session-diff-drawer" class="session-diff-drawer" hidden>
         <div class="diff-drawer-header">
           <span id="diff-drawer-title">Git Diff</span>
           <button id="btn-close-diff" class="session-file-btn" type="button">Close</button>
         </div>
         <div id="diff-drawer-warning" class="diff-drawer-warning" hidden></div>
         <pre id="diff-drawer-content" class="diff-drawer-content"></pre>
       </div>
        <div id="session-approval-box" class="session-approval-box" hidden>
          <div class="session-approval-header">
            <span class="session-approval-badge">${icon('shield',14)} Approval Requested</span>
            <span id="session-approval-time" class="clock"></span>
          </div>
          <div id="session-approval-question" class="session-approval-question"></div>
          <div id="session-approval-options" class="session-approval-options" hidden></div>
          <div class="session-approval-actions" id="session-approval-actions">
            <button id="btn-approval-allow-once" class="file-action-btn file-action-accent" type="button">Allow Once</button>
            <button id="btn-approval-deny" class="file-action-btn file-action-danger" type="button">Deny</button>
          </div>
          <p id="session-approval-status" class="session-approval-status" role="status"></p>
        </div>
       <div id="session-tool-box" class="session-tool-box" hidden>
         <div class="session-tool-header">
           <span id="session-tool-name">tool</span>
           <span id="session-tool-time" class="clock"></span>
         </div>
         <div id="session-tool-command" class="session-tool-command"></div>
       </div>
       <div id="session-events-timeline" class="session-events-timeline"></div>
     </div>
     <div id="no-sessions-card" class="no-sessions-card">
       <span aria-hidden="true">${icon('activity', 28)}</span>
       <strong>No Active Agent Sessions</strong>
       <p>Waiting for events from Antigravity IDE, Claude Code, or local CLI agents over Windows Named Pipe.</p>
       <button class="minor-btn" id="btn-open-hook-settings" type="button">${icon('sliders', 14)} Configure Provider Hooks</button>
     </div>
     <p class="explain" id="alerts-explain">Real local events, agent sessions, and toast alerts appear here.</p>
     <div class="history alert-history" id="alerts"></div>
     <details class="project-details" id="project-details">
       <summary id="proj-summary">Connect Xyeena Agentic project <span>Optional</span></summary>
       <p class="explain activity-explain" id="proj-explain">Projects need Xyeena Agentic run snapshots. Island doesn't create runs or install hooks.</p>
       <div class="path-row"><label class="path-wrap">${icon('folder',16)}<input id="project-root" type="text" placeholder="Absolute project folder" aria-label="Absolute path to Xyeena project" spellcheck="false" autocomplete="off"/></label><button class="action-btn connect" type="button">Connect</button></div>
       <p class="status-line" id="project-status" role="status">Not connected</p>
       <div id="runs" class="history"></div>
       <button class="minor-btn disconnect" type="button" hidden>Disconnect</button>
     </details>
    </section>
    <section class="page" id="page-chat" role="tabpanel" hidden>
      <div class="section-heading chat-header-hero">
        <div class="chat-hero-titles">
          <span class="kicker" id="chat-kicker">COMPANION CHAT</span>
          <h1 id="chat-heading">Chat with Xyn</h1>
          <span class="chat-hero-sub" id="chat-xyn-status">Watching your workspace · Standing guard</span>
        </div>
        <div class="chat-provider-badge-wrap">
          <select id="chat-provider-select" aria-label="AI Provider" class="chat-provider-dropdown" title="Select AI Provider">
            <option value="gemini">Google Gemini</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="lmstudio">LM Studio (Local)</option>
          </select>
        </div>
      </div>
      <div id="chat-inline-setup" class="chat-setup-box" hidden>
        <div class="chat-setup-header">
          <strong id="chat-setup-title">API Key Required</strong>
          <span class="chat-setup-sub">Stored in session memory only (BYOK). Never logged or exported.</span>
        </div>
        <div class="chat-setup-input-row">
          <input type="password" id="chat-inline-key-input" placeholder="Paste API key here..." autocomplete="off" spellcheck="false" aria-label="API key input">
          <button class="action-btn" type="button" id="btn-save-inline-key">Save Key</button>
        </div>
      </div>
      <div class="chat-viewport" id="chat-messages" aria-live="polite"></div>
      <form class="chat-input-row" id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="Ask Xyn anything (Enter to send, Shift+Enter for new line)..." autocomplete="off" spellcheck="false" aria-label="Chat input"></textarea>
        <button class="action-btn" type="submit" id="chat-send">Send</button>
        <button class="minor-btn" type="button" id="chat-stop" hidden title="Stop generation">Stop</button>
      </form>
    </section>
    <section class="page" id="page-preferences" role="tabpanel" hidden>
      <div class="section-heading">
        <div><span class="kicker settings-kicker" id="set-kicker">PREFERENCES</span><h1 id="set-heading">Settings</h1></div>
      </div>
      <div class="settings-nav-pills" id="settings-pills">
        <button class="settings-pill current" type="button" data-section="general">General</button>
        <button class="settings-pill" type="button" data-section="guardian">Guardian</button>
        <button class="settings-pill" type="button" data-section="clipboard">Clipboard</button>
        <button class="settings-pill" type="button" data-section="media">Media</button>
        <button class="settings-pill" type="button" data-section="ai">AI & Agents</button>
        <button class="settings-pill" type="button" data-section="integrations">Integrations</button>
        <button class="settings-pill" type="button" data-section="flow">Flow Dictation</button>
        <button class="settings-pill" type="button" data-section="recap">Weekly Recap</button>
        <button class="settings-pill" type="button" data-section="about">About & Hotkeys</button>
      </div>

      <div class="settings-section" id="setsec-general">
        <div class="setting"><span><strong>Keep above windows</strong><small>Always on top</small></span><input type="checkbox" id="always-top" aria-label="Always on top"></div>
        <div class="setting"><span><strong>Collapse on pointer exit</strong><small>Auto-collapse to compact</small></span><input type="checkbox" id="auto-collapse" aria-label="Auto-collapse"></div>
        <div class="setting"><span><strong>Auto-hide compact view</strong><small>Reveal via wake strip</small></span><input type="checkbox" id="auto-hide" aria-label="Auto-hide"></div>
        <div class="setting"><span><strong>Appearance</strong><small>System, dark, or light theme</small></span><select id="theme" aria-label="Appearance"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
        <div class="setting"><span><strong>Interface language</strong><small>Application display language</small></span><select id="setting-language" aria-label="Interface language"><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></div>
        <div class="setting"><span><strong>Start with Windows</strong><small>Launch on user login (Windows startup apps)</small></span><span class="badge-tag">Windows Managed</span></div>
      </div>

      <div class="settings-section" id="setsec-guardian" hidden>
        <div class="setting"><span><strong>Global cursor gaze</strong><small>Follow Windows cursor</small></span><input type="checkbox" id="setting-gaze" aria-label="Gaze tracking" checked></div>
        <div class="setting"><span><strong>Reduced motion</strong><small>Disable window spring motion</small></span><input type="checkbox" id="reduce-motion" aria-label="Reduced motion"></div>
        <div class="setting"><span><strong>Original wardrobe</strong><small>Concept art accessories</small></span><select id="setting-wardrobe" aria-label="Original wardrobe"><option value="standard">Standard (Shield)</option><option value="visor">Cyber Visor</option><option value="crown">Golden Crown</option><option value="headset">Studio Headset</option><option value="shield">Silver Aegis</option></select></div>
        <div class="setting"><span><strong>Sound feedback</strong><small>Subtle audio effects on interaction</small></span><input type="checkbox" id="setting-sound" aria-label="Sound feedback" checked></div>
        <div class="setting"><span><strong>Sound volume</strong><small>Effect volume level</small></span><input type="range" id="setting-sound-vol" min="0" max="100" value="70" aria-label="Sound volume"></div>
      </div>

      <div class="settings-section" id="setsec-clipboard" hidden>
        <div class="setting"><span><strong>Capture toggle</strong><small>Listen for Windows clipboard</small></span><input type="checkbox" id="setting-clip-capture" aria-label="Capture toggle"></div>
        <div class="setting"><span><strong>Max history entries</strong><small>Bounded memory retention</small></span><select id="setting-clip-limit" aria-label="Max history entries"><option value="20">20 items</option><option value="50">50 items</option><option value="100">100 items</option></select></div>
        <div class="setting"><span><strong>Storage mode</strong><small>Session memory only. Clears on exit for privacy</small></span><span class="badge-tag">Session Memory</span></div>
        <div class="setting"><span><strong>Supported formats</strong><small>Text, BMP/PNG images, file lists</small></span><span class="badge-tag">Native Win32</span></div>
        <div class="setting"><span><strong>Clear history</strong><small>Remove all captured items</small></span><button class="minor-btn" id="setting-clip-clear" type="button">Clear history</button></div>
      </div>

      <div class="settings-section" id="setsec-media" hidden>
        <div class="setting"><span><strong>Output endpoint</strong><small>Windows default audio</small></span><span class="badge-tag" id="media-device-name">Default Output</span></div>
        <div class="setting"><span><strong>Preferred source</strong><small>Prioritize media player</small></span><select id="setting-media-pref" aria-label="Preferred source"><option value="auto">Automatic (Active)</option><option value="Spotify">Spotify</option><option value="Chrome">Chrome / Edge</option></select></div>
        <div class="setting"><span><strong>Windows run notifications</strong><small>Opt-in for project runs</small></span><input type="checkbox" id="run-notifications" aria-label="Run notifications"></div>
      </div>

      <div class="settings-section" id="setsec-ai" hidden>
        <div class="setting"><span><strong>Companion AI Provider</strong><small>Active chat model endpoint</small></span><select id="setting-ai-provider" aria-label="Companion AI Provider"><option value="gemini">Google Gemini</option><option value="anthropic">Anthropic Claude</option><option value="openai">OpenAI GPT</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama (Local)</option><option value="lmstudio">LM Studio (Local)</option></select></div>
        <div class="setting"><span><strong>Local server endpoint</strong><small>Ollama / LM Studio URL</small></span><input type="text" id="setting-ai-local-url" value="http://localhost:11434" style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--text);width:130px"></div>
        <div class="setting"><span><strong>Provider API Key (BYOK)</strong><small>Session memory; never logged or exported</small></span><input type="password" id="setting-ai-api-key" placeholder="Enter API key" autocomplete="off" spellcheck="false" style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:10px;color:var(--text);width:130px"></div>
        <div class="setting"><span><strong>Credential safety</strong><small>In-memory session key (opt-in BYOK)</small></span><span class="badge-tag" id="badge-ai-creds">Session Memory</span></div>

        <div class="installer-section-header">
          <div>
            <strong class="installer-heading">Agent Provider Hook Installer</strong>
            <small class="installer-sub">Opt-in local hook configuration for Antigravity &amp; IDE agents</small>
          </div>
          <button class="minor-btn" id="btn-detect-providers" type="button">Detect Providers</button>
        </div>
        <div class="setting">
          <span><strong>Target Provider</strong><small id="provider-detect-detail">Detecting installed agents...</small></span>
          <div style="display:flex;gap:6px;align-items:center">
            <select id="installer-provider-select" aria-label="Target Provider">
              <option value="antigravity">Antigravity (AGY)</option>
              <option value="claude-code" disabled>Claude Code (Coming soon)</option>
              <option value="gemini-cli" disabled>Gemini CLI (Unverified)</option>
            </select>
            <span class="badge-tag" id="provider-detect-badge">Checking</span>
          </div>
        </div>
        <div class="setting" style="flex-direction:column;align-items:stretch;gap:6px">
          <span><strong>Workspace Root Path</strong><small>Directory containing .agents/hooks.json</small></span>
          <div class="path-row">
            <label class="path-wrap">
              ${icon('folder',16)}
              <input id="installer-workspace-path" type="text" placeholder="C:\\path\\to\\workspace" spellcheck="false" autocomplete="off" />
            </label>
            <button class="action-btn" id="btn-preview-hooks" type="button">Preview</button>
          </div>
        </div>

        <div id="installer-preview-card" class="installer-preview-card" hidden>
          <div class="installer-preview-header">
            <strong id="installer-action-badge">Install Preview</strong>
            <span id="installer-scope-badge" class="badge-tag">Workspace</span>
          </div>
          <div class="installer-preview-meta">
            <div><strong>Target:</strong> <span id="installer-target-path">.agents/hooks.json</span></div>
            <div><strong>Backup:</strong> <span id="installer-backup-path">.agents/hooks.json.xyeena-notch.bak</span></div>
            <div><strong>Preserved groups:</strong> <span id="installer-preserved-groups">None</span></div>
          </div>
          <div id="installer-warnings-box" class="installer-warning" hidden></div>
          <div class="installer-diff-wrap">
            <span class="installer-diff-label">Configuration to apply (xyeena-notch):</span>
            <pre id="installer-diff-text" class="installer-diff-box"></pre>
          </div>
          <div class="installer-consent-row">
            <label class="installer-consent-label">
              <input type="checkbox" id="installer-consent-check" />
              <span>I approve writing only the <code>xyeena-notch</code> group to this configuration file</span>
            </label>
          </div>
          <div class="installer-btn-row">
            <button class="action-btn" id="btn-install-hooks" type="button" disabled>Install Hooks</button>
            <button class="minor-btn" id="btn-uninstall-hooks" type="button">Uninstall Hooks</button>
          </div>
        </div>
        <p class="status-line" id="installer-status-line" role="status"></p>
      </div>

      <div class="settings-section" id="setsec-integrations" hidden>
        <div class="integration-group-header" style="padding:4px 0 6px;">
          <span class="kicker" style="font-size:9px;color:var(--accent);">GITHUB WORKSPACE REPOSITORY</span>
          <p class="explain" style="padding:2px 0;margin:0;">Read-only pull requests, status check rollups, and recent GitHub Actions workflows.</p>
        </div>

        <div class="setting" style="align-items:center;">
          <span>
            <strong id="github-repo-slug">Repository: inspecting...</strong>
            <small id="github-branch-name" style="display:block;">Branch: —</small>
          </span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="minor-btn" id="github-refresh-btn" type="button">Refresh</button>
            <button class="minor-btn" id="github-open-repo-btn" type="button" hidden>Open Repo</button>
          </div>
        </div>

        <div id="github-pr-container" style="padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:var(--r-md,8px);margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:600;color:var(--text);" id="github-pr-title">No active pull request</span>
            <span class="badge-tag" id="github-pr-badge" hidden>Draft</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <small id="github-pr-meta" style="color:var(--sub);font-size:10px;">Checks: — · Review: —</small>
            <button class="minor-btn" id="github-open-pr-btn" type="button" style="padding:2px 8px;font-size:10px;" hidden>View PR</button>
          </div>
        </div>

        <div id="github-ci-container" style="padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:var(--r-md,8px);margin-bottom:8px;">
          <div style="font-size:10px;font-weight:600;color:var(--sub);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Recent CI Workflow Runs</div>
          <div id="github-runs-list" style="display:flex;flex-direction:column;gap:4px;">
            <small style="color:var(--muted);font-size:10px;">No recent runs loaded</small>
          </div>
        </div>

        <p class="status-line" id="github-status-line" role="status" style="margin-bottom:8px;"></p>

        <div class="integration-group-header" style="padding:6px 0 4px;border-top:1px solid var(--line);">
          <span class="kicker" style="font-size:9px;color:var(--accent);">CONNECTED DEVELOPER SERVICES</span>
          <p class="explain" style="padding:2px 0;margin:0;">Provider-scoped read-only status checks via environment tokens or credentials.</p>
        </div>

        <div id="integrations-list" style="display:flex;flex-direction:column;gap:4px;">
        </div>
      </div>

      <div class="settings-section" id="setsec-flow" hidden>
        <div class="integration-group-header" style="padding:4px 0 6px;">
          <span class="kicker" style="font-size:9px;color:var(--accent);">OFFLINE SPEECH &amp; SNIPPETS</span>
          <p class="explain" style="padding:2px 0;margin:0;">100% on-device speech processing with zero background recording and privacy-preserving text snippets.</p>
        </div>

        <div class="setting">
          <span><strong>Offline speech dictation</strong><small>Push-to-talk voice input via Windows Native Speech</small></span>
          <input type="checkbox" id="setting-flow-enable" aria-label="Enable Flow Dictation">
        </div>
        <div class="setting">
          <span><strong>Push-to-talk mode</strong><small>Listen only while Alt+D is held down</small></span>
          <input type="checkbox" id="setting-flow-push-to-talk" aria-label="Push to talk" checked>
        </div>
        <div class="setting">
          <span><strong>Filter verbal filler words</strong><small>Remove um, uh, ah, like, and clean punctuation</small></span>
          <input type="checkbox" id="setting-flow-filter-fillers" aria-label="Filter verbal filler words" checked>
        </div>
        <div class="setting">
          <span><strong>Engine status</strong><small>On-device capability</small></span>
          <span class="badge-tag" id="flow-engine-badge">Checking...</span>
        </div>
        <div class="setting">
          <span><strong>Global hotkey</strong><small>Windows Push-to-Talk activation</small></span>
          <span class="badge-tag" id="flow-hotkey-badge">Alt+D</span>
        </div>

        <div class="integration-group-header" style="padding:6px 0 4px;border-top:1px solid var(--line);">
          <span class="kicker" style="font-size:9px;color:var(--accent);">USAGE STATISTICS</span>
          <p class="explain" style="padding:2px 0;margin:0;">Authentic local session counts and word metrics (never uploaded).</p>
        </div>
        <div class="setting" style="justify-content:space-between;">
          <span><strong>Dictated sessions</strong><small>Total push-to-talk sessions completed</small></span>
          <span class="badge-tag" id="flow-stat-sessions">0 sessions</span>
        </div>
        <div class="setting" style="justify-content:space-between;">
          <span><strong>Dictated words</strong><small>Total words dictated locally</small></span>
          <span class="badge-tag" id="flow-stat-words">0 words</span>
        </div>

        <div class="integration-group-header" style="padding:6px 0 4px;border-top:1px solid var(--line);">
          <span class="kicker" style="font-size:9px;color:var(--accent);">DICTIONARY SNIPPETS</span>
          <p class="explain" style="padding:2px 0;margin:0;">Automatic text expansions applied after transcription.</p>
        </div>
        <div id="flow-snippets-list" style="display:flex;flex-direction:column;gap:4px;">
        </div>
      </div>

      <div class="settings-section" id="setsec-recap" hidden>
        <div class="setting"><span><strong>Weekly Recap Engine</strong><small>Local aggregation (PR #2)</small></span><input type="checkbox" id="setting-recap-enable" aria-label="Enable Weekly Recap" checked></div>
        <div class="setting"><span><strong>Generate Recap</strong><small>Build local week summary from real activity</small></span><button class="minor-btn" id="recap-generate-btn" type="button">Generate Recap</button></div>
        <div class="setting"><span><strong>Export Recap SVG</strong><small>Save 1080x1920 card</small></span><button class="minor-btn" id="recap-export-svg-btn" type="button">Export SVG</button></div>
        <div id="recap-preview-box" class="recap-preview-box" hidden>
          <pre id="recap-text" class="recap-text"></pre>
        </div>
      </div>

      <div class="settings-section" id="setsec-about" hidden>
        <div class="setting"><span><strong>Keyboard shortcuts</strong><small>Esc: Collapse · ←/→: Switch tab · Enter: Send chat</small></span><span class="badge-tag">In-app</span></div>
        <div class="setting"><span><strong>Test notification</strong><small>Verify native Windows toast alerts</small></span><button class="minor-btn test-notification" type="button">Send Test Toast</button></div>
        <div class="setting"><span><strong>Diagnostic logs</strong><small>Local inspection without credentials</small></span><button class="minor-btn" id="btn-export-diagnostics" type="button">Export Clean Logs</button></div>
        <details class="project-details" id="about-credits" open><summary>About & credits <span>MIT source</span></summary>
          <p class="explain">Xyeena Island 1.0.0-alpha.1 · Balanced Desktop Companion.<br>Xyn is the canonical Golden Lion mascot (@xyeena/xyn).<br>Window motion mathematics adapted from Coucou by Louis Raillé (MIT), with no Coucou/Mochi character, brand or media assets.</p>
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
try{localStorage.removeItem('xyeena-island-meeting-v1');}catch{}
let mode:IslandMode='compact',panel:Panel='now';
const motion=new GeometryMotion(shellDimensions(mode));
const feed=new RunChangeFeed();
let chatMascotState: string | null = null;
function syncActiveGuardian(targetMode:IslandMode){
 const compactG=root.querySelector<any>('#compact-guardian');
 const glanceG=root.querySelector<any>('#glance-guardian');
 const headerG=root.querySelector<any>('#header-guardian');

 if(targetMode==='compact'){
  compactG?.start?.();
  glanceG?.stop?.();
  headerG?.stop?.();
 }else if(targetMode==='glance'){
  glanceG?.start?.();
  compactG?.stop?.();
  headerG?.stop?.();
 }else if(targetMode==='expanded'||targetMode==='pinned'||targetMode==='focused'){
  headerG?.start?.();
  compactG?.stop?.();
  glanceG?.stop?.();
 }else{
  compactG?.stop?.();
  glanceG?.stop?.();
  headerG?.stop?.();
 }
}

function syncGuardian(){
 const agentState=sessionStore.getAggregateState();
 const activeState=agentState==='approval'
  ?'attention'
  :(chatMascotState||chooseGuardianState({agentState,mediaPlaying:selectedMedia.playing,runs,mode}));
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
 syncActiveGuardian(mode);
}
function playFeedbackSound(type:'tap'|'chime'|'error'){
 if(!prefs.soundEnabled||prefs.soundVolume<=0)return;
 try{
  const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;
  if(!AudioCtx)return;
  const ctx=new AudioCtx();
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  const vol=(prefs.soundVolume/100)*0.12;
  gain.gain.setValueAtTime(vol,ctx.currentTime);
  if(type==='chime'){
   osc.type='sine';
   osc.frequency.setValueAtTime(587.33,ctx.currentTime);
   osc.frequency.exponentialRampToValueAtTime(880,ctx.currentTime+0.1);
   gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.22);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start();osc.stop(ctx.currentTime+0.22);
  }else if(type==='tap'){
   osc.type='triangle';
   osc.frequency.setValueAtTime(440,ctx.currentTime);
   gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.06);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start();osc.stop(ctx.currentTime+0.06);
  }else{
   osc.type='sawtooth';
   osc.frequency.setValueAtTime(220,ctx.currentTime);
   gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.15);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start();osc.stop(ctx.currentTime+0.15);
  }
 }catch{}
}

const I18N = {
 en: {
  now:'Now',clips:'Clips',activity:'Activity',chat:'Chat',settings:'Settings',
  chatTitle:'Chat with Xyn',chatKicker:'COMPANION CHAT',chatStatus:'Watching your workspace · Standing guard',
  chatPlaceholder:'Ask Xyn anything (Enter to send, Shift+Enter for new line)...',
  clipHeading:'Clipboard History',clipExplain:'In-memory history for text, images, and file lists. Clears on exit for privacy.',
  pauseCapture:'Pause capture',enableCapture:'Enable capture',monitoringActive:'Monitoring active',captureOff:'Capture off',
  actHeading:'Activity & Agents',setHeading:'Settings',
  chatWelcome:'<strong>Xyn (Golden Lion Guardian)</strong><br>Hello! I am Xyn, your desktop companion on Xyeena Island. What can I help you with across your project, code, or tasks today?'
 },
 id: {
  now:'Sekarang',clips:'Klip',activity:'Aktivitas',chat:'Chat',settings:'Pengaturan',
  chatTitle:'Ngobrol bareng Xyn',chatKicker:'COMPANION CHAT',chatStatus:'Memantau workspace lu · Siaga mendampingi',
  chatPlaceholder:'Tanya apa saja ke Xyn (Enter untuk kirim, Shift+Enter untuk baris baru)...',
  clipHeading:'Riwayat Clipboard',clipExplain:'Riwayat sesi lokal untuk teks, gambar, dan file. Dihapus saat keluar demi privasi.',
  pauseCapture:'Jeda pantauan',enableCapture:'Aktifkan pantauan',monitoringActive:'Pantauan aktif',captureOff:'Pantauan nonaktif',
  actHeading:'Aktivitas & Agen',setHeading:'Pengaturan',
  chatWelcome:'<strong>Xyn (Golden Lion Guardian)</strong><br>Halo! Gue Xyn, penjaga desktop lu di Xyeena Island. Ada yang bisa gue bantu seputar project, coding, atau tugas lu hari ini?'
 }
};

function applyLanguage(lang:Prefs['language']){
 const dict=I18N[lang]||I18N.en;
 for(const tab of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
  const p=tab.dataset.panel as Panel;
  if(p&&dict[p as keyof typeof dict]){
   const badge=tab.querySelector('.nav-unread');
   tab.textContent=dict[p as keyof typeof dict];
   if(badge)tab.prepend(badge);
  }
 }
 const chatH=q<HTMLElement>('#chat-heading');if(chatH)chatH.textContent=dict.chatTitle;
 const chatK=q<HTMLElement>('#chat-kicker');if(chatK)chatK.textContent=dict.chatKicker;
 const chatS=q<HTMLElement>('#chat-xyn-status');if(chatS)chatS.textContent=dict.chatStatus;
 const chatIn=q<HTMLTextAreaElement>('#chat-input');if(chatIn)chatIn.placeholder=dict.chatPlaceholder;
 const clipH=q<HTMLElement>('#clip-heading');if(clipH)clipH.textContent=dict.clipHeading;
 const clipExp=q<HTMLElement>('#clip-explain');if(clipExp)clipExp.textContent=dict.clipExplain;
 const actH=q<HTMLElement>('#act-heading');if(actH)actH.textContent=dict.actHeading;
 const setH=q<HTMLElement>('#set-heading');if(setH)setH.textContent=dict.setHeading;
}

function triggerMascotSalute(){
 playFeedbackSound('chime');
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
let isDraggingVolume=false,volumeSeq=0,volumePollTimer:ReturnType<typeof setInterval>|null=null;
let shuffleEnabled=false,repeatMode:'off'|'list'|'track'='off';
let mediaBusy=false,runBusy=false,raf=0,resizeInFlight=false;
let nextFrame:{width:number,height:number}|null=null,exitTimer:ReturnType<typeof setTimeout>|undefined;
const isReduced=()=>prefs.motion==='reduced'||(prefs.motion==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function storePrefs(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(prefs));}catch{}}
function updatePrefs(changes:Partial<Prefs>){prefs=sanitizeSettings({...prefs,...changes});storePrefs();syncPreferences();}
function syncPreferences(){
 const theme=prefs.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):prefs.theme;
 document.documentElement.dataset.theme=theme;
 document.documentElement.dataset.motion=isReduced()?'reduced':'normal';
 for(const [selector,checked] of [
  ['#always-top',prefs.alwaysOnTop],['#auto-collapse',prefs.autoCollapse],['#auto-hide',prefs.autoHide],
  ['#run-notifications',prefs.notifyRunChanges],['#reduce-motion',prefs.motion==='reduced'],
  ['#setting-gaze',prefs.gazeEnabled],['#setting-sound',prefs.soundEnabled],
  ['#setting-recap-enable',prefs.recapEnabled],
  ['#setting-flow-enable',prefs.flowEnabled],
  ['#setting-flow-push-to-talk',prefs.flowPushToTalk],
  ['#setting-flow-filter-fillers',prefs.flowFilterFillers]
 ] as [string,boolean][])q<HTMLInputElement>(selector).checked=checked;
 q<HTMLSelectElement>('#theme').value=prefs.theme;
 q<HTMLSelectElement>('#setting-language').value=prefs.language;
 q<HTMLSelectElement>('#setting-wardrobe').value=prefs.wardrobe;
 q<HTMLInputElement>('#setting-sound-vol').value=String(prefs.soundVolume);
 q<HTMLSelectElement>('#setting-clip-limit').value=String(prefs.clipboardLimit);
 clipboard.setMaxItems(prefs.clipboardLimit);
 q<HTMLSelectElement>('#setting-media-pref').value=prefs.preferredMedia;
 const recapBtn=q<HTMLButtonElement>('#recap-generate-btn');
 const exportBtn=q<HTMLButtonElement>('#recap-export-svg-btn');
 if(recapBtn)recapBtn.disabled=!prefs.recapEnabled;
 if(exportBtn)exportBtn.disabled=!prefs.recapEnabled;
 applyLanguage(prefs.language);
}
syncPreferences();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',syncPreferences);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncPreferences);
async function native(command:string,payload:Record<string,unknown>={}){
 if(!isTauri)throw new Error('Available only in the Windows application');
 return invoke(command,payload);
}
function sendFrame(frame:{width:number,height:number}){
 if(!validFrame(frame))return;
 if(!isTauri){
  root.style.width=`${frame.width}px`;
  root.style.height=`${frame.height}px`;
  return;
 }
 nextFrame=frame;if(resizeInFlight)return;
 resizeInFlight=true;
 void(async()=>{try{while(nextFrame){const latest=nextFrame;nextFrame=null;await native('set_island_frame',{width:latest.width,height:latest.height});}}
 catch(err){console.error('Window resize:',err);nextFrame=null;}
 finally{resizeInFlight=false;}})();
}
function tickMotion(now:number){
 raf=0;
 sendFrame(motion.step(now));
 if(motion.animating){
  raf=requestAnimationFrame(tickMotion);
 }else{
  sendFrame(motion.value);
  shell.dataset.animating='settled';
 }
}
function setMode(next:IslandMode,instant=false){
 if(exitTimer)clearTimeout(exitTimer);
 if(mode===next&&!instant)return;
 const targetDimensions=(next==='expanded'||next==='pinned'||next==='focused')
  ?{width:620,height:PANEL_HEIGHTS[panel]||396}
  :shellDimensions(next);
 const closing=targetDimensions.width<motion.value.width||targetDimensions.height<motion.value.height;
 mode=next;shell.dataset.mode=mode;
 shell.dataset.animating=closing?'collapsing':'expanding';
 q<HTMLButtonElement>('.pin').setAttribute('aria-pressed',String(mode==='pinned'));
 prefs=sanitizeSettings({...prefs,pinned:mode==='pinned'});storePrefs();
 if(raf)cancelAnimationFrame(raf);
 motion.target(targetDimensions,{closing,reduced:instant||isReduced()||!isTauri,now:performance.now()});
 if(motion.animating)raf=requestAnimationFrame(tickMotion);
 else{
  sendFrame(targetDimensions);
  shell.dataset.animating='settled';
 }
 syncGuardian();
 syncGazePolling();
 if(next==='hidden'||next==='dormant')stopVolumePolling();
 else startVolumePolling();
}
function apply(event:IslandEvent){setMode(transition(mode,event));}
function setPanel(next:Panel){
 playFeedbackSound('tap');
 if(panel==='preferences'&&next==='preferences'){
  next=lastPrimaryPanel;
 }
 if(next!=='preferences'){
  lastPrimaryPanel=next;
 }
 panel=next;shell.dataset.panel=next;
 for(const button of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
  const active=button.dataset.panel===next;button.classList.toggle('current',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
 }
 for(const page of root.querySelectorAll<HTMLElement>('.page'))page.hidden=page.id!==`page-${next}`;
 if(mode==='expanded'||mode==='pinned'||mode==='focused'){
  const target={width:620,height:PANEL_HEIGHTS[next]||396};
  motion.target(target,{closing:false,reduced:isReduced()||!isTauri,now:performance.now()});
  if(motion.animating){
   if(raf)cancelAnimationFrame(raf);
   raf=requestAnimationFrame(tickMotion);
  }else{
   sendFrame(target);
  }
 }
 if(next==='now'){void refreshMedia();startVolumePolling();}
 if(next==='activity'){q<HTMLElement>('#unread').hidden=true;void refreshRuns();renderAgentSessions();}
 if(next==='clipboard')renderClipboard();
 if(next==='chat'){checkChatInlineSetup();renderChatMessages();}
 if(next==='preferences'){void runProviderDetection();}
}
for(const tab of root.querySelectorAll<HTMLButtonElement>('.nav-tab')){
 tab.addEventListener('click',()=>setPanel(tab.dataset.panel as Panel));
 tab.addEventListener('keydown',e=>{
  const tabs=[...root.querySelectorAll<HTMLButtonElement>('.nav-tab')];
  const index=tabs.indexOf(tab);
  let nextIndex=index;
  if(e.key==='ArrowRight') nextIndex=(index+1)%tabs.length;
  else if(e.key==='ArrowLeft') nextIndex=(index+tabs.length-1)%tabs.length;
  else if(e.key==='Home') nextIndex=0;
  else if(e.key==='End') nextIndex=tabs.length-1;
  else return;
  e.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
 });
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
shell.addEventListener('pointerenter',()=>{
 if(exitTimer)clearTimeout(exitTimer);
 if(mode==='compact'&&shell.dataset.animating==='collapsing')apply('activate');
});
function isInteracting():boolean{
 const a=document.activeElement;
 return !!(a&&(a.tagName==='INPUT'||a.tagName==='SELECT'||a.tagName==='TEXTAREA'||a.hasAttribute('contenteditable')));
}
shell.addEventListener('pointerleave',()=>{
 if(exitTimer)clearTimeout(exitTimer);
 if(mode==='compact'&&prefs.autoHide)exitTimer=setTimeout(()=>{if(!isInteracting())apply('pointer-leave');},3500);
 if(mode==='expanded'&&prefs.autoCollapse)exitTimer=setTimeout(()=>{if(!isInteracting())apply('collapse');},3000);
});
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  if(panel==='preferences'){
   setPanel(lastPrimaryPanel);
  }else if(mode==='expanded'||mode==='pinned'){
   apply('collapse');
  }
  return;
 }
 if(!isInteracting()){
  if(e.key==='1'){setPanel('now');apply('activate');}
  else if(e.key==='2'){setPanel('clipboard');apply('activate');}
  else if(e.key==='3'){setPanel('activity');apply('activate');}
  else if(e.key==='4'){setPanel('chat');apply('activate');}
  else if(e.key==='5'){setPanel('preferences');apply('activate');}
  else{
   const focused=sessionStore.getFocusedSession();
   if(focused?.pendingApproval&&focused.pendingApproval.status==='pending'){
    if(e.key==='a'||e.key==='A'){
     e.preventDefault();
     q<HTMLButtonElement>('#btn-approval-allow-once')?.click();
    }else if(e.key==='d'||e.key==='D'){
     e.preventDefault();
     q<HTMLButtonElement>('#btn-approval-deny')?.click();
    }
   }
  }
 }
});

let activeFileDataUrl='';
let activeFileName='';
let activeFilePath='';
let activeFilePreview='';
function closeFileCard(){
 const card=q<HTMLElement>('#file-card');
 card.hidden=true;activeFileDataUrl='';activeFileName='';activeFilePath='';activeFilePreview='';
 const openEditorBtn=q<HTMLButtonElement>('#file-open-editor');
 if(openEditorBtn)openEditorBtn.hidden=true;
}
q<HTMLButtonElement>('#file-close').addEventListener('click',closeFileCard);

async function handleFileDrop(file:File){
 const meta=inspectFile(file);
 if(!meta.valid){
  feed.recordEvent('File rejected',meta.error||'Invalid file','FILE');
  renderAlerts();return;
 }
 activeFileName=meta.name;
 activeFilePath='';
 activeFilePreview='';
 const openEditorBtn=q<HTMLButtonElement>('#file-open-editor');
 if(openEditorBtn)openEditorBtn.hidden=true;
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
q<HTMLButtonElement>('#file-open-editor').addEventListener('click',async()=>{
 if(!activeFilePath)return;
 try{
  const lastSlash=Math.max(activeFilePath.lastIndexOf('/'),activeFilePath.lastIndexOf('\\'));
  const wsRoot=lastSlash>0?activeFilePath.slice(0,lastSlash):activeFilePath;
  const relFile=lastSlash>0?activeFilePath.slice(lastSlash+1):null;
  await native('open_in_editor',{workspaceRoot:wsRoot,filePath:relFile,line:null});
  feed.recordEvent('Opened in editor',activeFileName||activeFilePath,'FILE');
  renderAlerts();
 }catch(err){
  feed.recordEvent('Editor open failed',String(err),'ERROR');
  renderAlerts();
 }
});
q<HTMLButtonElement>('#file-ask-xyn').addEventListener('click',()=>{
 const prompt=activeFilePreview
  ?`Please examine this file (${activeFileName}):\n\n\`\`\`\n${activeFilePreview}\n\`\`\`\n`
  :`Please help me analyze this file: ${activeFileName}`;
 closeFileCard();
 setPanel('chat');
 apply('activate');
 const input=q<HTMLTextAreaElement>('#chat-input');
 if(input){
  input.value=prompt;
  input.style.height='auto';
  input.style.height=Math.min(input.scrollHeight,120)+'px';
  input.focus();
 }
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

async function handleNativePathDrop(filePath:string){
 if(!isTauri)return;
 try{
  const dropped=await native('read_dropped_file',{path:filePath}) as {
   name:string;
   sizeBytes:number;
   dataUrl?:string;
   textPreview?:string;
   category:string;
   extension:string;
  };
  if(!dropped)return;
  activeFileName=dropped.name;
  activeFilePath=filePath;
  activeFilePreview=dropped.textPreview||'';
  const openEditorBtn=q<HTMLButtonElement>('#file-open-editor');
  if(openEditorBtn)openEditorBtn.hidden=!isTauri||!activeFilePath;
  const card=q<HTMLElement>('#file-card');
  const title=q<HTMLElement>('#file-title');
  const info=q<HTMLElement>('#file-meta');
  const thumb=q<HTMLImageElement>('#file-thumb');
  const convertWebp=q<HTMLButtonElement>('#file-convert-webp');
  const convertPng=q<HTMLButtonElement>('#file-convert-png');
  const convertJpeg=q<HTMLButtonElement>('#file-convert-jpeg');

  const formattedSize=dropped.sizeBytes>1048576
   ?`${(dropped.sizeBytes/1048576).toFixed(1)} MB`
   :`${Math.round(dropped.sizeBytes/1024)} KB`;

  title.textContent=dropped.name;
  info.textContent=`${formattedSize} · ${dropped.category.toUpperCase()}`;
  card.hidden=false;
  setPanel('now');
  apply('activate');

  const isImg=dropped.category==='image';
  convertWebp.hidden=!isImg;
  convertPng.hidden=!isImg;
  convertJpeg.hidden=!isImg;

  if(isImg&&dropped.dataUrl){
   activeFileDataUrl=dropped.dataUrl;
   thumb.src=activeFileDataUrl;
   thumb.hidden=false;
  }else{
   thumb.hidden=true;
  }

  feed.recordEvent('File inspected',`${dropped.name} (${formattedSize})`,'FILE');
  renderAlerts();
  triggerMascotSalute();
 }catch(err){
  feed.recordEvent('File drop error',String(err),'ERROR');
  renderAlerts();
 }
}

if(isTauri){
 void listen<{paths?:string[]}>('tauri://drag-drop',e=>{
  shell.dataset.dropHover='false';
  const paths=e.payload?.paths;
  if(paths&&paths.length>0){
   void handleNativePathDrop(paths[0]);
  }
 });
 void listen('tauri://drag-enter',()=>{shell.dataset.dropHover='true';});
 void listen('tauri://drag-leave',()=>{shell.dataset.dropHover='false';});
}

// Native Windows cursor sampling runs only when the top-screen Lion is visible.
// The coordinates stay in memory; nothing is logged, persisted or transmitted.
type NativeCursor={x:number;y:number};
let gazeTimer:ReturnType<typeof setTimeout>|undefined;
let gazeGeneration=0;
function setLionGaze(clientX:number,clientY:number){
 const activeId=(mode==='expanded'||mode==='pinned'||mode==='focused')
  ?'#header-guardian'
  :mode==='glance'
   ?'#glance-guardian'
   :mode==='compact'
    ?'#compact-guardian'
    :null;
 if(!activeId)return;
 const lion=root.querySelector<any>(activeId);
 if(lion&&typeof lion.setGazeFromClient==='function')lion.setGazeFromClient(clientX,clientY);
}
function stopGazePolling(){
 ++gazeGeneration;
 if(gazeTimer!==undefined)clearTimeout(gazeTimer);
 gazeTimer=undefined;
}
function syncGazePolling(){
 stopGazePolling();
 if(!isTauri||!prefs.gazeEnabled||document.hidden||mode==='hidden'||mode==='dormant')return;
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

function updateCompact(){
 const tag=q<HTMLElement>('#compact-status-tag');
 const ctx=q<HTMLElement>('#compact-context');
 const compactPlay=q<HTMLButtonElement>('#compact-play');
 const glanceHead=q<HTMLElement>('#glance-headline');
 const glanceSub=q<HTMLElement>('#glance-sub');
 const glancePlay=q<HTMLButtonElement>('#glance-play');
 const glanceCardTitle=q<HTMLElement>('#glance-card-title');

 const focused=sessionStore.getFocusedSession();
 const agentState=sessionStore.getAggregateState();

 if(agentState!=='idle'&&focused){
  const provName=getAdapter(focused.provider)?.name||focused.provider;
  tag.textContent=agentState==='approval'?'Approval':agentState==='working'?'Working':agentState==='thinking'?'Thinking':agentState==='error'?'Error':'Active';
  ctx.textContent=`${provName} · ${focused.activeTool||focused.status}`;
  glanceHead.textContent=`${provName} (${focused.status})`;
  glanceSub.textContent=focused.activeTool?`Tool: ${focused.activeTool}`:(focused.workspaceRoot?`Workspace: ${focused.workspaceRoot}`:'Active session');
  glanceCardTitle.textContent='Agent Session';
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
 q<HTMLElement>('#header-status').textContent=agentState!=='idle'?`Agent ${agentState}`:selectedMedia.playing?'Media playing':'On device';
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
 const sourceLine=root.querySelector<HTMLElement>('.source-line');
 if(sourceLine)sourceLine.hidden=overview.sessions.length<=1;
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
  selectedMedia=pickSession(overview,prefs.preferredMedia||selectedSource);
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
let volumeInFlight = false;
let volumeReqSeq = 0;
let lastAppliedVolumeSeq = 0;

function startVolumePolling(){
 if(volumePollTimer)return;
 void refreshVolume();
 volumePollTimer=setInterval(()=>{
  if(panel==='now'&&!document.hidden&&mode!=='hidden'&&mode!=='dormant'&&!isDraggingVolume){
   void refreshVolume();
  }
 },250);
}
function stopVolumePolling(){
 if(volumePollTimer){clearInterval(volumePollTimer);volumePollTimer=null;}
}
async function refreshVolume(){
 if(!isTauri||volumeInFlight)return;
 volumeInFlight=true;
 const seq=++volumeReqSeq;
 try{
  const snapshot=await native('get_master_volume') as typeof masterVolume;
  if(seq>=lastAppliedVolumeSeq){
   lastAppliedVolumeSeq=seq;
   masterVolume=snapshot;
   if(!isDraggingVolume){
    q<HTMLInputElement>('#master-volume').value=String(snapshot.percent);
    q<HTMLOutputElement>('#volume-value').value=snapshot.percent+'%';
   }
   q<HTMLButtonElement>('#mute').innerHTML=icon(snapshot.muted?'mute':'volume',15);
   q<HTMLButtonElement>('#mute').setAttribute('aria-label',snapshot.muted?'Unmute Windows output':'Mute Windows output');
   q<HTMLInputElement>('#master-volume').disabled=false;
  }
 }catch(err){
  q<HTMLInputElement>('#master-volume').disabled=true;
  mediaFeedback('Output volume unavailable: '+String(err));
 }finally{
  volumeInFlight=false;
 }
}
let volTimer:ReturnType<typeof setTimeout>|null=null;
const volInput=q<HTMLInputElement>('#master-volume');
volInput.addEventListener('pointerdown',()=>{isDraggingVolume=true;});
window.addEventListener('pointerup',()=>{
 if(isDraggingVolume){
  isDraggingVolume=false;
  void refreshVolume();
 }
});
volInput.addEventListener('input',e=>{
 isDraggingVolume=true;
 const percent=Number((e.target as HTMLInputElement).value);
 q<HTMLOutputElement>('#volume-value').value=percent+'%';
 const seq=++volumeSeq;
 if(volTimer)clearTimeout(volTimer);
 volTimer=setTimeout(async()=>{
  try{
   const res=await native('set_master_volume',{percent}) as typeof masterVolume;
   if(seq===volumeSeq){
    masterVolume=res;
    q<HTMLButtonElement>('#mute').innerHTML=icon(res.muted?'mute':'volume',15);
   }
  }catch(err){mediaFeedback('Cannot change output volume: '+String(err));}
 },40);
});
volInput.addEventListener('change',async e=>{
 isDraggingVolume=false;
 const percent=Number((e.target as HTMLInputElement).value);
 if(!Number.isInteger(percent)||percent<0||percent>100)return;
 const seq=++volumeSeq;
 try{
  const res=await native('set_master_volume',{percent}) as typeof masterVolume;
  if(seq===volumeSeq){
   masterVolume=res;
   q<HTMLButtonElement>('#mute').innerHTML=icon(res.muted?'mute':'volume',15);
  }
  await refreshVolume();
 }catch(err){
  mediaFeedback('Cannot change output volume: '+String(err));
  await refreshVolume();
 }
});
q<HTMLButtonElement>('#mute').addEventListener('click',async()=>{
 try{
  masterVolume=await native('set_master_mute',{muted:!masterVolume.muted}) as typeof masterVolume;
  await refreshVolume();
 }catch(err){mediaFeedback('Cannot toggle output mute: '+String(err));}
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

// Authoritative clipboard capture controller (syncs Clips tab and Settings toggle)
function setClipboardCapture(enabled:boolean){
 if(clipboard.enabled===enabled)return;
 if(enabled){
  clipboard.enable();
  void observeClipboard();
  if(clipTimer)clearInterval(clipTimer);
  clipTimer=setInterval(()=>void observeClipboard(),1500);
 }else{
  clipboard.disable();
  if(clipTimer){clearInterval(clipTimer);clipTimer=null;}
 }
 const settingToggle=q<HTMLInputElement>('#setting-clip-capture');
 if(settingToggle)settingToggle.checked=clipboard.enabled;
 renderClipboard();
}

// Clipboard monitoring never starts by default or on application restart.
function renderClipboard(){
 const toggle=q<HTMLButtonElement>('#clip-toggle');
 toggle.textContent=clipboard.enabled?'Pause capture':'Enable capture';
 toggle.setAttribute('aria-pressed',String(clipboard.enabled));
 q<HTMLElement>('#clip-state').textContent=clipboard.enabled?'Monitoring active':'Capture off';
 const settingToggle=q<HTMLInputElement>('#setting-clip-capture');
 if(settingToggle)settingToggle.checked=clipboard.enabled;

 const searchInput=q<HTMLInputElement>('#clip-search');
 const query=searchInput?searchInput.value:'';
 const items=clipboard.filter(query);
 const list=q<HTMLElement>('#clip-list');list.replaceChildren();
 if(!items.length){
  const empty=document.createElement('p');empty.className='empty-copy';
  if(query){
   empty.textContent='No matching clipboard items.';
  }else if(!clipboard.enabled){
   empty.textContent='No captured items. Enable capture or use Read once.';
  }else{
   empty.textContent='Clipboard history is empty. Copy text or images to capture.';
  }
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

let lastClipboardSeq=0;
async function observeClipboard(){
 if(clipBusy||!clipboard.enabled)return;
 clipBusy=true;
 try{
  if(isTauri){
   try{
    const seq=await native('get_clipboard_sequence_number') as number;
    if(typeof seq==='number'&&seq>0&&seq===lastClipboardSeq){
     return;
    }
    lastClipboardSeq=seq;
   }catch{
    // sequence number check optional fallback
   }
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

q<HTMLButtonElement>('#clip-toggle').addEventListener('click',()=>setClipboardCapture(!clipboard.enabled));

q<HTMLButtonElement>('#clip-read').addEventListener('click',async()=>{
 try{
  let accepted=false;
  if(isTauri){
   const nativeItem=await native('read_native_clipboard') as any;
   if(nativeItem){accepted=clipboard.acceptOnce(nativeItem);}
   else{const val=await readText();if(val)accepted=clipboard.acceptOnce(val);}
  }else{
   const val=await readText();if(val)accepted=clipboard.acceptOnce(val);
  }
  renderClipboard();
  q<HTMLElement>('#clip-state').textContent=accepted
   ?'Captured one item'
   :(clipboard.enabled?'Monitoring active':'Capture off (no new item)');
 }catch(err){q<HTMLElement>('#clip-state').textContent='Read failed: '+String(err);}
});

q<HTMLInputElement>('#clip-search').addEventListener('input',()=>renderClipboard());
q<HTMLButtonElement>('#clip-clear-unpinned').addEventListener('click',()=>{clipboard.clear(true);renderClipboard();});
q<HTMLButtonElement>('#clip-clear').addEventListener('click',()=>{clipboard.clear();renderClipboard();});
window.addEventListener('beforeunload',()=>{clipboard.clear();providerCredentials.clearKey();if(clipTimer)clearInterval(clipTimer);});

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
 if(!feed.items.length){const p=document.createElement('p');p.className='empty-copy';p.textContent='No recent activity or notifications recorded.';list.append(p);return;}
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
chat.systemPrompt = `Kamu adalah Xyn, maskot Golden Lion Guardian dari Xyeena Island — penjaga desktop yang sigap, cerdas, bersahabat, dan tanggap mendampingi pengguna di Windows notch. Karaktermu hangat, pragmatis, solutif, dan analitis (gaya Xyeena). Jawab dengan Bahasa Indonesia yang natural, santai tapi cerdas dan lugas (tidak kaku seperti robot/birokrasi, tidak lebay/klise). Berikan bantuan teknis, kode, ringkasan, atau saran yang konkret, jujur, akurat, dan tanpa gimik.`;
let chatAbortController:AbortController|null=null;

function setXynChatState(state:'idle'|'thinking'|'speaking'|'error', err?: any){
 const sub=q<HTMLElement>('#chat-xyn-status');
 const stopBtn=q<HTMLButtonElement>('#chat-stop');
 const sendBtn=q<HTMLButtonElement>('#chat-send');
 if(state==='thinking'){
  chatMascotState='thinking';
  syncGuardian();
  if(sub)sub.textContent=prefs.language==='id'?'Xyn lagi mikir & membaca konteks...':'Xyn is thinking & reading context...';
  if(stopBtn)stopBtn.hidden=false;
  if(sendBtn)sendBtn.disabled=true;
  playFeedbackSound('tap');
 }else if(state==='speaking'){
  chatMascotState='working';
  syncGuardian();
  if(sub)sub.textContent=prefs.language==='id'?'Xyn lagi merespons...':'Xyn is responding...';
  if(stopBtn)stopBtn.hidden=false;
  if(sendBtn)sendBtn.disabled=true;
 }else if(state==='error'){
  chatMascotState='error';
  syncGuardian();
  let errDesc = prefs.language==='id'?'Xyn mengalami kendala':'Xyn encountered an issue';
  if(err instanceof ApiError){
   const p = err.provider || chat.activeProvider;
   if(err.status === 429){
    errDesc = prefs.language==='id'?`Rate limit ${p} terlampaui (429)`:`${p} rate limit exceeded (429)`;
   }else if(err.status === 503 || err.status === 529){
    errDesc = prefs.language==='id'?`${p} sedang sibuk/overloaded (${err.status})`:`${p} overloaded (${err.status})`;
   }else if(err.status === 401){
    errDesc = prefs.language==='id'?`API key ${p} tidak valid (401)`:`Invalid API key for ${p} (401)`;
   }else{
    errDesc = prefs.language==='id'?`Kendala provider ${p} (${err.status||'error'})`:`Provider ${p} error (${err.status||'error'})`;
   }
  }
  if(sub)sub.textContent=errDesc;
  if(stopBtn)stopBtn.hidden=true;
  if(sendBtn)sendBtn.disabled=false;
  playFeedbackSound('error');
 }else{
  chatMascotState=null;
  syncGuardian();
  if(sub)sub.textContent=I18N[prefs.language]?.chatStatus||I18N.id.chatStatus;
  if(stopBtn)stopBtn.hidden=true;
  if(sendBtn)sendBtn.disabled=false;
 }
}

function checkChatInlineSetup(){
 const box=q<HTMLElement>('#chat-inline-setup');
 if(!box)return;
 const prov=chat.activeProvider;
 const needsKey=['gemini','openai','anthropic','openrouter'].includes(prov);
 const hasKey=providerCredentials.hasKey(prov);
 box.hidden=!needsKey||hasKey;
}

function renderChatMessages(){
 const viewport=q<HTMLElement>('#chat-messages');
 viewport.replaceChildren();
 if(!chat.messages.length){
  const welcome=document.createElement('div');
  welcome.className='chat-bubble chat-bubble-assistant';
  welcome.innerHTML=I18N[prefs.language]?.chatWelcome||I18N.id.chatWelcome;
  viewport.append(welcome);
  return;
 }
 for(const msg of chat.messages){
  const bubble=document.createElement('div');
  bubble.className=`chat-bubble chat-bubble-${msg.role}`;
  bubble.innerHTML=renderSafeMarkdown(msg.content);
  for(const pre of bubble.querySelectorAll('pre')){
   const btn=document.createElement('button');
   btn.type='button';btn.className='code-copy-btn';btn.textContent='Copy';
   btn.addEventListener('click',async()=>{
    const code=pre.querySelector('code')?.textContent||pre.textContent||'';
    try{
     await writeText(code);
     btn.textContent='Copied!';
     setTimeout(()=>{btn.textContent='Copy';},1500);
    }catch{}
   });
   pre.style.position='relative';
   pre.append(btn);
  }
  viewport.append(bubble);
 }
 viewport.scrollTop=viewport.scrollHeight;
}

function onProviderChange(prov:string){
 chat.activeProvider=prov;
 const match=AI_PROVIDERS.find(p=>p.id===prov);
 if(match)chat.activeModel=match.defaultModel;
 const setSelect=q<HTMLSelectElement>('#setting-ai-provider');
 if(setSelect&&setSelect.value!==prov)setSelect.value=prov;
 const chatSelect=q<HTMLSelectElement>('#chat-provider-select');
 if(chatSelect&&chatSelect.value!==prov)chatSelect.value=prov;
 const badge=q<HTMLElement>('#badge-ai-creds');
 const isLocal=prov==='ollama'||prov==='lmstudio';
 if(badge){
  badge.textContent=isLocal?'Local Loopback':(providerCredentials.hasKey(prov)?'Key Set (In-Memory)':'No Key Set');
 }
 const setInput=q<HTMLInputElement>('#setting-ai-api-key');
 if(setInput){
  setInput.value='';
  setInput.disabled=isLocal;
  setInput.placeholder=isLocal?'Not required for local provider':(providerCredentials.hasKey(prov)?'•••••••• (Session Key Set)':'Enter API key');
 }
 checkChatInlineSetup();
}
q<HTMLSelectElement>('#chat-provider-select').addEventListener('change',e=>{
 onProviderChange((e.target as HTMLSelectElement).value);
});

const inlineInput=q<HTMLInputElement>('#chat-inline-key-input');
const saveInlineBtn=q<HTMLButtonElement>('#btn-save-inline-key');
function saveInlineKey(){
 const val=inlineInput?.value?.trim()||'';
 if(val){
  providerCredentials.setKey(chat.activeProvider,val);
  if(inlineInput)inlineInput.value='';
  onProviderChange(chat.activeProvider);
  playFeedbackSound('chime');
  triggerMascotSalute();
 }
}
saveInlineBtn?.addEventListener('click',saveInlineKey);
inlineInput?.addEventListener('keydown',e=>{
 if(e.key==='Enter'){
  e.preventDefault();
  saveInlineKey();
 }
});

let chatReqSeq=0;

q<HTMLButtonElement>('#chat-stop')?.addEventListener('click',()=>{
 ++chatReqSeq;
 if(chatAbortController){
  chatAbortController.abort();
  chatAbortController=null;
  setXynChatState('idle');
 }
});

const chatInput=q<HTMLTextAreaElement>('#chat-input');
chatInput.addEventListener('input',()=>{
 chatInput.style.height='auto';
 chatInput.style.height=Math.min(chatInput.scrollHeight,120)+'px';
});
chatInput.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey){
  e.preventDefault();
  q<HTMLFormElement>('#chat-form').requestSubmit();
 }
});

q<HTMLFormElement>('#chat-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const input=q<HTMLTextAreaElement>('#chat-input');
 const text=input.value.trim();
 if(!text)return;
 input.value='';
 input.style.height='auto';

 // Strictly sync provider from active dropdown before submission
 const chosenProvider=q<HTMLSelectElement>('#chat-provider-select').value;
 onProviderChange(chosenProvider);

 const thisReqSeq=++chatReqSeq;
 chat.addUserMessage(text);
 renderChatMessages();

 // Privacy-safe activity logging: NEVER log raw prompt text or secrets!
 feed.recordEvent('Chat message submitted',`Provider: ${chat.activeProvider}`,'ACTION');
 renderAlerts();
 setXynChatState('thinking');

 const placeholder=chat.addAssistantReply('Thinking...');
 renderChatMessages();

 try{
  chatAbortController=new AbortController();
  const localUrl=q<HTMLInputElement>('#setting-ai-local-url')?.value||'';
  const key=providerCredentials.getKey(chat.activeProvider);

  // Remove the temporary placeholder before running completion
  chat.messages=chat.messages.filter(m=>m.id!==placeholder.id);
  if(thisReqSeq!==chatReqSeq)return;

  setXynChatState('speaking');

  await chat.requestCompletion({
   provider:chat.activeProvider,
   model:chat.activeModel,
   localUrl,
   apiKey:key,
   nativeInvoker:isTauri?native:undefined,
   signal:chatAbortController.signal,
  });

  if(thisReqSeq!==chatReqSeq)return;

  renderChatMessages();
  playFeedbackSound('chime');
  triggerMascotSalute();
  setXynChatState('idle');
 }catch(err:any){
  if(thisReqSeq!==chatReqSeq)return;
  chat.messages=chat.messages.filter(m=>m.id!==placeholder.id);
  if(err?.name==='AbortError'){
   chat.addAssistantReply('*Response generation cancelled.*', { isError: true });
  }else{
   chat.addAssistantReply(`⚠️ **Chat error:** ${err?.message||String(err)}`, { isError: true });
  }
  renderChatMessages();
  setXynChatState('error', err);
  setTimeout(()=>{if(thisReqSeq===chatReqSeq)setXynChatState('idle');},4000);
 }finally{
  if(thisReqSeq===chatReqSeq){
   chatAbortController=null;
  }
 }
});

function renderAgentSessions(){
 const row=q<HTMLElement>('#agent-pills');
 const detailCard=q<HTMLElement>('#session-detail-card');
 const emptyCard=q<HTMLElement>('#no-sessions-card');
 const unreadBadge=root.querySelector<HTMLElement>('#unread');
 
 const allSessions=sessionStore.getAllSessions();
 const focusedSession=sessionStore.getFocusedSession();

 row.replaceChildren();

 if(allSessions.length===0){
  row.hidden=true;
  detailCard.hidden=true;
  emptyCard.hidden=false;
  if(unreadBadge)unreadBadge.hidden=true;
  updateCompact();
  return;
 }

 row.hidden=false;
 emptyCard.hidden=true;

 const hasApproval=allSessions.some(s=>s.status==='approval');
 const activeCount=allSessions.filter(s=>s.status==='working'||s.status==='thinking'||s.status==='approval').length;
 if(unreadBadge){
  if(hasApproval){
   unreadBadge.hidden=false;
   unreadBadge.textContent='!';
   unreadBadge.setAttribute('aria-label','Agent approval requested');
  }else if(activeCount>0){
   unreadBadge.hidden=false;
   unreadBadge.textContent=String(activeCount);
   unreadBadge.setAttribute('aria-label',`${activeCount} active agent sessions`);
  }else{
   unreadBadge.hidden=true;
  }
 }

 for(const sess of allSessions){
  const pill=document.createElement('button');
  pill.type='button';
  pill.className=`agent-session-pill ${sess.key===focusedSession?.key?'focused':''} ${sess.status}`;
  pill.setAttribute('aria-pressed',sess.key===focusedSession?.key?'true':'false');
  
  const dot=document.createElement('span');
  dot.className=`status-dot ${sess.status}`;
  
  const provName=getAdapter(sess.provider)?.name||sess.provider;
  const label=document.createElement('span');
  label.textContent=`${provName} (${sess.status})`;
  
  pill.append(dot,label);
  pill.addEventListener('click',()=>{
   sessionStore.setFocus(sess.key);
  });
  row.append(pill);
 }

 if(focusedSession){
  detailCard.hidden=false;
  const provName=getAdapter(focusedSession.provider)?.name||focusedSession.provider;
  q<HTMLElement>('#session-provider-name').textContent=provName;
  const statusDot=q<HTMLElement>('#session-status-dot');
  statusDot.className=`status-dot ${focusedSession.status}`;
  q<HTMLElement>('#session-status-text').textContent=focusedSession.status.toUpperCase();
  
  const wsBadge=q<HTMLElement>('#session-workspace');
  if(focusedSession.workspaceRoot){
   const parts=focusedSession.workspaceRoot.replace(/\\/g,'/').split('/');
   wsBadge.textContent=parts[parts.length-1]||focusedSession.workspaceRoot;
   wsBadge.title=focusedSession.workspaceRoot;
   wsBadge.hidden=false;
  }else{
   wsBadge.hidden=true;
  }

  // Developer Productivity: Navigation Actions (F13)
  const ws=focusedSession.workspaceRoot||focusedSession.cwd||'';
  const btnEditor=q<HTMLButtonElement>('#btn-open-editor');
  const btnTerminal=q<HTMLButtonElement>('#btn-open-terminal');
  const btnDiff=q<HTMLButtonElement>('#btn-workspace-diff');

  btnEditor.onclick=async()=>{
   if(!ws)return;
   try{await native('open_in_editor',{workspaceRoot:ws,filePath:null,line:null});}
   catch(err){console.error('Failed to open editor:',err);}
  };

  btnTerminal.onclick=async()=>{
   if(!ws)return;
   try{await native('open_in_terminal',{workspaceRoot:ws});}
   catch(err){console.error('Failed to open terminal:',err);}
  };

  btnDiff.onclick=()=>{
   if(!ws)return;
   void loadWorkspaceDiff(ws);
  };

  // Honest Session Telemetry (F14)
  const durSec=Math.max(0,Math.round((focusedSession.lastActivity-focusedSession.startedAt)/1000));
  const durStr=durSec>60?`${Math.floor(durSec/60)}m ${durSec%60}s`:`${durSec}s`;
  q<HTMLElement>('#session-telemetry-duration').textContent=`Duration: ${durStr}`;
  q<HTMLElement>('#session-telemetry-events').textContent=`${focusedSession.eventCount} events`;
  const touched=focusedSession.touchedFiles||[];
  q<HTMLElement>('#session-telemetry-files').textContent=`${touched.length} files`;
  
  const usageEl=q<HTMLElement>('#session-telemetry-usage');
  if(focusedSession.usage?.totalTokens){
   usageEl.textContent=`Tokens: ${focusedSession.usage.totalTokens}`;
  }else if(focusedSession.usage?.inputTokens||focusedSession.usage?.outputTokens){
   usageEl.textContent=`In: ${focusedSession.usage.inputTokens||0} / Out: ${focusedSession.usage.outputTokens||0}`;
  }else{
   usageEl.textContent='Telemetry: Live hook';
  }

  // File-change Ticker (F12)
  const tickerBox=q<HTMLElement>('#session-files-ticker');
  const filesList=q<HTMLElement>('#session-files-list');
  if(touched.length>0){
   tickerBox.hidden=false;
   q<HTMLElement>('#session-files-count').textContent=String(touched.length);
   filesList.replaceChildren();
   for(const filePath of touched){
    const item=document.createElement('div');
    item.className='session-file-item';
    
    const nameSpan=document.createElement('span');
    nameSpan.className='session-file-name';
    const base=filePath.replace(/\\/g,'/').split('/').pop()||filePath;
    nameSpan.textContent=base;
    nameSpan.title=filePath;

    const btnGroup=document.createElement('div');
    btnGroup.style.display='flex';
    btnGroup.style.gap='4px';

    const fileDiffBtn=document.createElement('button');
    fileDiffBtn.type='button';
    fileDiffBtn.className='session-file-btn';
    fileDiffBtn.textContent='Diff';
    fileDiffBtn.onclick=()=>{
     void loadWorkspaceDiff(ws,filePath);
    };

    const fileOpenBtn=document.createElement('button');
    fileOpenBtn.type='button';
    fileOpenBtn.className='session-file-btn';
    fileOpenBtn.textContent='Open';
    fileOpenBtn.onclick=async()=>{
     try{await native('open_in_editor',{workspaceRoot:ws,filePath,line:null});}
     catch(err){console.error('Failed to open file in editor:',err);}
    };

    btnGroup.append(fileDiffBtn,fileOpenBtn);
    item.append(nameSpan,btnGroup);
    filesList.append(item);
   }
  }else{
   tickerBox.hidden=true;
  }

  const approvalBox=q<HTMLElement>('#session-approval-box');
  if(focusedSession.pendingApproval&&focusedSession.pendingApproval.status==='pending'){
   approvalBox.hidden=false;
   const ap=focusedSession.pendingApproval;
   q<HTMLElement>('#session-approval-time').textContent=new Date(ap.created_at_ms).toLocaleTimeString();
   
   const questionEl=q<HTMLElement>('#session-approval-question');
   const promptText=ap.question||ap.tool_input_summary||(ap.tool_command?`Execute: ${ap.tool_command}`:`Permission requested for ${ap.tool_name}`);
   questionEl.textContent=promptText;

   const optionsEl=q<HTMLElement>('#session-approval-options');
   optionsEl.replaceChildren();

   if(ap.options&&ap.options.length>0){
    optionsEl.hidden=false;
    for(const opt of ap.options){
     const optBtn=document.createElement('button');
     optBtn.type='button';
     optBtn.className='session-approval-option-btn';
     optBtn.textContent=opt.label;
     if(opt.description){
      const descSpan=document.createElement('span');
      descSpan.style.display='block';
      descSpan.style.fontSize='9px';
      descSpan.style.color='var(--muted)';
      descSpan.textContent=opt.description;
      optBtn.append(descSpan);
     }
     optBtn.addEventListener('click',()=>{
      void submitDecision(focusedSession,{answer:opt.id||opt.label});
     });
     optionsEl.append(optBtn);
    }
   }else{
    optionsEl.hidden=true;
   }

   q<HTMLButtonElement>('#btn-approval-allow-once').onclick=()=>{
    void submitDecision(focusedSession,'allow_once');
   };
   q<HTMLButtonElement>('#btn-approval-deny').onclick=()=>{
    void submitDecision(focusedSession,'deny');
   };
   q<HTMLElement>('#session-approval-status').textContent='';
  }else{
   approvalBox.hidden=true;
  }

  const toolBox=q<HTMLElement>('#session-tool-box');
  if(focusedSession.activeTool){
   toolBox.hidden=false;
   q<HTMLElement>('#session-tool-name').textContent=`Tool: ${focusedSession.activeTool}`;
   q<HTMLElement>('#session-tool-time').textContent=new Date(focusedSession.lastActivity).toLocaleTimeString();
   const cmdEl=q<HTMLElement>('#session-tool-command');
   if(focusedSession.lastCommand){
    cmdEl.textContent=focusedSession.lastCommand;
    cmdEl.hidden=false;
   }else{
    cmdEl.hidden=true;
   }
  }else{
   toolBox.hidden=true;
  }

  const timeline=q<HTMLElement>('#session-events-timeline');
  timeline.replaceChildren();
  for(const ev of (focusedSession.recentEvents||[]).slice(-5).reverse()){
   const item=document.createElement('div');
   item.className='session-timeline-item';
   const timeSpan=document.createElement('span');
   timeSpan.className='timeline-time';
   timeSpan.textContent=new Date(ev.timestamp).toLocaleTimeString();
   const descSpan=document.createElement('span');
   descSpan.className='timeline-desc';
   descSpan.textContent=ev.summary||ev.eventType;
   item.append(timeSpan,descSpan);
   timeline.append(item);
  }
 }else{
  detailCard.hidden=true;
 }

 updateCompact();
}

async function submitDecision(session:MonitoredSession,decision:'allow_once'|'deny'|{answer:string}){
 if(!session.pendingApproval)return;
 const ap=session.pendingApproval;
 const statusEl=q<HTMLElement>('#session-approval-status');
 statusEl.textContent='Submitting decision...';
 statusEl.style.color='var(--muted)';

 try{
  const outcome=await native('submit_approval_decision',{
   payload:{
    request_id:ap.request_id,
    auth_token:ap.auth_token,
    action_fingerprint:ap.action_fingerprint,
    decision:typeof decision==='string'?decision:decision
   }
  }) as any;

  sessionStore.resolvePendingApproval(ap.request_id,outcome.status);
  playFeedbackSound('chime');
  const provName=getAdapter(session.provider)?.name||session.provider;
  const decStr=typeof decision==='string'?decision:`Answer: ${decision.answer}`;
  feed.recordEvent('Approval decision',`${provName}: ${decStr}`,'AGENT');
  renderAlerts();
 }catch(err){
  statusEl.textContent=`Decision error: ${String(err)}`;
  statusEl.style.color='#ef4444';
  playFeedbackSound('error');
 }
}

async function loadWorkspaceDiff(workspaceRoot:string,filePath?:string){
 const drawer=q<HTMLElement>('#session-diff-drawer');
 const titleEl=q<HTMLElement>('#diff-drawer-title');
 const warningEl=q<HTMLElement>('#diff-drawer-warning');
 const contentEl=q<HTMLElement>('#diff-drawer-content');
 const closeBtn=q<HTMLButtonElement>('#btn-close-diff');

 drawer.hidden=false;
 warningEl.hidden=true;
 titleEl.textContent=filePath?`Diff: ${filePath.replace(/\\/g,'/').split('/').pop()}`:'Workspace Diff';
 contentEl.textContent='Loading bounded diff...';

 closeBtn.onclick=()=>{
  drawer.hidden=true;
 };

 try{
  const res=await native('get_workspace_diff',{
   workspaceRoot,
   filePath:filePath||null
  }) as any;

  if(!res||!res.is_git_repo){
   contentEl.textContent='Workspace is not inside a git repository or git command is not available.';
   return;
  }

  if(!res.diff||res.diff.trim().length===0){
   contentEl.textContent='No uncommitted changes found.';
   return;
  }

  if(res.truncated){
   warningEl.hidden=false;
   warningEl.textContent='Output bounded to 64KB / 500 lines limit.';
  }

  contentEl.textContent=res.diff;
 }catch(err){
  contentEl.textContent=`Diff error: ${String(err)}`;
 }
}

q<HTMLButtonElement>('#btn-open-hook-settings')?.addEventListener('click',()=>{
 setPanel('preferences');
 const aiPill=root.querySelector<HTMLButtonElement>('.settings-pill[data-section="ai"]');
 aiPill?.click();
});

q<HTMLButtonElement>('#refresh-activity-btn')?.addEventListener('click',async ()=>{
 if(isTauri){
  try{
   const raw=await native('get_agent_sessions') as NativeSessionSnapshot[];
   sessionStore.hydrateSessions(raw);
   const rawApprovals=await native('get_pending_approvals') as ApprovalSnapshot[];
   if(Array.isArray(rawApprovals)){
    for(const snap of rawApprovals){
     sessionStore.setPendingApproval(snap);
    }
   }
  }catch(err){console.error('Failed to refresh agent sessions:',err);}
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
  if(section==='integrations'){
   void refreshGitHubIntegration();
  }
  if(section==='flow'){
   void refreshFlowEngineStatus();
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
q<HTMLInputElement>('#setting-clip-capture').addEventListener('change',e=>setClipboardCapture((e.target as HTMLInputElement).checked));
q<HTMLSelectElement>('#setting-clip-limit').addEventListener('change',e=>{
 const limit=Number((e.target as HTMLSelectElement).value);
 updatePrefs({clipboardLimit:limit});
 clipboard.setMaxItems(limit);
 renderClipboard();
});
q<HTMLButtonElement>('#setting-clip-clear').addEventListener('click',()=>{clipboard.clear();renderClipboard();});
q<HTMLSelectElement>('#setting-media-pref').addEventListener('change',e=>{
 const pref=(e.target as HTMLSelectElement).value;
 updatePrefs({preferredMedia:pref});
 void refreshMedia();
});
q<HTMLInputElement>('#setting-recap-enable').addEventListener('change',e=>{
 const enabled=(e.target as HTMLInputElement).checked;
 updatePrefs({recapEnabled:enabled});
 const recapBtn=q<HTMLButtonElement>('#recap-generate-btn');
 const exportBtn=q<HTMLButtonElement>('#recap-export-svg-btn');
 if(recapBtn)recapBtn.disabled=!enabled;
 if(exportBtn)exportBtn.disabled=!enabled;
});

q<HTMLSelectElement>('#setting-ai-provider')?.addEventListener('change',e=>{
 onProviderChange((e.target as HTMLSelectElement).value);
});
q<HTMLInputElement>('#setting-ai-api-key')?.addEventListener('change',e=>{
 const val=(e.target as HTMLInputElement).value.trim();
 if(val){
  providerCredentials.setKey(chat.activeProvider,val);
 }else{
  providerCredentials.clearKey(chat.activeProvider);
 }
 onProviderChange(chat.activeProvider);
});

// Weekly Recap Generation and SVG Export using PR #2 engine (@xyeena/recap)
let activeRecapData:any=null;
q<HTMLButtonElement>('#recap-generate-btn').addEventListener('click',()=>{
 if(!prefs.recapEnabled){
  q<HTMLElement>('#recap-preview-box').hidden=false;
  q<HTMLElement>('#recap-text').textContent='Weekly Recap is currently disabled in Settings.';
  return;
 }
 const sevenDaysAgo=Date.now()-7*86400000;
 const realEvents:any[]=[];

 // 1. Genuine CLI runs from project snapshots using their authentic creation timestamps
 for(const run of runs){
  if(!run.createdAt)continue;
  const runMs=Date.parse(run.createdAt);
  if(!Number.isFinite(runMs)||runMs<sevenDaysAgo)continue;
  const isoAt=new Date(runMs).toISOString();

  realEvents.push({
   type:'session_start',
   at:isoAt,
   agent:'other',
   sessionId:run.runId,
   eventId:`run-start-${run.runId}`
  });

  // Authentic completion timestamp: ONLY if genuine finishedAt is available
  if(['DONE','SUCCESS','FINISHED','CLOSE'].includes(run.state)&&run.finishedAt){
   const finMs=Date.parse(run.finishedAt);
   if(Number.isFinite(finMs)&&finMs>=sevenDaysAgo){
    realEvents.push({
     type:'task_finish',
     at:new Date(finMs).toISOString(),
     agent:'other',
     sessionId:run.runId,
     eventId:`run-fin-${run.runId}`
    });
   }
  }
 }

 // 2. Genuine on-device feed events using their authentic occurrence timestamps
 for(const item of feed.items){
  const ts=item.timestamp||0;
  if(ts<sevenDaysAgo)continue;
  const isoAt=new Date(ts).toISOString();

  if(item.state==='FILE'){
   realEvents.push({
    type:'edit',
    at:isoAt,
    agent:'other',
    eventId:`file-${item.id}`
   });
  }else if(item.state==='ACTION'&&item.title==='Chat message submitted'){
   realEvents.push({
    type:'question',
    at:isoAt,
    agent:'other',
    eventId:`chat-${item.id}`
   });
  }
  // No synthetic approvals or fabricated file counts are inferred from label text
 }

 // 3. Genuine agent sessions and tool events from SessionStore (F27)
 const sessionRecapEvents=sessionStore.getSessionEventsForRecap(sevenDaysAgo);
 for(const ev of sessionRecapEvents){
  realEvents.push(ev);
 }

 if(!realEvents.length){
  activeRecapData=null;
  q<HTMLElement>('#recap-preview-box').hidden=false;
  q<HTMLElement>('#recap-text').textContent='No recorded activity in the past 7 days.\nGenuine activity from file inspections, questions, or CLI runs will appear here.';
  return;
 }
 try{
  activeRecapData=buildWeeklyRecap(realEvents);
  const text=recapText(activeRecapData);
  q<HTMLElement>('#recap-preview-box').hidden=false;
  q<HTMLElement>('#recap-text').textContent=text;
  feed.recordEvent('Weekly recap generated',`${activeRecapData.weekStart} (${realEvents.length} events)`,'ACTION');
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
  }catch(err){feed.recordEvent('Diagnostics error',String(err));}
 }else{
  feed.recordEvent('Diagnostics exported','Local session JSON generated','ACTION');
 }
 renderAlerts();
});

// S03: Agent Provider Hook Installer
let detectedProviders: Array<[any, any]> = [];
let currentHookPreview: any = null;

async function runProviderDetection(){
 if(!isTauri)return;
 const badge=q<HTMLElement>('#provider-detect-badge');
 const detail=q<HTMLElement>('#provider-detect-detail');
 badge.textContent='Detecting...';
 badge.className='badge-tag';
 try{
  detectedProviders=await native('detect_agent_providers') as Array<[any, any]>;
  const agy=detectedProviders.find(([def])=>def.id==='antigravity');
  if(agy){
   const [,res]=agy;
   if(res.status==='installed'){
    badge.textContent='Installed';
    badge.style.color='var(--accent)';
    detail.textContent=`Antigravity detected (${res.path})`;
   }else{
    badge.textContent='Not Found';
    badge.style.color='var(--muted)';
    detail.textContent='Antigravity CLI was not detected at standard locations';
   }
  }
 }catch(err){
  badge.textContent='Error';
  detail.textContent=String(err);
 }
}

async function previewHooks(){
 const statusLine=q<HTMLElement>('#installer-status-line');
 const providerId=q<HTMLSelectElement>('#installer-provider-select').value;
 let wsPath=q<HTMLInputElement>('#installer-workspace-path').value.trim();
 if(!wsPath){
  const projInput=q<HTMLInputElement>('#project-root');
  if(projInput&&projInput.value.trim()){
   wsPath=projInput.value.trim();
   q<HTMLInputElement>('#installer-workspace-path').value=wsPath;
  }
 }
 if(!wsPath){
  statusLine.textContent='Please provide an absolute workspace root path';
  statusLine.style.color='#ef4444';
  return;
 }
 statusLine.textContent='Loading configuration preview...';
 statusLine.style.color='var(--muted)';
 try{
  const preview=await native('preview_provider_hooks',{
   providerId,
   workspacePath:wsPath
  }) as any;
  currentHookPreview=preview;
  const card=q<HTMLElement>('#installer-preview-card');
  card.hidden=false;
  q<HTMLElement>('#installer-action-badge').textContent=preview.existing_group_present?'Repair / Update Preview':'Install Preview';
  q<HTMLElement>('#installer-scope-badge').textContent=preview.scope;
  q<HTMLElement>('#installer-target-path').textContent=preview.config_path;
  q<HTMLElement>('#installer-backup-path').textContent=preview.backup_path;
  q<HTMLElement>('#installer-preserved-groups').textContent=preview.preserved_groups.length?preview.preserved_groups.join(', '):'None (Fresh config)';

  const warnBox=q<HTMLElement>('#installer-warnings-box');
  if(preview.warnings&&preview.warnings.length>0){
   warnBox.hidden=false;
   warnBox.textContent=preview.warnings.join('\n');
  }else{
   warnBox.hidden=true;
  }

  q<HTMLElement>('#installer-diff-text').textContent=JSON.stringify(preview.group_to_add,null,2);

  const consent=q<HTMLInputElement>('#installer-consent-check');
  consent.checked=false;
  const installBtn=q<HTMLButtonElement>('#btn-install-hooks');
  installBtn.disabled=true;
  installBtn.textContent=preview.existing_group_present?'Repair Hooks':'Install Hooks';

  statusLine.textContent=preview.safe?'Preview ready. Check approval to proceed.':'Warning: Preview has unresolved notices.';
  statusLine.style.color=preview.safe?'var(--sub)':'#f59e0b';
 }catch(err){
  statusLine.textContent=`Preview error: ${String(err)}`;
  statusLine.style.color='#ef4444';
 }
}

async function installHooks(){
 const statusLine=q<HTMLElement>('#installer-status-line');
 const providerId=q<HTMLSelectElement>('#installer-provider-select').value;
 const wsPath=q<HTMLInputElement>('#installer-workspace-path').value.trim();
 const consent=q<HTMLInputElement>('#installer-consent-check').checked;
 if(!consent){
  statusLine.textContent='Explicit user consent is required before installing hooks';
  statusLine.style.color='#ef4444';
  return;
 }
 statusLine.textContent='Applying configuration...';
 statusLine.style.color='var(--muted)';
 try{
  const outcome=await native('install_provider_hooks',{
   providerId,
   workspacePath:wsPath,
   confirmed:true
  }) as any;
  statusLine.textContent=`Success: ${outcome.message}`;
  statusLine.style.color='var(--accent)';
  feed.recordEvent('Hooks installed',`Provider: ${providerId}, action: ${outcome.action}`,'AGENT');
  renderAlerts();
  void previewHooks();
 }catch(err){
  statusLine.textContent=`Install error: ${String(err)}`;
  statusLine.style.color='#ef4444';
 }
}

async function uninstallHooks(){
 const statusLine=q<HTMLElement>('#installer-status-line');
 const providerId=q<HTMLSelectElement>('#installer-provider-select').value;
 const wsPath=q<HTMLInputElement>('#installer-workspace-path').value.trim();
 statusLine.textContent='Removing hooks...';
 statusLine.style.color='var(--muted)';
 try{
  const outcome=await native('uninstall_provider_hooks',{
   providerId,
   workspacePath:wsPath
  }) as any;
  statusLine.textContent=`Success: ${outcome.message}`;
  statusLine.style.color='var(--accent)';
  feed.recordEvent('Hooks uninstalled',`Provider: ${providerId}`,'AGENT');
  renderAlerts();
  void previewHooks();
 }catch(err){
  statusLine.textContent=`Uninstall error: ${String(err)}`;
  statusLine.style.color='#ef4444';
 }
}

q<HTMLButtonElement>('#btn-detect-providers')?.addEventListener('click',()=>void runProviderDetection());
q<HTMLButtonElement>('#btn-preview-hooks')?.addEventListener('click',()=>void previewHooks());
q<HTMLInputElement>('#installer-consent-check')?.addEventListener('change',e=>{
 const checked=(e.target as HTMLInputElement).checked;
 q<HTMLButtonElement>('#btn-install-hooks').disabled=!checked;
});
q<HTMLButtonElement>('#btn-install-hooks')?.addEventListener('click',()=>void installHooks());
q<HTMLButtonElement>('#btn-uninstall-hooks')?.addEventListener('click',()=>void uninstallHooks());

let activePrUrl = '';
let activeRepoUrl = '';

async function refreshGitHubIntegration() {
 const slugEl = q<HTMLElement>('#github-repo-slug');
 const branchEl = q<HTMLElement>('#github-branch-name');
 const prTitle = q<HTMLElement>('#github-pr-title');
 const prBadge = q<HTMLElement>('#github-pr-badge');
 const prMeta = q<HTMLElement>('#github-pr-meta');
 const openPrBtn = q<HTMLButtonElement>('#github-open-pr-btn');
 const openRepoBtn = q<HTMLButtonElement>('#github-open-repo-btn');
 const runsList = q<HTMLElement>('#github-runs-list');
 const statusLine = q<HTMLElement>('#github-status-line');

 if (slugEl) slugEl.textContent = 'Repository: inspecting...';
 if (statusLine) statusLine.textContent = 'Querying GitHub status...';

 try {
  const raw = await native('get_github_status', { workspaceRoot: null, token: null });
  const norm = normalizeGitHubStatus(raw);

  if (norm.repoSlug) {
   if (slugEl) slugEl.textContent = `Repository: ${norm.repoSlug}`;
   activeRepoUrl = `https://github.com/${norm.repoSlug}`;
   if (openRepoBtn) openRepoBtn.hidden = false;
  } else {
   if (slugEl) slugEl.textContent = 'Repository: (none or non-GitHub)';
   if (openRepoBtn) openRepoBtn.hidden = true;
  }

  if (branchEl) {
   branchEl.textContent = norm.branch ? `Branch: ${norm.branch}` : 'Branch: —';
  }

  if (norm.pr) {
   activePrUrl = norm.pr.url;
   if (prTitle) prTitle.textContent = `#${norm.pr.number} ${norm.pr.title}`;
   if (prBadge) {
    prBadge.hidden = false;
    prBadge.textContent = norm.pr.isDraft ? 'Draft' : norm.pr.state;
   }
   if (prMeta) {
    const review = norm.pr.reviewDecision ? `Review: ${norm.pr.reviewDecision}` : 'Review: None';
    const checks = norm.pr.checksConclusion ? `Checks: ${norm.pr.checksConclusion}` : 'Checks: None';
    prMeta.textContent = `${review} · ${checks}`;
   }
   if (openPrBtn) openPrBtn.hidden = !activePrUrl;
  } else {
   activePrUrl = '';
   if (prTitle) prTitle.textContent = 'No open pull request for active branch';
   if (prBadge) prBadge.hidden = true;
   if (prMeta) prMeta.textContent = 'Checks: — · Review: —';
   if (openPrBtn) openPrBtn.hidden = true;
  }

  if (runsList) {
   runsList.innerHTML = '';
   if (norm.recentRuns.length > 0) {
    for (const run of norm.recentRuns) {
     const runItem = document.createElement('div');
     runItem.style.display = 'flex';
     runItem.style.justifyContent = 'space-between';
     runItem.style.alignItems = 'center';
     runItem.style.fontSize = '10px';
     const conclusionText = run.conclusion ? run.conclusion.toUpperCase() : run.status.toUpperCase();
     const conclusionColor = run.conclusion === 'success' ? '#51d9a7' : run.conclusion === 'failure' ? '#f87171' : 'var(--sub)';
     runItem.innerHTML = `
      <span>${run.name} (${run.event})</span>
      <span style="color:${conclusionColor};font-weight:600;">${conclusionText}</span>
     `;
     runsList.appendChild(runItem);
    }
   } else {
    runsList.innerHTML = '<small style="color:var(--muted);font-size:10px;">No recent workflow runs found</small>';
   }
  }

  if (statusLine) {
   if (norm.configured) {
    statusLine.textContent = `Authenticated via ${norm.configMethod === 'gh_cli' ? 'GitHub CLI (gh)' : 'token'}`;
    statusLine.style.color = 'var(--accent)';
   } else {
    statusLine.textContent = norm.error || 'Unconfigured';
    statusLine.style.color = 'var(--muted)';
   }
  }
 } catch (err) {
  if (statusLine) {
   statusLine.textContent = `Status check failed: ${err}`;
   statusLine.style.color = '#ef4444';
  }
 }
}

async function checkSingleIntegration(provider: string) {
 const statusSpan = q<HTMLElement>(`#integ-status-${provider}`);
 const badge = q<HTMLElement>(`#integ-badge-${provider}`);
 if (statusSpan) statusSpan.textContent = 'Checking connectivity...';
 if (badge) {
  badge.textContent = 'Checking';
  badge.className = 'badge-tag';
 }
 try {
  const res = await native('check_integration_status', { provider, apiKey: null, baseUrl: null }) as any;
  const norm = normalizeIntegrationResult(res, provider);
  if (norm.status === 'connected') {
   if (statusSpan) statusSpan.textContent = norm.summary || 'Connected & verified';
   if (badge) {
    badge.textContent = 'Connected';
    badge.className = 'badge-tag';
    badge.style.borderColor = '#51d9a7';
    badge.style.color = '#51d9a7';
   }
  } else if (norm.status === 'unconfigured') {
   if (statusSpan) statusSpan.textContent = norm.error || 'Token not configured';
   if (badge) {
    badge.textContent = 'Unconfigured';
    badge.className = 'badge-tag';
    badge.style.borderColor = '';
    badge.style.color = '';
   }
  } else if (norm.status === 'auth_error') {
   if (statusSpan) statusSpan.textContent = norm.error || 'Authentication rejected';
   if (badge) {
    badge.textContent = 'Auth Error';
    badge.className = 'badge-tag';
    badge.style.borderColor = '#ef4444';
    badge.style.color = '#ef4444';
   }
  } else if (norm.status === 'rate_limited') {
   if (statusSpan) statusSpan.textContent = norm.error || 'Rate limit exceeded';
   if (badge) {
    badge.textContent = 'Rate Limited';
    badge.className = 'badge-tag';
    badge.style.borderColor = '#fbbf24';
    badge.style.color = '#fbbf24';
   }
  } else {
   if (statusSpan) statusSpan.textContent = norm.error || 'Connection error';
   if (badge) {
    badge.textContent = 'Error';
    badge.className = 'badge-tag';
    badge.style.borderColor = '#ef4444';
    badge.style.color = '#ef4444';
   }
  }
 } catch (err) {
  if (statusSpan) statusSpan.textContent = String(err);
  if (badge) {
   badge.textContent = 'Failed';
   badge.className = 'badge-tag';
   badge.style.borderColor = '#ef4444';
   badge.style.color = '#ef4444';
  }
 }
}

function renderConnectedServicesList() {
 const container = q<HTMLElement>('#integrations-list');
 if (!container) return;
 container.innerHTML = '';
 for (const svc of SUPPORTED_INTEGRATIONS) {
  const item = document.createElement('div');
  item.className = 'setting';
  item.style.alignItems = 'center';
  item.innerHTML = `
   <span>
    <strong>${svc.name}</strong>
    <small>${svc.description} · ${svc.envVar}</small>
    <span class="integ-status-text" id="integ-status-${svc.id}" style="display:block;font-size:10px;color:var(--muted);margin-top:2px;">Status: Unchecked</span>
   </span>
   <div style="display:flex;gap:6px;align-items:center;">
    <span class="badge-tag" id="integ-badge-${svc.id}">Unchecked</span>
    <button class="minor-btn" type="button" id="integ-btn-${svc.id}" style="padding:3px 8px;font-size:10px;">Check</button>
   </div>
  `;
  const btn = item.querySelector<HTMLButtonElement>(`#integ-btn-${svc.id}`);
  if (btn) {
   btn.addEventListener('click', () => void checkSingleIntegration(svc.id));
  }
  container.appendChild(item);
 }
}

q<HTMLButtonElement>('#github-refresh-btn')?.addEventListener('click', () => void refreshGitHubIntegration());
q<HTMLButtonElement>('#github-open-repo-btn')?.addEventListener('click', () => {
 if (activeRepoUrl) {
  window.open(activeRepoUrl, '_blank');
 }
});
q<HTMLButtonElement>('#github-open-pr-btn')?.addEventListener('click', () => {
 if (activePrUrl) {
  window.open(activePrUrl, '_blank');
 }
});

// S12: Flow offline dictation and snippets controller
const flowController = new FlowDictationController();
let isDictating = false;
let flowStats = { wordsCount: 0, charactersCount: 0, sessionsCount: 0 };

async function refreshFlowEngineStatus() {
 if (!isTauri) {
  const badge = q<HTMLElement>('#flow-engine-badge');
  if (badge) badge.textContent = 'Browser Simulation';
  return;
 }
 try {
  const status = await native('get_flow_engine_status') as {
   available: boolean;
   engine_name: string;
   local_only: boolean;
   hotkey: string;
   hotkey_registered: boolean;
  };
  const badge = q<HTMLElement>('#flow-engine-badge');
  if (badge) {
   badge.textContent = status.available ? status.engine_name : 'Unavailable';
   badge.style.borderColor = status.available ? 'var(--accent)' : '#ef4444';
   badge.style.color = status.available ? 'var(--accent)' : '#ef4444';
  }
  const hk = q<HTMLElement>('#flow-hotkey-badge');
  if (hk) hk.textContent = status.hotkey || 'Alt+D';
 } catch (err) {
  console.error('Failed to get flow engine status:', err);
 }
}

function renderFlowSnippets() {
 const list = q<HTMLElement>('#flow-snippets-list');
 if (!list) return;
 list.innerHTML = '';
 for (const snip of DEFAULT_SNIPPETS) {
  const row = document.createElement('div');
  row.className = 'setting';
  row.style.alignItems = 'center';
  row.innerHTML = `
   <span>
    <strong><code>${snip.trigger}</code></strong>
    <small>${snip.description || 'Snippet expansion'}</small>
   </span>
   <span class="badge-tag" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${snip.replacement}</span>
  `;
  list.appendChild(row);
 }
}

function updateFlowStatsUI() {
 const sessEl = q<HTMLElement>('#flow-stat-sessions');
 if (sessEl) sessEl.textContent = `${flowStats.sessionsCount} session${flowStats.sessionsCount === 1 ? '' : 's'}`;
 const wordsEl = q<HTMLElement>('#flow-stat-words');
 if (wordsEl) wordsEl.textContent = `${flowStats.wordsCount} word${flowStats.wordsCount === 1 ? '' : 's'}`;
}

flowController.setEnabled(Boolean(prefs.flowEnabled));
flowController.pushToTalk = Boolean(prefs.flowPushToTalk);

const flowEnableCheck = q<HTMLInputElement>('#setting-flow-enable');
if (flowEnableCheck) {
 flowEnableCheck.addEventListener('change', e => {
  const enabled = (e.target as HTMLInputElement).checked;
  updatePrefs({ flowEnabled: enabled });
  flowController.setEnabled(enabled);
 });
}

const flowPttCheck = q<HTMLInputElement>('#setting-flow-push-to-talk');
if (flowPttCheck) {
 flowPttCheck.addEventListener('change', e => {
  const ptt = (e.target as HTMLInputElement).checked;
  updatePrefs({ flowPushToTalk: ptt });
  flowController.pushToTalk = ptt;
 });
}

const flowFilterCheck = q<HTMLInputElement>('#setting-flow-filter-fillers');
if (flowFilterCheck) {
 flowFilterCheck.addEventListener('change', e => {
  const filter = (e.target as HTMLInputElement).checked;
  updatePrefs({ flowFilterFillers: filter });
 });
}

// Push-to-talk hotkey handling (Alt+D)
window.addEventListener('keydown', (e: KeyboardEvent) => {
 if (e.altKey && (e.key === 'd' || e.key === 'D')) {
  if (flowController.enabled) {
   e.preventDefault();
   if (!isDictating) {
    isDictating = true;
    flowController.startListening();
    playFeedbackSound('tap');
   }
  }
 }
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
 if (e.key === 'Alt' || e.key === 'd' || e.key === 'D') {
  if (flowController.enabled && flowController.pushToTalk && isDictating) {
   e.preventDefault();
   isDictating = false;
   const result = flowController.stopListening('', DEFAULT_SNIPPETS);
   if (result) {
    flowStats = updateDictationStats(flowStats, result);
    updateFlowStatsUI();
   }
  }
 }
});

async function initialize(){
 const startupProv=q<HTMLSelectElement>('#chat-provider-select')?.value||'gemini';
 onProviderChange(startupProv);
 setPanel('now');renderRuns();renderAlerts();renderMedia();renderAgentSessions();renderChatMessages();renderConnectedServicesList();renderFlowSnippets();updateFlowStatsUI();
 if(sourcePath){q<HTMLInputElement>('#project-root').value=sourcePath;q<HTMLButtonElement>('.disconnect').hidden=false;q<HTMLDetailsElement>('#project-details').open=true;void refreshRuns();}
 if(isTauri){
  try{
   await listen<string>('island:tray',e=>{if(e.payload==='expand'){setMode('compact',true);setMode('expanded');}if(e.payload==='compact')setMode('compact',true);syncGazePolling();});
   await listen<string>('island:visibility',e=>{if(e.payload==='hidden')stopGazePolling();else syncGazePolling();});
   await listen<NativeAgentEvent>('island:agent-event',e=>{
    sessionStore.ingestEvent(e.payload);
   });
   await listen<ApprovalSnapshot>('island:approval-requested',e=>{
    sessionStore.setPendingApproval(e.payload);
    playFeedbackSound('tap');
   });
   await listen<{request_id:string,status:string}>('island:approval-resolved',e=>{
    sessionStore.resolvePendingApproval(e.payload.request_id,e.payload.status);
   });
   try{
    const rawSessions=await native('get_agent_sessions') as NativeSessionSnapshot[];
    if(Array.isArray(rawSessions)){
     sessionStore.hydrateSessions(rawSessions);
    }
   }catch{}
   try{
    const rawApprovals=await native('get_pending_approvals') as ApprovalSnapshot[];
    if(Array.isArray(rawApprovals)){
     for(const snap of rawApprovals){
      sessionStore.setPendingApproval(snap);
     }
    }
   }catch{}
   await native('set_window_priority',{enabled:prefs.alwaysOnTop});
  }catch(err){console.error('Island init:',err);}
 }
 sessionStore.subscribe(()=>{
  renderAgentSessions();
  syncGuardian();
 });
 setMode(prefs.pinned?'pinned':'compact',true);
 void refreshMedia();startVolumePolling();renderClipboard();
 setInterval(()=>{if(!document.hidden||mode==='compact')void refreshMedia();},5000);
 setInterval(()=>{if(sourcePath&&(prefs.notifyRunChanges||!document.hidden))void refreshRuns();},10000);
}
void initialize();
