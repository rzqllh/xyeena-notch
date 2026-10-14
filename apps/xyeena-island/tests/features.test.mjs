import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMedia,EMPTY_MEDIA} from '../src/core/media.mjs';
import {RunChangeFeed} from '../src/core/notifications.mjs';
import {DEFAULT_SETTINGS,sanitizeSettings} from '../src/core/settings.mjs';
test('media snapshot is bounded and rejects invalid availability',()=>{
 assert.deepEqual(normalizeMedia({}),EMPTY_MEDIA);
 assert.deepEqual(normalizeMedia({available:'yes',playing:'true'}),EMPTY_MEDIA);
 assert.equal(normalizeMedia({available:true,title:'a'.repeat(900)}).title.length,128);
});
test('first run scan is silent and status changes are deduplicated',()=>{
 const feed=new RunChangeFeed();
 const list=state=>[{runId:'r1',goal:'Feature shipped',state}];
 assert.deepEqual(feed.update(list('EXECUTE')),[]);
 assert.equal(feed.update(list('VERIFY')).length,0);
 assert.equal(feed.update(list('REVIEW')).length,1);
 assert.equal(feed.update(list('REVIEW')).length,0);
 assert.equal(feed.update(list('CLOSE')).length,1);
 assert.equal(feed.items.length,2);
 feed.reset();assert.deepEqual(feed.items,[]);assert.equal(feed.update(list('DEBUG')).length,0);
});
test('notification settings are opt-in and sanitize types',()=>{
 assert.equal(DEFAULT_SETTINGS.notifyRunChanges,false);
 assert.equal(sanitizeSettings({notifyRunChanges:'true'}).notifyRunChanges,false);
 assert.equal(sanitizeSettings({notifyRunChanges:true}).notifyRunChanges,true);
 assert.equal(sanitizeSettings({showMedia:false}).showMedia,false);
});
