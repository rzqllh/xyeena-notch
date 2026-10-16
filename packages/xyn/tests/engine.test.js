import test from 'node:test';
import assert from 'node:assert/strict';
import {STATES,VARIANTS,isState,isVariant,stateForEvent} from '../src/states.js';
import {greetingFrame,uploadFrame,clamp01} from '../src/motion.js';
import {pickMascotState,connectAgentEvents} from '../src/events.js';
import {superellipse} from '../src/geometry.js';
import {GuardianController} from '../src/controller.js';
import {mascotArt,eyeMarkup,accessoryMarkup} from '../src/art.js';

test('all states and variants are distinct and recognized',()=>{
  assert.equal(Object.keys(STATES).length,20);assert.equal(new Set(VARIANTS).size,12);
  assert.ok(isState('rate_limit'));assert.ok(isVariant('headset'));assert.equal(isVariant('bogus'),false);
});
test('agent mapping gives approvals priority over finished tasks',()=>{
 assert.equal(stateForEvent('needs_input'),'question');assert.equal(stateForEvent('rate_limited'),'rate_limit');
 assert.equal(pickMascotState([{status:'completed'},{status:'needs_approval'},{status:'running'}]),'approval');
 assert.equal(pickMascotState([{status:'completed'},{status:'failed'}]),'error');
 assert.equal(pickMascotState([]),'idle');
});
test('greeting timeline has finite bounded values and a clear ending',()=>{
 for(let t=0;t<3;t+=.01){const f=greetingFrame(t);assert.ok(f.rise>=0&&f.rise<=1);assert.ok(f.paw>=-1e-8&&f.paw<=1+1e-8);assert.ok(Number.isFinite(f.tilt));}
 assert.equal(greetingFrame(3).done,true);assert.equal(greetingFrame(0).done,false);
 assert.equal(greetingFrame(0,true).done,true);
});
test('upload progress is externally driven, bounded and accessible in reduced motion',()=>{
 assert.equal(uploadFrame(.5,1.8).progress,1);
 assert.equal(uploadFrame(2,-.3).progress,0);
 assert.equal(uploadFrame(2,.25).done,false);
 assert.equal(uploadFrame(2,1,true).done,true);
 assert.equal(clamp01(Number.NaN),0);
});
test('subscribing to agent events is reversible',()=>{
 let handler;const states=[];
 const unsub=connectAgentEvents({setState:s=>states.push(s)},fn=>{handler=fn;return()=>{handler=null;}});
 handler({tasks:[{status:'running'},{status:'needs_input'}]});handler('completed');handler({state:'rate_limited'});
 assert.deepEqual(states,['question','finished','rate_limit']);unsub();assert.equal(handler,null);
});
test('art has standalone unique defs ids and all accessory variants',()=>{
 const art=mascotArt('instance-1');assert.match(art,/instance-1-gold/);assert.match(art,/guardian-svg/);
 assert.equal(eyeMarkup('invalid'),eyeMarkup('dot'));
 for(const variant of VARIANTS)assert.equal(typeof accessoryMarkup(variant,'unique'), 'string');
 assert.ok(superellipse(0,0,5,5,2.7).startsWith('M'));
});

test('controller handles concurrent tasks, interrupt priorities, and transient expiry',()=>{
 let now=100;const controller=new GuardianController({clock:()=>now});const history=[];
 const detach=controller.subscribe(state=>history.push(state));
 controller.setTask('a','running');controller.emote('greeting',500);controller.setTask('b','needs_approval');
 assert.equal(controller.state,'approval');controller.removeTask('b');assert.equal(controller.state,'greeting');
 now=650;controller.tick();assert.equal(controller.state,'working');
 controller.removeTask('a');assert.equal(controller.state,'idle');
 detach();assert.deepEqual(history,['idle','working','greeting','approval','greeting','working','idle']);
});

test('XyeenaGuardian class and define function import safely in Node and browser environments', async () => {
 const { XyeenaGuardian, defineXyeenaGuardian } = await import('../src/guardian.js');
 assert.equal(typeof XyeenaGuardian, 'function');
 assert.equal(typeof defineXyeenaGuardian, 'function');
 assert.equal(defineXyeenaGuardian(), null);
});
