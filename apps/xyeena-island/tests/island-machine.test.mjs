import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, transition, shellDimensions } from '../src/core/island-machine.mjs';

test('all states have nonzero bounded native rectangles', () => {
  for (const mode of MODES) {
    const {width,height}=shellDimensions(mode);
    assert.ok(width>=1 && width<=640);
    assert.ok(height>=1 && height<=420);
  }
});
test('hidden strip wakes to compact only on pointer entry',()=>{
  assert.equal(transition('hidden','pointer-enter'),'compact');
  assert.equal(transition('compact','pointer-enter'),'compact');
});
test('compact expands on activation and contracts when asked',()=>{
  assert.equal(transition('compact','activate'),'expanded');
  assert.equal(transition('expanded','collapse'),'compact');
});
test('compact leaves into hidden, pinned does not',()=>{
  assert.equal(transition('compact','pointer-leave'),'hidden');
  assert.equal(transition('pinned','pointer-leave'),'pinned');
});
test('pinned does not hide without explicit unpin',()=>{
  assert.equal(transition('expanded','toggle-pin'),'pinned');
  assert.equal(transition('pinned','hide'),'pinned');
  assert.equal(transition('pinned','toggle-pin'),'expanded');
  assert.equal(transition('expanded','hide'),'hidden');
});
test('collapse works even when pinned',()=>{
  assert.equal(transition('pinned','collapse'),'compact');
});
test('state transitions are deterministic',()=>{
  for(const mode of MODES) for(const event of ['pointer-enter','pointer-leave','activate','collapse','toggle-pin','hide']) {
    assert.equal(transition(mode,event),transition(mode,event));
  }
});
test('invalid state or event fails visibly',()=>{
  assert.throws(()=>transition('other','activate'),/Unknown Island state/);
  assert.throws(()=>transition('compact','approve'),/Unknown Island event/);
});
