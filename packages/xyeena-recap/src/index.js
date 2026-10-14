// Pure on-device Xyeena recap; no I/O, hooks, collection or storage.
const TYPES=new Set(['session_start','session_finish','edit','command','approval','question','task_finish']);
const AGENTS=new Set(['antigravity','claude','codex','copilot','cursor','gemini','opencode','other']);
const KEYS=['sessions','durationMinutes','filesEdited','linesAdded','linesRemoved','commands','approvalsAllowed','approvalsDenied','questions','tasksCompleted'];
const dayMs=86400000;
const iso=/^\d{4}-\d{2}-\d{2}$/;
const stamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const amount=(n,max=10000000)=>Number.isSafeInteger(n)&&n>=0?Math.min(n,max):0;
const zero=()=>Object.fromEntries(KEYS.map(k=>[k,0]));
const add=(x,k,n=1)=>{x[k]=Math.min(10000000,x[k]+n);};
function fmt(zone){
 if(typeof zone!=='string'||zone.length>64)throw new TypeError('Invalid timezone');
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});}
 catch{throw new RangeError('Unknown timezone');}
}
function localDay(date,format){
 const p=Object.fromEntries(format.formatToParts(date).filter(v=>['year','month','day'].includes(v.type)).map(v=>[v.type,v.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function shift(day,n){
 if(typeof day!=='string'||!iso.test(day))throw new TypeError('Invalid date');
 const value=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(value)||new Date(value).toISOString().slice(0,10)!==day)throw new TypeError('Invalid date');
 return new Date(value+n*dayMs).toISOString().slice(0,10);
}
export function weeklyWindow({now=new Date(),timeZone='UTC',week='previous'}={}){
 if(!['previous','current'].includes(week))throw new TypeError('Invalid week');
 const date=new Date(now);
 if(!Number.isFinite(date.getTime()))throw new TypeError('Invalid reference time');
 const today=localDay(date,fmt(timeZone));
 const weekday=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;
 const start=shift(today,-weekday-(week==='previous'?7:0));
 return {weekStart:start,weekEndExclusive:shift(start,7),dates:Array.from({length:7},(_,i)=>shift(start,i))};
}
export function buildWeeklyRecap(events,options={}){
 if(!Array.isArray(events)||events.length>10000)throw new RangeError('Maximum 10000 events');
 const f=fmt(options.timeZone??'UTC'),window=weeklyWindow(options);
 const out={schemaVersion:1,weekStart:window.weekStart,weekEndExclusive:window.weekEndExclusive,totals:zero(),
  days:window.dates.map(date=>({date,...zero()})),byAgent:[],busiestDay:null};
 const dates=new Map(out.days.map((v,i)=>[v.date,i])),seenEvents=new Set(),seenSessions=new Set(),seenDurations=new Set(),agents=new Map();
 let accepted=0;
 for(const e of events){
  if(!record(e)||!TYPES.has(e.type)||typeof e.at!=='string'||!stamp.test(e.at))continue;
  const timestamp=new Date(e.at);
  if(!Number.isFinite(timestamp.getTime()))continue;
  const i=dates.get(localDay(timestamp,f));
  if(i===undefined)continue;
  const agent=AGENTS.has(e.agent)?e.agent:'other';
  const sid=typeof e.sessionId==='string'&&e.sessionId.length>0&&e.sessionId.length<=128?agent+'\0'+e.sessionId:null;
  const eid=typeof e.eventId==='string'&&e.eventId.length>0&&e.eventId.length<=128?agent+'\0'+e.eventId:null;
  if(eid&&seenEvents.has(eid))continue;
  if(eid)seenEvents.add(eid);
  accepted++;
  const bucket=out.days[i],inc=(key,n=1)=>{add(bucket,key,n);add(out.totals,key,n);};
  if((e.type==='session_start'||e.type==='session_finish')&&sid&&!seenSessions.has(sid)){
   seenSessions.add(sid);inc('sessions');agents.set(agent,(agents.get(agent)||0)+1);
  }
  if(e.type==='session_finish'&&sid&&!seenDurations.has(sid)){
   seenDurations.add(sid);inc('durationMinutes',Math.round(amount(e.durationMs,dayMs)/60000));
  }
  if(e.type==='edit'){inc('filesEdited');inc('linesAdded',amount(e.linesAdded,100000));inc('linesRemoved',amount(e.linesRemoved,100000));}
  if(e.type==='command')inc('commands');
  if(e.type==='approval'&&e.decision==='allow')inc('approvalsAllowed');
  if(e.type==='approval'&&e.decision==='deny')inc('approvalsDenied');
  if(e.type==='question')inc('questions');
  if(e.type==='task_finish')inc('tasksCompleted');
 }
 out.byAgent=[...agents].map(([agent,sessions])=>({agent,sessions})).sort((a,b)=>b.sessions-a.sessions||a.agent.localeCompare(b.agent));
 if(accepted)out.busiestDay=[...out.days].sort((a,b)=>b.sessions-a.sessions||b.commands-a.commands||a.date.localeCompare(b.date))[0].date;
 return out;
}
export function sanitizeRecap(input){
 if(!record(input)||input.schemaVersion!==1||typeof input.weekStart!=='string')return null;
 let end;try{end=shift(input.weekStart,7);}catch{return null;}
 if(input.weekEndExclusive!==end||!record(input.totals)||!Array.isArray(input.days)||input.days.length!==7)return null;
 const pick=x=>Object.fromEntries(KEYS.map(k=>[k,amount(x?.[k])]));
 const days=[];
 for(let i=0;i<7;i++){const d=input.days[i];if(!record(d)||d.date!==shift(input.weekStart,i))return null;days.push({date:d.date,...pick(d)});}
 const unique=new Map();
 if(Array.isArray(input.byAgent))for(const item of input.byAgent.slice(0,32)){
  if(record(item)&&AGENTS.has(item.agent))unique.set(item.agent,amount(item.sessions));
 }
 return {schemaVersion:1,weekStart:input.weekStart,weekEndExclusive:end,totals:pick(input.totals),days,
  byAgent:[...unique].map(([agent,sessions])=>({agent,sessions})).sort((a,b)=>b.sessions-a.sessions||a.agent.localeCompare(b.agent)),
  busiestDay:days.some(d=>d.date===input.busiestDay)?input.busiestDay:null};
}
export function upsertArchive(existing,recap,{now=new Date(),timeZone='UTC',maxWeeks=12}={}){
 if(!Number.isInteger(maxWeeks)||maxWeeks<1||maxWeeks>52)throw new RangeError('Invalid retention');
 const current=weeklyWindow({now,timeZone,week:'current'}).weekStart,earliest=shift(current,-7*(maxWeeks-1)),weeks=new Map();
 for(const item of [...(Array.isArray(existing)?existing.slice(0,100):[]),recap]){
  const clean=sanitizeRecap(item);
  if(clean&&clean.weekStart>=earliest&&clean.weekStart<=current)weeks.set(clean.weekStart,clean);
 }
 return [...weeks.values()].sort((a,b)=>b.weekStart.localeCompare(a.weekStart)).slice(0,maxWeeks);
}
export function recapText(value){
 const r=sanitizeRecap(value);if(!r)throw new TypeError('Invalid recap');
 const t=r.totals;
 return ['Xyeena weekly recap | '+r.weekStart,t.sessions+' sessions | '+t.durationMinutes+' minutes',
  t.filesEdited+' edits | +'+t.linesAdded+' / -'+t.linesRemoved+' lines',
  t.commands+' commands | '+t.tasksCompleted+' tasks',t.approvalsAllowed+' allowed | '+t.approvalsDenied+' denied | '+t.questions+' questions'].join('\n');
}
export function recapSvg(value){
 const r=sanitizeRecap(value);if(!r)throw new TypeError('Invalid recap');
 const t=r.totals,maximum=Math.max(1,...r.days.map(d=>d.sessions));
 const bars=r.days.map((d,i)=>{
  const height=Math.round(240*d.sessions/maximum),x=90+130*i;
  return '<rect x="'+x+'" y="'+(1130-height)+'" width="72" height="'+height+'" rx="12" fill="#B94646"/>'+
   '<text x="'+(x+36)+'" y="1170" text-anchor="middle" font-size="22">'+['M','T','W','T','F','S','S'][i]+'</text>';
 }).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920" role="img" aria-label="Xyeena weekly recap">'+
  '<rect width="1080" height="1920" fill="#F6F4F0"/><rect x="64" y="64" width="8" height="64" fill="#B94646"/>'+
  '<g font-family="sans-serif" fill="#20252C"><text x="95" y="105" font-size="34">XYEENA</text>'+
  '<text x="80" y="278" font-size="30">WEEKLY ACTIVITY</text>'+
  '<text x="80" y="360" font-size="54">'+r.weekStart+'</text>'+
  '<text x="80" y="600" font-size="190">'+t.sessions+'</text>'+
  '<text x="85" y="660" font-size="34">SESSIONS</text>'+
  '<text x="80" y="795" font-size="64">'+t.durationMinutes+' min</text>'+
  '<text x="85" y="840" font-size="30">TRACKED DURATION</text>'+
  '<text x="80" y="960" font-size="32">Sessions by day</text>'+bars+
  '<text x="80" y="1380" font-size="32">FILE EDITS</text><text x="80" y="1460" font-size="70">'+t.filesEdited+'</text>'+
  '<text x="560" y="1380" font-size="32">COMMANDS</text><text x="560" y="1460" font-size="70">'+t.commands+'</text>'+
  '<text x="80" y="1740" font-size="28">Local aggregate data only. No file contents or prompts.</text></g></svg>';
}
