import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAgentEvent,mayForwardDecision} from '../src/core/agent-events.mjs';

test('event projection strips secrets and unknown keys',()=>{
 const n=normalizeAgentEvent({kind:'session.updated',provider:'xyeena',sessionId:'run-123',status:'working',timestamp:100,
   prompt:'PRIVATE',secret:'abc',toolArgs:{password:'no'},fileContents:'do not include'});
 assert.deepEqual(Object.keys(n),['kind','provider','sessionId','requestId','status','timestamp']);
 assert.ok(!JSON.stringify(n).includes('PRIVATE'));
});
test('provider and permission identity must be complete',()=>{
 assert.equal(normalizeAgentEvent({kind:'unknown',provider:'xyeena',sessionId:'a',timestamp:1}),null);
 assert.equal(normalizeAgentEvent({kind:'permission.requested',provider:'codex',sessionId:'a',timestamp:1}),null);
 assert.equal(normalizeAgentEvent({kind:'session.started',provider:'unauthorized',sessionId:'a',timestamp:1}),null);
});
test('consent matching fails closed on spoofed session, expiry, and missing action',()=>{
 const waiting={status:'pending',sessionId:'session-a',requestId:'req-3',provider:'codex',expiresAt:200};
 const action={sessionId:'session-a',requestId:'req-3',provider:'codex',decision:'allow',explicitUserAction:true};
 assert.equal(mayForwardDecision(waiting,action,199),true);
 assert.equal(mayForwardDecision(waiting,{...action,requestId:'req-4'},199),false);
 assert.equal(mayForwardDecision(waiting,{...action,provider:'claude-code'},199),false);
 assert.equal(mayForwardDecision(waiting,{...action,explicitUserAction:false},199),false);
 assert.equal(mayForwardDecision(waiting,action,200),false);
});
