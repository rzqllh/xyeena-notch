import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyWindow,buildWeeklyRecap,sanitizeRecap,upsertArchive,recapText,recapSvg} from '../src/index.js';
const options={now:'2026-10-14T08:00:00Z',timeZone:'Asia/Jakarta'};
const e=(type,data={},at='2026-10-06T03:00:00Z')=>({type,at,agent:'codex',...data});
test('local previous week boundaries',()=>{const w=weeklyWindow(options);assert.deepEqual([w.weekStart,w.weekEndExclusive],['2026-10-05','2026-10-12']);});
test('Jakarta Monday begins on Sunday UTC',()=>{assert.equal(weeklyWindow({now:'2026-10-11T17:30:00Z',timeZone:'Asia/Jakarta',week:'current'}).weekStart,'2026-10-12');});
test('DST uses local dates',()=>{const w=weeklyWindow({now:'2026-11-03T12:00:00Z',timeZone:'America/New_York'});assert.equal(w.weekStart,'2026-10-26');assert.equal(new Set(w.dates).size,7);});
test('offset changes event inclusion',()=>{const ev=e('command',{},'2026-10-05T02:00:00Z');assert.equal(buildWeeklyRecap([ev],options).totals.commands,1);assert.equal(buildWeeklyRecap([ev],{...options,timeZone:'America/Los_Angeles'}).totals.commands,0);});
test('actual counts, dedup and session duration',()=>{
 const events=[e('session_start',{sessionId:'s',eventId:'a'}),e('session_finish',{sessionId:'s',eventId:'b',durationMs:125000}),
 e('session_finish',{sessionId:'s',eventId:'c',durationMs:9999999}),e('command',{eventId:'d'}),e('command',{eventId:'d'}),
 e('edit',{linesAdded:7,linesRemoved:3}),e('approval',{decision:'allow'}),e('approval',{decision:'deny'}),e('question'),e('task_finish')];
 assert.deepEqual(buildWeeklyRecap(events,options).totals,{sessions:1,durationMinutes:2,filesEdited:1,linesAdded:7,linesRemoved:3,
 commands:1,approvalsAllowed:1,approvalsDenied:1,questions:1,tasksCompleted:1});
});
test('session requires ID',()=>{assert.equal(buildWeeklyRecap([e('session_start')],options).totals.sessions,0);});
test('private strings and unknown providers are excluded',()=>{
 const r=buildWeeklyRecap([e('session_start',{sessionId:'private123',agent:'private-agent',prompt:'password',path:'C:/secret'})],options);
 assert.deepEqual(r.byAgent,[{agent:'other',sessions:1}]);assert.doesNotMatch(JSON.stringify(r),/private123|private-agent|password|C:\/secret/);
});
test('malformed and timezone-less events do not count',()=>{
 assert.equal(buildWeeklyRecap([e('command',{},'bad'),e('command',{},'2026-10-06T03:00:00'),e('command',{},'2026-10-13T03:00:00Z')],options).totals.commands,0);
});
test('safe bounds and malformed batch rejection',()=>{
 assert.equal(buildWeeklyRecap([e('edit',{linesAdded:Infinity,linesRemoved:-1})],options).totals.linesAdded,0);
 assert.throws(()=>buildWeeklyRecap(Array(10001)),RangeError);assert.throws(()=>weeklyWindow({...options,timeZone:'Mars/Olympus'}),RangeError);
});
test('archive strips fields and deduplicates weeks',()=>{
 const r=buildWeeklyRecap([e('command')],options),archive=upsertArchive([{...r,secret:'token'}],r,options);
 assert.equal(archive.length,1);assert.doesNotMatch(JSON.stringify(archive),/token/);
});
test('rolling archive retains at most 12 weeks',()=>{
 const now=new Date('2026-10-14T08:00:00Z');
 const records=Array.from({length:20},(_,i)=>buildWeeklyRecap([],{now:new Date(now.getTime()-i*7*86400000),week:'current'}));
 assert.equal(upsertArchive(records,records[0],{now}).length,12);
});
test('rejects invalid archive dates and shapes',()=>{
 const r=buildWeeklyRecap([],options);
 assert.equal(sanitizeRecap({...r,weekStart:'2026-02-30'}),null);
 assert.equal(sanitizeRecap({...r,days:[]}),null);
 assert.equal(sanitizeRecap({...r,weekStart:{}}),null);
});
test('text and original SVG cannot contain event contents',()=>{
 const r=buildWeeklyRecap([e('session_start',{sessionId:'private',prompt:'password',path:'/secret'})],options);
 const out=recapText(r)+recapSvg(r);
 assert.match(out,/1 sessions/);assert.match(out,/1080/);assert.doesNotMatch(out,/password|\/secret|private|<script/);
});
test('empty week is not fabricated',()=>{
 const r=buildWeeklyRecap([],options);assert.equal(r.totals.sessions,0);assert.equal(r.busiestDay,null);
});
