import test from 'node:test';
import assert from 'node:assert/strict';
import {gazeFromNative,shouldSampleCursor} from '../src/gaze-bridge.js';
test('fresh cursor outside Island creates gaze',()=>{
 assert.deepEqual(gazeFromNative({cursor:{x:1200,y:500},origin:{x:0,y:0},scale:1.25,at:2000},{x:150,y:72},2000),{x:1,y:1});
});
test('discard malformed, stale and impossible samples',()=>{
 const s={cursor:{x:0,y:0},origin:{x:0,y:0},scale:1,at:100};
 assert.equal(gazeFromNative(s,{x:1,y:2},1000),null);
 assert.equal(gazeFromNative({...s,at:5000},{x:1,y:2},1000),null);
 assert.equal(gazeFromNative({...s,scale:0},{x:1,y:2},100),null);
 assert.equal(shouldSampleCursor({islandVisible:true,guardianVisible:true,enabled:true}),true);
 assert.equal(shouldSampleCursor({islandVisible:false,guardianVisible:true,enabled:true}),false);
});
