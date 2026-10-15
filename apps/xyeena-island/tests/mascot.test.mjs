import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseGuardianState,
  toMascotState,
  guardianStatus,
  isGuardianState,
  chooseFoldState,
  foldStatus,
  isFoldState,
  FOLD_ART,
  GuardianController,
  pickMascotState,
  STATES
} from '../src/core/mascot.mjs';

test('original Guardian defaults to idle without invented agent activity', () => {
  assert.equal(chooseGuardianState(), 'idle');
  assert.equal(chooseGuardianState({runs:[{state:'CLOSE'}]}), 'idle');
  assert.equal(chooseGuardianState({runs:[{state:'UNKNOWN'}]}), 'idle');
});

test('media playback maps to playing only when the media source reports it', () => {
  assert.equal(chooseGuardianState({mediaPlaying:true}), 'playing');
  assert.equal(chooseGuardianState({mediaPlaying:false}), 'idle');
});

test('explicit meeting timer takes precedence over media playback', () => {
  assert.equal(chooseGuardianState({mediaPlaying:true,meetingActive:true}), 'listening');
});

test('Xyeena workflow activity, review, error, and sleeping take precedence in defined order', () => {
  assert.equal(chooseGuardianState({runs:[{state:'EXECUTE'}]}), 'working');
  assert.equal(chooseGuardianState({runs:[{state:'DEBUG'}],meetingActive:true}), 'attention');
  assert.equal(chooseGuardianState({runs:[{state:'VERIFY'}],mediaPlaying:true}), 'working');
  assert.equal(chooseGuardianState({runs:[{state:'ERROR'}],mediaPlaying:true}), 'error');
  assert.equal(chooseGuardianState({runs:[{state:'DONE'}]}), 'finished');
  assert.equal(chooseGuardianState({mode:'hidden',runs:[{state:'EXECUTE'}]}), 'sleeping');
});

test('Guardian supports bounded states and labels without false claims', () => {
  assert.ok(['idle','playing','listening','working','attention','finished','error','sleeping'].every(isGuardianState));
  assert.equal(isGuardianState('watching-microphone'), false);
  assert.match(guardianStatus('listening'), /timer/i);
  assert.match(guardianStatus('attention'), /review/i);
  assert.match(guardianStatus('working'), /workflow/i);
  assert.match(guardianStatus('sleeping'), /resting/i);
});

test('toMascotState maps application states to valid @xyeena/mascot visual states', () => {
  assert.equal(toMascotState('listening'), 'thinking');
  assert.equal(toMascotState('playing'), 'dancing');
  assert.equal(toMascotState('attention'), 'question');
  assert.equal(toMascotState('finished'), 'finished');
  assert.equal(toMascotState('working'), 'working');
  assert.equal(toMascotState('error'), 'error');
  assert.equal(toMascotState('sleeping'), 'sleeping');
  assert.equal(toMascotState('idle'), 'idle');
  assert.ok(STATES[toMascotState('listening')]);
});

test('GuardianController handles priority resolution and transient emotes', () => {
  const controller = new GuardianController();
  assert.equal(controller.state, 'idle');
  controller.setTask('job1', 'running');
  assert.equal(controller.state, 'working');
  controller.emote('greeting', 1000);
  assert.equal(controller.state, 'greeting');
  controller.setTask('job2', 'needs_approval');
  // Blocking approval overrides transient emote immediately
  assert.equal(controller.state, 'approval');
});

test('backward compatibility aliases preserve existing Fold contracts', () => {
  assert.equal(chooseFoldState({mediaPlaying:true}), 'playing');
  assert.match(foldStatus('listening'), /timer/i);
  assert.ok(isFoldState('idle'));
  assert.match(FOLD_ART, /<svg/);
  assert.doesNotMatch(FOLD_ART, /(<script|<image|<foreignObject|<use|<animate|Mochi|Coucou)/i);
});
