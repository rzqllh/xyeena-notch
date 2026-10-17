import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SNIPPETS,
  cleanDictatedText,
  expandSnippets,
  updateDictationStats,
  FlowDictationController
} from '../src/core/flow.mjs';

test('cleanDictatedText removes filler words and capitalizes sentence', () => {
  const input = 'um this is uh like a test ah sentence';
  const cleaned = cleanDictatedText(input, { filterFillers: true, autoCapitalize: true });
  assert.equal(cleaned, 'This is a test sentence');

  // Preserve when filterFillers is false
  const uncleaned = cleanDictatedText('um hello', { filterFillers: false, autoCapitalize: true });
  assert.equal(uncleaned, 'Um hello');
});

test('expandSnippets replaces snippet triggers without modifying other text', () => {
  const snippets = [
    { trigger: ':sig', replacement: 'Best regards, Xyn' },
    { trigger: ':shrug', replacement: '¯\\_(ツ)_/¯' }
  ];

  const text = 'Here is the report. :sig';
  const expanded = expandSnippets(text, snippets);
  assert.equal(expanded, 'Here is the report. Best regards, Xyn');

  const shrug = expandSnippets('Nothing to do :shrug', snippets);
  assert.equal(shrug, 'Nothing to do ¯\\_(ツ)_/¯');

  // No match returns original
  assert.equal(expandSnippets('No triggers here', snippets), 'No triggers here');
});

test('updateDictationStats increments words, chars, and sessions truthfully', () => {
  const initial = { wordsCount: 10, charactersCount: 50, sessionsCount: 1 };
  const updated = updateDictationStats(initial, 'Three new words');

  assert.equal(updated.wordsCount, 13);
  assert.equal(updated.charactersCount, 65);
  assert.equal(updated.sessionsCount, 2);

  // Empty string does not increment sessions
  const emptyUpdate = updateDictationStats(updated, '');
  assert.equal(emptyUpdate.sessionsCount, 2);
  assert.equal(emptyUpdate.wordsCount, 13);
});

test('FlowDictationController enforces explicit opt-in consent and push-to-talk lifecycle', () => {
  const controller = new FlowDictationController();

  // Disabled by default
  assert.equal(controller.enabled, false);
  assert.equal(controller.startListening(), false);
  assert.equal(controller.state, 'disabled');

  // Enable
  controller.setEnabled(true);
  assert.equal(controller.enabled, true);
  assert.equal(controller.state, 'idle');

  // Happy path listening -> processing -> result
  let lastEvent = '';
  controller.onStateChange = (state, text) => {
    lastEvent = `${state}:${text || ''}`;
  };

  assert.equal(controller.startListening(), true);
  assert.equal(controller.state, 'listening');

  const result = controller.stopListening('um please schedule a meeting :sig');
  assert.equal(result.includes('Best regards'), true);
  assert.equal(result.startsWith('Please schedule'), true);
  assert.equal(controller.state, 'idle');
  assert.equal(lastEvent.startsWith('idle:'), true);

  // Disabling while listening cancels session
  controller.startListening();
  assert.equal(controller.state, 'listening');
  controller.setEnabled(false);
  assert.equal(controller.state, 'disabled');
});

test('Flow settings defaults and sanitizer enforce backward-compatible booleans', async () => {
  const { DEFAULT_SETTINGS, sanitizeSettings } = await import('../src/core/settings.mjs');

  assert.equal(DEFAULT_SETTINGS.flowEnabled, false);
  assert.equal(DEFAULT_SETTINGS.flowPushToTalk, true);
  assert.equal(DEFAULT_SETTINGS.flowFilterFillers, true);

  const sanitizedEmpty = sanitizeSettings({});
  assert.equal(sanitizedEmpty.flowEnabled, false);
  assert.equal(sanitizedEmpty.flowPushToTalk, true);
  assert.equal(sanitizedEmpty.flowFilterFillers, true);

  const custom = sanitizeSettings({
    flowEnabled: true,
    flowPushToTalk: false,
    flowFilterFillers: false
  });
  assert.equal(custom.flowEnabled, true);
  assert.equal(custom.flowPushToTalk, false);
  assert.equal(custom.flowFilterFillers, false);
});

