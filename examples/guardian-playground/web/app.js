import { defineXyeenaGuardian, STATES, VARIANTS, isState, stateForEvent, pickMascotState, clamp01 } from '/mascot/index.js';

defineXyeenaGuardian();

const byId = id => document.getElementById(id);
const mascot = byId('guardian');
const island = byId('island');
const stateGroup = byId('states');
const agentGroup = byId('agents-grid');
const variantPicker = byId('variant');
const agentIds = ['codex', 'claude', 'github', 'n8n'];
const agentNames = { codex: 'Codex', claude: 'Claude Code', github: 'GitHub', n8n: 'n8n' };
const agentColors = { codex:'#51d9a7',claude:'#dda06f',github:'#a3a9bf',n8n:'#f29367' };
const importantStatuses = ['idle', 'working', 'thinking', 'searching', 'question', 'approval', 'finished', 'error', 'rate_limit', 'sleeping', 'dizzy', 'greeting', 'upload', 'proud', 'dancing', 'wink', 'surprised', 'annoyed', 'love', 'yawn'];
const tasks = new Map(agentIds.map(id => [id, { id, name: agentNames[id], status: 'idle', message: 'No active task' }]));
let activeTimer = null;
let mode = 'expanded';
let currentAgent = 'Local preview';
let lastMessage = '';

const stamp = () => new Intl.DateTimeFormat(undefined, {hour:'2-digit', minute:'2-digit'}).format(new Date());

function syncCurrentState() {
  const config = STATES[mascot.state] || STATES.idle;
  byId('activity-title').textContent = {
    idle:'Standing guard',working:'Getting things done',thinking:'Considering the options',
    searching:'Looking into it',finished:'Task completed',error:'Action needs attention',
    approval:'Your approval is needed',question:'One quick question',upload:'Shield transfer',
    greeting:'Guardian reporting in',rate_limit:'Waiting to retry'
  }[mascot.state] || config.label;
  byId('activity-type').textContent = config.label.toUpperCase();
  byId('activity-description').textContent = lastMessage || config.message;
  byId('activity-agent').textContent = currentAgent;
  byId('activity-timestamp').textContent = stamp();
  byId('sequence-label').textContent = config.label;
  island.style.setProperty('--status-accent', config.color);
  const approvalPending = [...tasks.values()].some(task => task.status === 'needs_approval' || task.status === 'approval');
  byId('approval-bar').hidden = !approvalPending;
  for (const button of stateGroup.children) {
    const pressed = button.dataset.state === mascot.state;
    button.setAttribute('aria-pressed', String(pressed));
  }
}

function changeState(status, origin='Local preview', message='') {
  const normalized = stateForEvent(status);
  currentAgent = origin;
  lastMessage = message;
  if (normalized === 'greeting') mascot.greet();
  else if (normalized === 'upload') beginTransfer();
  else mascot.setState(normalized);
  syncCurrentState();
}

function statusButton(status) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'state-button';
  btn.dataset.state = status;
  btn.textContent = STATES[status].label;
  btn.addEventListener('click', () => changeState(status));
  return btn;
}
importantStatuses.forEach(status => stateGroup.append(statusButton(status)));
VARIANTS.forEach(variant => {
  const option = document.createElement('option');
  option.value = variant;
  option.textContent = variant.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());
  variantPicker.append(option);
});
variantPicker.addEventListener('change', () => mascot.setVariant(variantPicker.value));

function setMode(next) {
  mode = next;
  island.dataset.mode = next;
  byId('mode-label').textContent = next.toUpperCase();
  for(const option of ['expanded','compact']) {
    const button = byId(option + '-btn');
    button.classList.toggle('selected', next === option);
    button.setAttribute('aria-pressed', String(next === option));
  }
}
byId('expanded-btn').addEventListener('click', () => setMode('expanded'));
byId('compact-btn').addEventListener('click', () => setMode('compact'));

function updateAgent(id, status, message='') {
  if(!agentIds.includes(id) || typeof status !== 'string') return false;
  const normalized = stateForEvent(status);
  if(normalized === 'idle' && !['idle','cancelled','paused'].includes(status)) return false;
  const name = agentNames[id];
  tasks.set(id,{id,name,status,message:typeof message==='string'?message.slice(0,200):''});
  currentAgent = name;
  lastMessage = typeof message==='string' ? message.slice(0,200) : '';
  const winner = pickMascotState([...tasks.values()]);
  mascot.setState(winner);
  paintAgents();
  syncCurrentState();
  byId('event-output').textContent = `${name} · ${normalized} · ${stamp()}`;
  return true;
}

