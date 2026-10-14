import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSessions,pickSession,sourceLabel} from '../src/core/media-sessions.mjs';
import {normalizeMeeting,elapsedMeeting} from '../src/core/meeting.mjs';
import {RunChangeFeed} from '../src/core/notifications.mjs';
import {shellDimensions} from '../src/core/island-machine.mjs';

test('multiple Windows playback sessions are bounded and selectable',()=>{
 const overview=normalizeSessions({currentSource:'browser',sessions:[
  {available:true,source:'spotify',title:'A',artist:'B',playing:true},
  {available:true,source:'browser',title:'Video',artist:'Page',playing:false},
  {available:false,source:'nope'},
 ]});
 assert.equal(overview.sessions.length,2);
 assert.equal(pickSession(overview).source,'browser');
 assert.equal(pickSession(overview,'spotify').source,'spotify');
 assert.equal(pickSession(overview,'missing').source,'browser');
 assert.equal(sourceLabel('spotify.exe'),'spotify');
 assert.deepEqual(normalizeSessions({sessions:null}).sessions,[]);
});

test('meeting mode remains explicit and does not infer Teams from playback',()=>{
 assert.deepEqual(normalizeMeeting({}),{active:false,startedAt:0});
 assert.deepEqual(normalizeMeeting({active:'yes',startedAt:-10}),{active:false,startedAt:0});
 assert.deepEqual(normalizeMeeting({active:true,startedAt:1000}),{active:true,startedAt:1000});
 assert.equal(elapsedMeeting(1000,121000),'2m');
 assert.equal(elapsedMeeting(1000,3661000),'1h 01m');
});

test('test Windows toast is also visible in activity history',()=>{
 const feed=new RunChangeFeed();const notice=feed.recordTest();
 assert.equal(notice.title,'Notification test');
 assert.equal(feed.items[0].id,notice.id);
 assert.equal(feed.items.length,1);
});

test('expanded body fits native geometry constraints and supports scroll',()=>{
 const g=shellDimensions('expanded');
 assert.equal(g.height,396);
 assert.ok(g.width<=640&&g.height<=420);
});
