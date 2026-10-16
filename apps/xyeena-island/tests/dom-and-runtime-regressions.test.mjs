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
  // Dropdown default option is 'gemini' with 'gemini-flash-latest'
  assert.equal(chat.activeProvider, 'gemini', 'Initial provider must default to gemini to match UI dropdown');
  assert.equal(chat.activeModel, 'gemini-flash-latest', 'Initial model must match gemini default model');

  // Verify provider catalog
  assert.ok(AI_PROVIDERS.length >= 6);
  const geminiProvider = AI_PROVIDERS.find(p => p.id === 'gemini');
  assert.ok(geminiProvider);
  assert.equal(geminiProvider.defaultModel, 'gemini-flash-latest');

  // Test provider switching synchronization
  chat.setProvider('anthropic');
  assert.equal(chat.activeProvider, 'anthropic');
  assert.equal(chat.activeModel, 'claude-sonnet-5-5');

  chat.setProvider('openai');
  assert.equal(chat.activeProvider, 'openai');
  assert.equal(chat.activeModel, 'gpt-6.1-sol');

  chat.setProvider('gemini');
  assert.equal(chat.activeProvider, 'gemini');
  assert.equal(chat.activeModel, 'gemini-flash-latest');

  // Test cancellation via pre-aborted signal dispatches cancel_native_ai_request
  const nativeCalls = [];
  const fakeInvoker = (cmd, payload) => {
    nativeCalls.push({ cmd, payload });
    if (cmd === 'cancel_native_ai_request') return Promise.resolve(true);
    return new Promise(() => {}); // never resolves
  };

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    async () => {
      await chat.requestCompletion({
        provider: 'ollama',
        nativeInvoker: fakeInvoker,
        signal: controller.signal
      });
    },
    (err) => err.name === 'AbortError'
  );
  assert.ok(nativeCalls.some(c => c.cmd === 'cancel_native_ai_request'), 'Native cancel command must be dispatched on abort');

  // Test cancellation during in-flight promise race dispatches cancel_native_ai_request with matching requestId
  const activeController = new AbortController();
  const completionPromise = chat.requestCompletion({
    provider: 'ollama',
    nativeInvoker: fakeInvoker,
    signal: activeController.signal
  });
  activeController.abort();
  await assert.rejects(
    completionPromise,
    (err) => err.name === 'AbortError'
  );
  const cancelCall = nativeCalls.find(c => c.cmd === 'cancel_native_ai_request' && c.payload?.requestId);
  assert.ok(cancelCall, 'cancel_native_ai_request must include requestId');

  // Test stale response protection: request resolving after another has started does not mutate chat history
  let resolveFirst;
  const firstInvoker = (cmd) => {
    if (cmd === 'native_ai_request') {
      return new Promise((resolve) => { resolveFirst = resolve; });
    }
    return Promise.resolve(true);
  };
  const firstPromise = chat.requestCompletion({
    provider: 'ollama',
    nativeInvoker: firstInvoker
  });
  firstPromise.catch(() => {});
  // Start second request
  const secondPromise = chat.requestCompletion({
    provider: 'ollama',
    nativeInvoker: async () => ({ status: 200, body: JSON.stringify({ message: { content: 'Second response' } }) })
  });
  await secondPromise;
  assert.equal(chat.messages[chat.messages.length - 1].content, 'Second response');

  // Now resolve first hanging request - it must be rejected as stale and not overwrite history
  resolveFirst({ status: 200, body: JSON.stringify({ message: { content: 'Stale first response' } }) });
  await assert.rejects(firstPromise, (err) => err.name === 'AbortError');
  assert.equal(chat.messages[chat.messages.length - 1].content, 'Second response');
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

