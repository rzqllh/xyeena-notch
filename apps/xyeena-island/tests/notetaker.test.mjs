import test from 'node:test';
import assert from 'node:assert/strict';
import { NotetakerController } from '../src/core/notetaker.mjs';

test('NotetakerController enforces explicit user consent before recording', () => {
  const controller = new NotetakerController();

  // Disabled / unconsented initially
  assert.equal(controller.consentGiven, false);
  assert.throws(() => {
    controller.startRecording();
  }, /Explicit user consent is required/);
  assert.equal(controller.state, 'error');

  // Opt-in consent
  controller.setConsent(true);
  assert.equal(controller.consentGiven, true);

  const sessionId = controller.startRecording('Sprint Retro');
  assert.equal(controller.state, 'recording');
  assert.equal(typeof sessionId, 'string');
  assert.equal(sessionId.startsWith('note_'), true);

  // Revoking consent while recording cancels session
  controller.setConsent(false);
  assert.equal(controller.state, 'idle');
  assert.equal(controller.activeSessionId, null);
});

test('NotetakerController handles pause, resume, and note completion', () => {
  const controller = new NotetakerController();
  controller.setConsent(true);

  controller.startRecording('Standup Note');
  assert.equal(controller.state, 'recording');

  controller.pauseRecording();
  assert.equal(controller.state, 'paused');

  controller.resumeRecording();
  assert.equal(controller.state, 'recording');

  const note = controller.stopRecording('Discussed deployment of Coucou parity branch.', 'Standup Note');
  assert.equal(controller.state, 'idle');
  assert.equal(note.title, 'Standup Note');
  assert.equal(note.transcript, 'Discussed deployment of Coucou parity branch.');
  assert.equal(controller.notes.length, 1);

  // Export to markdown
  const md = controller.exportMarkdown(note);
  assert.equal(md.includes('# Standup Note'), true);
  assert.equal(md.includes('Discussed deployment of Coucou parity branch.'), true);

  // Delete note
  controller.deleteNote(note.id);
  assert.equal(controller.notes.length, 0);
});
