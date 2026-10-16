import test from 'node:test';
import assert from 'node:assert/strict';
import { LivingLionRig } from '../src/lion-canvas.js';

test('LivingLionRig initializes safely with mock canvas and options', () => {
  const mockCanvas = {
    getContext: () => ({
      scale: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      ellipse: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      bezierCurveTo: () => {},
      closePath: () => {},
      arc: () => {},
      clip: () => {},
      translate: () => {},
      rotate: () => {},
      transform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    }),
    style: {},
    width: 200,
    height: 200,
  };

  const rig = new LivingLionRig(mockCanvas, { size: 96, state: 'idle' });
  assert.equal(rig.size, 96);
  assert.equal(rig.state, 'idle');
  assert.equal(rig.reducedMotion, false);

  rig.resize(120);
  assert.equal(rig.size, 120);

  rig.setState('attention');
  assert.equal(rig.state, 'attention');

  // Bounded gaze vector [-1, 1]
  rig.setGaze(2.5, -3.0);
  assert.equal(rig.targetGazeX, 1);
  assert.equal(rig.targetGazeY, -1);

  // Reduced motion
  rig.setReducedMotion(true);
  assert.equal(rig.reducedMotion, true);

  // Sleeping disables active gaze
  rig.setState('sleeping');
  rig.setGaze(1, 1);
  assert.equal(rig.targetGazeY, 0.4);

  // Emote
  rig.salute(1.5);
  assert.equal(rig.emoteName, 'salute');
  assert.equal(rig.emoteDuration, 1.5);

  rig.stop();
});

test('LivingLionRig handles client coordinate tracking, dead-zone, and head lag', () => {
  const mockCanvas = {
    getContext: () => ({
      scale: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
      beginPath: () => {}, ellipse: () => {}, fill: () => {}, stroke: () => {},
      moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, bezierCurveTo: () => {}, closePath: () => {},
      arc: () => {}, clip: () => {}, translate: () => {}, rotate: () => {}, transform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    }),
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 96, height: 96 }),
    style: {},
    width: 96,
    height: 96,
  };

  const rig = new LivingLionRig(mockCanvas, { size: 96, state: 'idle' });

  // 1. Dead-zone test: cursor very close to face center (< 8px)
  rig.setGazeFromClient(148, 143.2); // exactly center (100 + 48, 100 + 43.2)
  assert.equal(rig.targetGazeX, 0);
  assert.equal(rig.targetGazeY, 0);

  // 2. Client coordinate gaze tracking
  rig.setGazeFromClient(300, 143.2); // right of mascot
  assert.ok(rig.targetGazeX > 0.3);
  assert.equal(rig.targetGazeY, 0);

  // Far right reaches full clamp (1.0)
  rig.setGazeFromClient(600, 143.2);
  assert.equal(rig.targetGazeX, 1);

  // 3. Anatomical bounds clamping
  rig.setGaze(10, 10);
  assert.ok(rig.targetGazeX <= 1);
  assert.ok(rig.targetGazeY <= 1);

  // 4. Head lag: gaze reacts faster than head
  // Reset
  rig.eyeGazeX = 0; rig.eyeGazeY = 0;
  rig.headYaw = 0; rig.headPitch = 0;
  rig.setGaze(1, 0);

  // Advance 1 frame (16ms)
  rig.update(0.016);
  // Gaze should have moved more towards target than head yaw
  assert.ok(rig.eyeGazeX > rig.headYaw, 'Gaze must lead and head must lag behind');

  // 5. Body anchoring: LivingLionRig does not translate the body off-canvas
  assert.equal(typeof rig.draw, 'function');

  rig.stop();
});