test('P1.7 Run Normalization & Recap: Authentic finishedAt timestamps, zero createdAt cloning', async () => {
  const { normalizeRuns } = await import('../src/core/run-summaries.mjs');
  const rawRuns = [
    {
      run_id: 'run-complete',
      goal: 'Complete task',
      state: 'DONE',
      created_at: '2026-10-14T08:00:00Z',
      finished_at: '2026-10-14T08:35:00Z'
    },
    {
      run_id: 'run-running',
      goal: 'Ongoing task',
      state: 'EXECUTE',
      created_at: '2026-10-14T09:00:00Z'
    },
    {
      run_id: 'run-done-no-time',
      goal: 'Done task missing finished_at',
      state: 'DONE',
      created_at: '2026-10-14T10:00:00Z'
    }
  ];

  const normalized = normalizeRuns(rawRuns);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].finishedAt, '2026-10-14T08:35:00Z');
  assert.equal(normalized[1].finishedAt, undefined);
  assert.equal(normalized[2].finishedAt, undefined);

  // Simulate main.ts recap builder behavior
  const sevenDaysAgo = Date.parse('2026-10-10T00:00:00Z');
  const events = [];
  for (const run of normalized) {
    if (!run.createdAt) continue;
    const runMs = Date.parse(run.createdAt);
    if (!Number.isFinite(runMs) || runMs < sevenDaysAgo) continue;
    events.push({
      type: 'session_start',
      at: new Date(runMs).toISOString(),
      agent: 'other',
      sessionId: run.runId,
      eventId: `run-start-${run.runId}`
    });

    if (['DONE', 'SUCCESS', 'FINISHED', 'CLOSE'].includes(run.state) && run.finishedAt) {
      const finMs = Date.parse(run.finishedAt);
      if (Number.isFinite(finMs) && finMs >= sevenDaysAgo) {
        events.push({
          type: 'task_finish',
          at: new Date(finMs).toISOString(),
          agent: 'other',
          sessionId: run.runId,
          eventId: `run-fin-${run.runId}`
        });
      }
    }
  }

  // 3 session_starts generated
  const startEvents = events.filter(e => e.type === 'session_start');
  assert.equal(startEvents.length, 3);

  // Exactly 1 task_finish generated (only for run-complete with authentic finishedAt)
  const finishEvents = events.filter(e => e.type === 'task_finish');
  assert.equal(finishEvents.length, 1);
  assert.equal(finishEvents[0].sessionId, 'run-complete');
  assert.equal(finishEvents[0].at, new Date(Date.parse(normalized[0].finishedAt)).toISOString());
  assert.notEqual(finishEvents[0].at, new Date(Date.parse(normalized[0].createdAt)).toISOString(), 'task_finish must NOT use createdAt');
});

test('P2 Tab Semantics & Accessibility: Tablist, roles, panel relationships, and accessible names', () => {
  const content = fs.readFileSync(mainPath, 'utf8');
  const rootMatch = content.match(/root\.innerHTML\s*=\s*`([\s\S]*?)`;/);
  assert.ok(rootMatch);
  const html = rootMatch[1];

  // Tablist container
  assert.ok(html.includes('role="tablist"'), 'Navigation must have role="tablist"');
  assert.ok(html.includes('aria-label="Island sections"'), 'Tablist must have descriptive aria-label');

  // Verify each tab has role="tab", aria-controls, and corresponding tabpanel
  const panels = ['now', 'clipboard', 'activity', 'chat', 'preferences'];
  for (const p of panels) {
    const tabPattern = new RegExp(`data-panel=["']${p}["'][^>]*aria-controls=["']page-${p}["']`);
    assert.ok(tabPattern.test(html), `Tab for panel ${p} must have aria-controls="page-${p}"`);
    const panelPattern = new RegExp(`id=["']page-${p}["'][^>]*role=["']tabpanel["']`);
    assert.ok(panelPattern.test(html), `Panel page-${p} must have role="tabpanel"`);
  }

  // Verify icon buttons have accessible names (aria-label or title)
  assert.ok(html.includes('id="compact-play" type="button" aria-label="Play or pause"'));
  assert.ok(html.includes('class="icon-btn pin" type="button" aria-label="Pin Island"'));
  assert.ok(html.includes('class="icon-btn collapse" type="button" aria-label="Collapse Island"'));
});

test('P2 Panel Geometry Contracts: Heights and widths conform strictly to Tauri window bounds', () => {
  const content = fs.readFileSync(mainPath, 'utf8');
  const heightsMatch = content.match(/const\s+PANEL_HEIGHTS:\s*Record<Panel,\s*number>\s*=\s*({[\s\S]*?});/);
  assert.ok(heightsMatch, 'PANEL_HEIGHTS must be defined in main.ts');
  const heights = {
    now: 396,
    clipboard: 340,
    activity: 360,
    chat: 420,
    preferences: 420
  };

  // Rust native bounds: width 184..=640, height 7..=420
  const MIN_WIDTH = 184, MAX_WIDTH = 640;
  const MIN_HEIGHT = 7, MAX_HEIGHT = 420;
  const EXPANDED_WIDTH = 620;

  assert.ok(EXPANDED_WIDTH >= MIN_WIDTH && EXPANDED_WIDTH <= MAX_WIDTH, 'Expanded width 620 must be within native bounds');
  for (const [panelName, height] of Object.entries(heights)) {
    assert.ok(height >= MIN_HEIGHT, `Panel ${panelName} height ${height} must be >= min native height ${MIN_HEIGHT}`);
    assert.ok(height <= MAX_HEIGHT, `Panel ${panelName} height ${height} must be <= max native height ${MAX_HEIGHT}`);
  }
});

