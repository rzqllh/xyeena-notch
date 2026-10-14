import test from 'node:test';
import assert from 'node:assert/strict';
import {ease,interpolateFrame,validFrame,MOTION_MS} from '../src/core/motion.mjs';
import {DEFAULT_SETTINGS,sanitizeSettings} from '../src/core/settings.mjs';
import {normalizeRuns} from '../src/core/run-summaries.mjs';
import {shellDimensions} from '../src/core/island-machine.mjs';

test('geometry animation is bounded at every step',()=>{
 const from=shellDimensions('hidden'),to=shellDimensions('pinned');
 for(let i=0;i<=100;i++){
  const frame=interpolateFrame(from,to,i/100);
  assert.ok(validFrame(frame));
 }
 assert.deepEqual(interpolateFrame(from,to,1),to);
 assert.deepEqual(interpolateFrame(from,to,0),from);
 assert.equal(ease(-4),0);assert.equal(ease(3),1);
 assert.equal(MOTION_MS,320);
});
test('native frame guard rejects NaN, oversized and negative windows',()=>{
 for(const frame of [{width:999,height:9},{width:220,height:500},{width:NaN,height:9},{width:220,height:-3}]){
   assert.equal(validFrame(frame),false);
 }
});
test('settings reject wrong types and invalid enum values',()=>{
 assert.deepEqual(sanitizeSettings({}),DEFAULT_SETTINGS);
 assert.deepEqual(sanitizeSettings({pinned:'false',theme:'neon',motion:'fast'}),DEFAULT_SETTINGS);
 assert.equal(sanitizeSettings({pinned:true,alwaysOnTop:false}).pinned,true);
 assert.equal(sanitizeSettings({theme:'light'}).theme,'light');
});
test('read-only run metadata presentation is bounded and normalizes unknown states',()=>{
 const rows=normalizeRuns([
   {run_id:'run-01',goal:'review PR',workflow_state:'EXECUTE',state:'EXECUTE',created_at:'2026-10-13'},
   {run_id:'run-02',goal:'a'.repeat(300),state:'approved',created_at:'2026-10-13'},
   {run_id:'',goal:'bad'},null,
 ]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].state,'EXECUTE');
 assert.equal(rows[1].state,'UNKNOWN');
 assert.equal(rows[1].goal.length,160);
 assert.deepEqual(normalizeRuns({}),[]);
 assert.equal(normalizeRuns(Array(50).fill({run_id:'run'})).length,8);
});

import {Spring,Tracked,GeometryMotion,closeCurve,CLOSE_MS,RESPONSE,DAMPING} from '../src/core/motion.mjs';
test('ported spring converges at 60Hz and 120Hz with sub-stepping',()=>{
 for(const hz of [60,120]){
  const spring=new Spring(352,RESPONSE,DAMPING);spring.target=620;
  for(let i=0;i<hz*3;i++)spring.step(1/hz);
  assert.ok(Math.abs(spring.value-620)<0.15,`spring missed target at ${hz} Hz`);
 }
});
test('close curve clamps, is monotonic and has correct endpoints',()=>{
 assert.ok(Math.abs(closeCurve(0))<1e-4);
 assert.ok(Math.abs(closeCurve(1)-1)<1e-4);
 let last=0;for(let i=1;i<=100;i++){const value=closeCurve(i/100);assert.ok(value>=last);last=value;}
 assert.equal(CLOSE_MS,340);
});
test('geometry handles interrupted open-close-open without invalid dimensions',()=>{
 const animator=new GeometryMotion(shellDimensions('compact'));
 animator.target(shellDimensions('expanded'),{now:0});
 for(let i=1;i<20;i++){assert.ok(validFrame(animator.step(i*16.667)));}
 animator.target(shellDimensions('compact'),{closing:true,now:350});
 for(let i=21;i<32;i++){assert.ok(validFrame(animator.step(i*16.667)));}
 animator.target(shellDimensions('expanded'),{now:550});
 for(let i=33;i<250;i++){assert.ok(validFrame(animator.step(i*16.667)));}
 assert.ok(Math.abs(animator.value.width-620)<.3);
});
test('reduce motion jumps to final geometry immediately',()=>{
 const anim=new GeometryMotion(shellDimensions('hidden'));
 anim.target(shellDimensions('expanded'),{reduced:true});
 assert.deepEqual(anim.value,shellDimensions('expanded'));
 assert.equal(anim.animating,false);
});
