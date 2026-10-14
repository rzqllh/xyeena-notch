import test from 'node:test';
import assert from 'node:assert/strict';
import {IdentityLionRig,lionGazeTarget,physicalPointerToCss,clamp} from '../src/identity-lion.js';
test('gaze has dead zone and anatomical bounds',()=>{
 assert.deepEqual(lionGazeTarget({x:100,y:100},{x:100,y:100}),{x:0,y:0});
 assert.deepEqual(lionGazeTarget({x:5000,y:-5000},{x:100,y:100}),{x:1,y:-1});
 assert.deepEqual(lionGazeTarget({x:1,y:2},{x:NaN,y:2}),{x:0,y:0});
});
test('negative monitor offsets and DPI convert consistently',()=>{
 assert.deepEqual(physicalPointerToCss({x:-1430,y:150},{x:-1680,y:100},1.25),{x:200,y:40});
 assert.equal(physicalPointerToCss({x:0,y:0},{x:0,y:0},0),null);
});
test('eyes lead head, body never moves',()=>{
 const rig=new IdentityLionRig();rig.setGaze(1,-1);rig.advance(.016);
 assert.ok(rig.eye.x>rig.head.x&&rig.eye.y<rig.head.y);
 for(let i=0;i<250;i++)rig.advance(.016);
 assert.ok(Math.abs(rig.head.x-1)<.001);
 assert.equal(Object.hasOwn(rig,'position'),false);
});
test('frame spikes and reduced motion are bounded',()=>{
 const rig=new IdentityLionRig();rig.setGaze(1,1);rig.advance(900);
 assert.ok(rig.head.x<.3);rig.setReducedMotion(true);
 assert.deepEqual(rig.head,{x:0,y:0});assert.deepEqual(rig.eye,{x:1,y:1});
});
test('no invented state; invalid draw is safe',()=>{
 const rig=new IdentityLionRig();rig.setEmotion('approval');assert.equal(rig.emotion,'idle');
 assert.throws(()=>rig.draw(null),TypeError);rig.draw({save(){}},0,0);
 assert.equal(clamp(NaN,-1,1),0);
});
