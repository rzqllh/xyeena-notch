import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceIntent, executeVoiceAction } from '../src/core/voice-commands.mjs';

test('parseVoiceIntent maps voice commands accurately', () => {
  // Mode controls
  assert.deepEqual(parseVoiceIntent('expand island please'), {
    action: 'SetMode',
    payload: { mode: 'expanded' }
  });
  assert.deepEqual(parseVoiceIntent('compact island'), {
    action: 'SetMode',
    payload: { mode: 'compact' }
  });
  assert.deepEqual(parseVoiceIntent('hide island'), {
    action: 'SetMode',
    payload: { mode: 'hidden' }
  });

  // Navigation
  assert.deepEqual(parseVoiceIntent('open chat'), {
    action: 'Navigate',
    payload: { panel: 'chat' }
  });
  assert.deepEqual(parseVoiceIntent('open clipboard'), {
    action: 'Navigate',
    payload: { panel: 'clipboard' }
  });
  assert.deepEqual(parseVoiceIntent('open settings'), {
    action: 'Navigate',
    payload: { panel: 'preferences' }
  });

  // Media
  assert.deepEqual(parseVoiceIntent('pause music'), {
    action: 'MediaControl',
    payload: { control: 'pause' }
  });
  assert.deepEqual(parseVoiceIntent('next song'), {
    action: 'MediaControl',
    payload: { control: 'next' }
  });

  // Ask Xyn
  assert.deepEqual(parseVoiceIntent('Ask Xyn how does Named Pipe IPC work?'), {
    action: 'AskXyn',
    payload: { prompt: 'how does Named Pipe IPC work?' }
  });
  assert.deepEqual(parseVoiceIntent('hey xyn status check'), {
    action: 'AskXyn',
    payload: { prompt: 'status check' }
  });

  // Weekly Recap
  assert.deepEqual(parseVoiceIntent('generate weekly recap'), {
    action: 'WeeklyRecap'
  });

  // Unknown
  assert.equal(parseVoiceIntent('unrecognized nonsense').action, 'Unknown');
});

test('executeVoiceAction invokes appropriate context callbacks', () => {
  let targetMode = '';
  let targetPanel = '';
  let mediaTriggered = '';
  let askedPrompt = '';
  let recapTriggered = false;

  const context = {
    setMode: m => { targetMode = m; },
    setPanel: p => { targetPanel = p; },
    mediaControl: c => { mediaTriggered = c; },
    askXyn: p => { askedPrompt = p; },
    triggerRecap: () => { recapTriggered = true; }
  };

  const resMode = executeVoiceAction({ action: 'SetMode', payload: { mode: 'expanded' } }, context);
  assert.equal(resMode.success, true);
  assert.equal(targetMode, 'expanded');

  const resNav = executeVoiceAction({ action: 'Navigate', payload: { panel: 'chat' } }, context);
  assert.equal(resNav.success, true);
  assert.equal(targetPanel, 'chat');

  const resMedia = executeVoiceAction({ action: 'MediaControl', payload: { control: 'pause' } }, context);
  assert.equal(resMedia.success, true);
  assert.equal(mediaTriggered, 'pause');

  const resXyn = executeVoiceAction({ action: 'AskXyn', payload: { prompt: 'Hello Xyn' } }, context);
  assert.equal(resXyn.success, true);
  assert.equal(askedPrompt, 'Hello Xyn');

  const resRecap = executeVoiceAction({ action: 'WeeklyRecap' }, context);
  assert.equal(resRecap.success, true);
  assert.equal(recapTriggered, true);

  const resUnknown = executeVoiceAction({ action: 'Unknown', payload: { transcript: 'what' } }, context);
  assert.equal(resUnknown.success, false);
});