function paintAgents() {
  const nodes = [];
  for(const task of tasks.values()) {
    const card = document.createElement('div'); card.className = 'agent-row';
    const bullet = document.createElement('span'); bullet.className='agent-bullet';
    bullet.style.backgroundColor=agentColors[task.id];
    const copy = document.createElement('div'); copy.className='agent-copy';
    const heading = document.createElement('strong'); heading.textContent = task.name;
    const note = document.createElement('small'); note.textContent=task.message || 'No active task';
    copy.append(heading,note);
    const status = document.createElement('span');status.className='agent-status';
    status.textContent=STATES[stateForEvent(task.status)].label;
    card.append(bullet,copy,status);
    nodes.push(card);
  }
  agentGroup.replaceChildren(...nodes);
}

function reset() {
  if(activeTimer) {clearInterval(activeTimer);activeTimer=null;}
  mascot.cancelUpload();
  for(const id of agentIds) tasks.set(id,{id,name:agentNames[id],status:'idle',message:'No active task'});
  currentAgent='Local preview';lastMessage='';
  byId('transfer').hidden=true;
  byId('event-output').textContent='Sample tasks reset';
  paintAgents();mascot.setState('idle');syncCurrentState();
}
byId('reset-btn').addEventListener('click',reset);

function resolveApproval(allow) {
  const waiting = [...tasks.values()].find(task => ['needs_approval','approval'].includes(task.status));
  if(!waiting) return;
  // This is only a local UX preview. The action is not forwarded to a connected tool.
  updateAgent(waiting.id, allow ? 'running' : 'cancelled', allow ? 'Demo approval accepted; task resumed locally' : 'Demo permission denied');
}
byId('allow-approval').addEventListener('click',()=>resolveApproval(true));
byId('deny-approval').addEventListener('click',()=>resolveApproval(false));

function beginTransfer() {
  if(activeTimer) clearInterval(activeTimer);
  activeTimer=null;
  byId('transfer').hidden=false;
  setProgress(0);
  mascot.beginUpload();
  currentAgent='Local transfer demo';
  lastMessage='The guardian shield is receiving a sample file.';
  syncCurrentState();
}
function setProgress(n) {
  const progress = clamp01(n);
  mascot.setUploadProgress(progress);
  byId('transfer-fill').style.width=`${Math.round(progress*100)}%`;
  byId('transfer-percent').textContent=`${Math.round(progress*100)}%`;
}
function simulateTransfer() {
  beginTransfer();
  let value=0;
  // This timer is illustrative only; real transports must push measured byte progress.
  activeTimer=setInterval(()=>{
    value=Math.min(1,value+.035);
    setProgress(value);
    if(value>=1) {clearInterval(activeTimer);activeTimer=null;lastMessage='Transfer preview completed successfully.';}
  },60);
}
byId('greeting-btn').addEventListener('click',()=>{currentAgent='Xyeena';lastMessage='Welcome back. Your workspace is in safe hands.';mascot.greet();syncCurrentState();});
byId('upload-btn').addEventListener('click',simulateTransfer);
mascot.addEventListener('xyeena-state-change',syncCurrentState);
mascot.addEventListener('xyeena-greeting-complete',syncCurrentState);
mascot.addEventListener('xyeena-upload-complete',()=>{lastMessage='Visual transfer sequence finished.';syncCurrentState();});

// An embedding host can dispatch:
// document.dispatchEvent(new CustomEvent('xyeena:agent', { detail: { id:'codex', status:'running', message:'Checking files' } }));
// Events only change UI state. This component never authorizes or performs agent actions.
document.addEventListener('xyeena:agent',event=>{
  const d=event.detail;
  if(!d || typeof d!=='object')return;
  updateAgent(d.id,d.status,d.message);
});
document.addEventListener('xyeena:transfer',event=>{
  const d=event.detail;
  if(!d || typeof d!=='object')return;
  if(d.kind==='start')beginTransfer();
  else if(d.kind==='progress' && typeof d.progress==='number' && Number.isFinite(d.progress))setProgress(d.progress);
  else if(d.kind==='cancel') {if(activeTimer)clearInterval(activeTimer);activeTimer=null;mascot.cancelUpload();byId('transfer').hidden=true;syncCurrentState();}
});

for(const [idx,id] of agentIds.entries()) {
  // Clicking sample agent cards cycles through a deterministic local status for demo purposes.
  const statuses=['running','thinking','needs_approval','completed'];
  const button = document.createElement('button');
  button.className='agent-control';button.type='button';button.textContent=`Demo ${agentNames[id]}`;
  button.addEventListener('click',()=>updateAgent(id,statuses[idx],`Sample ${statuses[idx].replace('_',' ')} event`));
  agentGroup.parentElement?.append(button);
}

const drop = byId('drop-hint');
for(const type of ['dragenter','dragover']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragged');});
for(const type of ['dragleave','drop']) drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragged');});
drop.addEventListener('drop',e=>{if(e.dataTransfer?.files?.length)simulateTransfer();});

paintAgents();syncCurrentState();setMode('expanded');
