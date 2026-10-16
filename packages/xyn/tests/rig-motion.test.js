import test from 'node:test';
import assert from 'node:assert/strict';
import { LivingLionRig } from '../src/lion-canvas.js';
import { STATES, VARIANTS } from '../src/states.js';

const methods = ['scale','clearRect','save','restore','beginPath','ellipse','fill','stroke','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','arc','clip','translate','rotate','transform'];
const mock = () => {
  const ctx = Object.fromEntries(methods.map(m => [m, () => {}]));
  ctx.createLinearGradient = ctx.createRadialGradient = () => ({ addColorStop() {} });
  return { getContext: () => ctx, style: {}, width: 200, height: 200 };
};

test('every state and variant renders and animates without throwing', () => {
  const rig = new LivingLionRig(mock(), { size: 120 });
  for (const variant of VARIANTS) { rig.setVariant(variant); rig.render(); }
  for (const state of Object.keys(STATES)) {
    rig.setState(state);
    for (let i = 0; i < 30; i++) { rig.update(1 / 60); rig.render(); }
  }
  assert.ok(Number.isFinite(rig.sp.oy.x) && Number.isFinite(rig.sp.tilt.x));
});

test('a hop leaves the ground, lands, and never sinks below it', () => {
  const rig = new LivingLionRig(mock(), { size: 120 });
  rig.hop(1);
  let min = 0, max = 0;
  for (let i = 0; i < 240; i++) { rig.update(1 / 60); min = Math.min(min, rig.sp.oy.x); max = Math.max(max, rig.sp.oy.x); }
  assert.ok(min < -15, 'should rise');
  assert.ok(max <= 6.0001, 'ground contact is enforced');
  assert.ok(Math.abs(rig.sp.oy.x) < 3, 'settles back on the ground');
});

test('expression swap goes through a blink and lands on the new eye shape', () => {
  const rig = new LivingLionRig(mock(), { size: 120 });
  rig.start = () => {}; rig.rafId = 1; // pretend the loop is live
  rig.setState('finished');
  assert.equal(rig.eyeShape, 'dot');
  for (let i = 0; i < 20; i++) rig.update(1 / 60);
  assert.equal(rig.eyeShape, 'happy');
  assert.equal(rig.badge, 'spark');
  rig.rafId = 0;
});

test('reduced motion is fully static', () => {
  const rig = new LivingLionRig(mock(), { size: 120, reducedMotion: true, state: 'working' });
  for (let i = 0; i < 30; i++) rig.update(1 / 60);
  assert.equal(rig.sp.oy.x, 0);
  assert.equal(rig.headYaw, 0);
  assert.equal(rig.eyeShape, 'happy');
});
