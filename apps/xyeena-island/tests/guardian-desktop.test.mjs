import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceTransition,isGuardianBody,clampPosition,followTarget,sanitizeGuardianMode,guardianContextState} from '../src/core/guardian-desktop.mjs';
test('docking lifecycle has guarded transitions and handles interrupted detach',()=>{
 let state='docked';state=presenceTransition(state,'detach');assert.equal(state,'detaching');
 state=presenceTransition(state,'return');assert.equal(presenceTransition(state,'home'),'docked');
 assert.equal(presenceTransition('detached','arrived'),'detached');
 assert.throws(()=>presenceTransition('broken','detach'),RangeError);
});
test('native click-through geometry only accepts guardian body',()=>{
 assert.equal(isGuardianBody({x:90,y:90}),true);
 assert.equal(isGuardianBody({x:0,y:0}),false);
 assert.equal(isGuardianBody({x:179,y:175}),false);
 assert.equal(isGuardianBody({x:Infinity,y:100}),false);
});
test('monitor positioning handles negative desktop coordinates and clamps',()=>{
 const work={x:-1920,y:0,width:1920,height:1080};
 assert.deepEqual(clampPosition(work,{x:-3000,y:-900}),{x:-1912,y:8});
 assert.deepEqual(clampPosition(work,{x:999,y:999}),{x:-188,y:892});
 assert.throws(()=>clampPosition({x:0,y:0,width:100,height:90},{x:0,y:0}),RangeError);
});
test('follow moves away from pointer, including right/bottom edges',()=>{
 const work={x:0,y:0,width:1920,height:1080};
 for(const p of [{x:700,y:400},{x:1890,y:1070},{x:30,y:30}]){
  const out=followTarget(p,work);
  assert.ok(out.x>=8&&out.x<=1732&&out.y>=8&&out.y<=892);
  assert.ok(Math.hypot(out.x+90-p.x,out.y+90-p.y)>85);
 }
});
test('invalid modes and unsupported context never imply running agents',()=>{
 assert.equal(sanitizeGuardianMode('danger'),'perch');
 assert.equal(guardianContextState('unknown'),'idle');
 assert.equal(guardianContextState('attention'),'surprised');
 assert.equal(guardianContextState('playing'),'dancing');
});
