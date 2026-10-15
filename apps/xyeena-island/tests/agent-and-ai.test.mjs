import test from 'node:test';
import assert from 'node:assert/strict';
import {KNOWN_ADAPTERS, getAdapter, normalizeSessionSnapshot} from '../src/core/agent-adapters.mjs';
import {ChatEngine, AI_PROVIDERS, renderSafeMarkdown} from '../src/core/ai-chat.mjs';

test('KNOWN_ADAPTERS contains required Coucou parity agents with verified capabilities', () => {
  const ids = KNOWN_ADAPTERS.map(a => a.id);
  assert.ok(ids.includes('claude-code'));
  assert.ok(ids.includes('codex'));
  assert.ok(ids.includes('gemini-cli'));
  assert.ok(ids.includes('antigravity'));
  assert.ok(ids.includes('cursor'));
  assert.ok(ids.includes('copilot-cli'));
  assert.ok(ids.includes('opencode'));
  assert.ok(ids.includes('amp'));
  assert.ok(ids.includes('hermes'));
  assert.ok(ids.includes('xyeena'));

  const claude = getAdapter('claude-code');
  assert.equal(claude?.capabilities.diffPreview, true);
  assert.equal(claude?.capabilities.approvalRequests, true);
});

test('normalizeSessionSnapshot safely normalizes raw session and bounds diffs', () => {
  const norm = normalizeSessionSnapshot({
    sessionId: 'sess-99',
    provider: 'codex',
    status: 'approval',
    taskSummary: 'Implement auth slice',
    activeTool: 'write_file',
    diffSnippet: '+ let x = 1;\n'.repeat(50),
    pendingApproval: {
      requestId: 'req-42',
      prompt: 'Execute npm install?',
      expiresAt: 5000000000
    }
  });

  assert.equal(norm?.sessionId, 'sess-99');
  assert.equal(norm?.provider, 'codex');
  assert.equal(norm?.status, 'approval');
  assert.equal(norm?.activeTool, 'write_file');
  assert.ok(norm?.diffSnippet && norm.diffSnippet.length <= 500);
  assert.equal(norm?.pendingApproval?.requestId, 'req-42');

  // Invalid snapshot fails closed
  assert.equal(normalizeSessionSnapshot(null), null);
  assert.equal(normalizeSessionSnapshot({}), null);
});

test('ChatEngine manages bounded conversation history and file attachments', () => {
  const engine = new ChatEngine();
  assert.equal(AI_PROVIDERS.length >= 6, true);

  engine.addUserMessage('Help me review this diff', ['index.ts', 'style.css']);
  assert.equal(engine.messages.length, 1);
  assert.equal(engine.messages[0].role, 'user');
  assert.deepEqual(engine.messages[0].files, ['index.ts', 'style.css']);

  engine.addAssistantReply('I found 2 optimizations in `index.ts`.');
  assert.equal(engine.messages.length, 2);
  assert.equal(engine.messages[1].role, 'assistant');

  // Bounds history
  for (let i = 0; i < 30; i++) {
    engine.addAssistantReply('msg ' + i);
  }
  assert.equal(engine.messages.length, 20);

  engine.clear();
  assert.equal(engine.messages.length, 0);
});

test('renderSafeMarkdown safely escapes HTML and formats code blocks', () => {
  const raw = 'Hello **world** with `<script>alert(1)</script>` and:\n```js\nconsole.log(42);\n```';
  const rendered = renderSafeMarkdown(raw);
  assert.ok(!rendered.includes('<script>'));
  assert.ok(rendered.includes('&lt;script&gt;'));
  assert.ok(rendered.includes('<strong>world</strong>'));
  assert.ok(rendered.includes('<pre class="code-block" data-lang="js"><code>console.log(42);</code></pre>'));
});
