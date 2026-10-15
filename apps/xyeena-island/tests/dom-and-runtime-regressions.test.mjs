import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ChatEngine, AI_PROVIDERS} from '../src/core/ai-chat.mjs';
import {DEFAULT_SETTINGS, sanitizeSettings} from '../src/core/settings.mjs';
import {chooseGuardianState, toMascotState, isState} from '../src/core/mascot.mjs';
import {mayForwardDecision} from '../src/core/agent-events.mjs';
import {buildWeeklyRecap} from '@xyeena/recap';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.resolve(__dirname, '../src/main.ts');

test('P0 DOM Integrity: All q<T>(selector) queries in main.ts exist in root.innerHTML', () => {
  const content = fs.readFileSync(mainPath, 'utf8');
  const rootMatch = content.match(/root\.innerHTML\s*=\s*`([\s\S]*?)`;/);
  assert.ok(rootMatch, 'root.innerHTML must be defined in main.ts');
  const html = rootMatch[1];

  // Extract all unique querySelector calls in main.ts
  const qMatches = [...content.matchAll(/q<[^>]+>\((['"])(.*?)\1\)/g)].map(m => m[2]);
  const uniqueSelectors = [...new Set(qMatches)];
  assert.ok(uniqueSelectors.length > 50, 'Should find dozens of UI selectors in main.ts');

  const missing = [];
  for (const sel of uniqueSelectors) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      const regex = new RegExp(`id=["']${id}["']`);
      if (!regex.test(html)) {
        missing.push(sel);
      }
    } else if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const regex = new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`);
      if (!regex.test(html)) {
        missing.push(sel);
      }
    }
  }

  // Regression guards for the exact bugs audited in P0
  assert.deepEqual(missing, [], `Missing DOM selectors that cause runtime throws: ${missing.join(', ')}`);
  assert.ok(!uniqueSelectors.includes('#setting-clip-persist'), 'Dead binding #setting-clip-persist must be removed');
  assert.ok(uniqueSelectors.includes('#chat-xyn-status'), 'Chat status selector must target #chat-xyn-status');
  assert.ok(uniqueSelectors.includes('#btn-save-inline-key'), 'Inline key save button must be queried');
  assert.ok(uniqueSelectors.includes('#chat-inline-key-input'), 'Inline key input must be queried');
});

test('P1.1 AI Chat Cancellation and Provider Sync: AbortSignal is honored and models sync', async () => {
  const chat = new ChatEngine();
  assert.equal(chat.activeProvider, 'anthropic');
  assert.equal(chat.activeModel, 'claude-3-7-sonnet-latest');

  // Verify provider catalog
  assert.ok(AI_PROVIDERS.length >= 6);
  const geminiProvider = AI_PROVIDERS.find(p => p.id === 'gemini');
  assert.ok(geminiProvider);
  assert.equal(geminiProvider.defaultModel, 'gemini-2.0-flash');

  // Test cancellation via pre-aborted signal
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    async () => {
      await chat.requestCompletion({
        provider: 'ollama',
        signal: controller.signal
      });
    },
    (err) => err.name === 'AbortError'
  );

  // Test cancellation during in-flight promise race
  const activeController = new AbortController();
  const hangingInvoker = () => new Promise(() => {}); // never resolves
  const completionPromise = chat.requestCompletion({
    provider: 'ollama',
    nativeInvoker: hangingInvoker,
    signal: activeController.signal
  });
  activeController.abort();
  await assert.rejects(
    completionPromise,
    (err) => err.name === 'AbortError'
  );
});

test('P1.2 Mascot Visual State: Guardian maps thinking, working, error, and idle cleanly', () => {
  assert.equal(isState('thinking'), true);
  assert.equal(isState('working'), true);
  assert.equal(isState('error'), true);
  assert.equal(isState('finished'), true);
  assert.equal(isState('idle'), true);

  // Verify toMascotState returns recognized states
  assert.equal(toMascotState('listening'), 'thinking');
  assert.equal(toMascotState('working'), 'working');
  assert.equal(toMascotState('attention'), 'question');
  assert.equal(toMascotState('finished'), 'finished');
});

test('P1.4 Consent Gate: mayForwardDecision fails closed against unauthenticated or stale sessions', () => {
  const now = 100000;
  const waiting = {
    status: 'pending',
    sessionId: 'sess-alpha-123',
    requestId: 'req-auth-999',
    provider: 'claude-code',
    expiresAt: now + 5000
  };
  const validAction = {
    sessionId: 'sess-alpha-123',
    requestId: 'req-auth-999',
    provider: 'claude-code',
    decision: 'allow',
    explicitUserAction: true
  };

  // Valid authenticated decision forward
  assert.equal(mayForwardDecision(waiting, validAction, now), true);

  // Expired decision fails closed
  assert.equal(mayForwardDecision(waiting, validAction, now + 6000), false);

  // Tampered or mismatched provider fails closed
  assert.equal(mayForwardDecision(waiting, {...validAction, provider: 'other'}, now), false);

  // Synthetic action without explicit user click fails closed
  assert.equal(mayForwardDecision(waiting, {...validAction, explicitUserAction: false}, now), false);
});

test('P1.5 Weekly Recap: Honest event classification without fabricated approvals', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const pastEvents = [
    { type: 'command', at: '2026-10-14T10:00:00Z', agent: 'other', eventId: 'evt-1' },
    { type: 'edit', at: '2026-10-14T11:00:00Z', agent: 'other', eventId: 'evt-2' },
    { type: 'question', at: '2026-10-14T12:00:00Z', agent: 'other', eventId: 'evt-3' },
    { type: 'task_finish', at: '2026-10-14T13:00:00Z', agent: 'other', sessionId: 'run-1', eventId: 'evt-4' }
  ];

  const recap = buildWeeklyRecap(pastEvents, { now, timeZone: 'UTC', week: 'current' });
  // Verify that regular commands, edits and runs do NOT fabricate approvals
  assert.equal(recap.totals.approvalsAllowed, 0, 'No approvals should be fabricated');
  assert.equal(recap.totals.approvalsDenied, 0, 'No denials should be fabricated');
  assert.equal(recap.totals.commands, 1);
  assert.equal(recap.totals.filesEdited, 1);
  assert.equal(recap.totals.questions, 1);
  assert.equal(recap.totals.tasksCompleted, 1);
});

test('P1.6 Settings: Preferred Media and Recap Toggle are recognized and sanitized', () => {
  assert.equal(DEFAULT_SETTINGS.preferredMedia, 'auto');
  assert.equal(DEFAULT_SETTINGS.recapEnabled, true);

  const sanitizedSpotify = sanitizeSettings({ preferredMedia: 'Spotify' });
  assert.equal(sanitizedSpotify.preferredMedia, 'Spotify');

  const sanitizedChrome = sanitizeSettings({ preferredMedia: 'Chrome' });
  assert.equal(sanitizedChrome.preferredMedia, 'Chrome');

  const sanitizedInvalid = sanitizeSettings({ preferredMedia: '<script>alert(1)</script>' });
  assert.equal(sanitizedInvalid.preferredMedia, 'auto');

  const disabledRecap = sanitizeSettings({ recapEnabled: false });
  assert.equal(disabledRecap.recapEnabled, false);
});
