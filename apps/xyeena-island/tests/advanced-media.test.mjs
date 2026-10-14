import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMedia,safeDuration,timeLabel} from '../src/core/media.mjs';
test('timeline bounds and formats durations without guessing',()=>{
 const media=normalizeMedia({available:true,source:'app',playing:true,positionMs:150_000,durationMs:120_000,canSeek:true});
 assert.equal(media.positionMs,120_000);assert.equal(timeLabel(media.durationMs),'2:00');
 assert.equal(safeDuration(Number.NaN),0);assert.equal(safeDuration(-1),0);
 assert.equal(normalizeMedia({durationMs:0,canSeek:true}).canSeek,false);
});
