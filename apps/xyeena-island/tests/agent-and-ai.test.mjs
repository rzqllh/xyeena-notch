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

test('ChatEngine fails closed when remote provider is missing API key', async () => {
  const engine = new ChatEngine();
  engine.addUserMessage('Hello cloud');
  await assert.rejects(
    () => engine.requestCompletion({ provider: 'openai', apiKey: '' }),
    /API key required for openai/
  );
  await assert.rejects(
    () => engine.requestCompletion({ provider: 'anthropic', apiKey: '' }),
    /API key required for anthropic/
  );
});

test('ChatEngine handles nativeInvoker transport and parses provider replies', async () => {
  const engine = new ChatEngine();
  engine.addUserMessage('Explain async');

  const mockInvoker = async (cmd, payload) => {
    assert.equal(cmd, 'native_ai_request');
    assert.ok(payload.url.includes('/api/chat'));
    return {
      status: 200,
      body: JSON.stringify({ message: { role: 'assistant', content: 'Async in JavaScript executes non-blocking tasks.' } })
    };
  };

  const reply = await engine.requestCompletion({
    provider: 'ollama',
    nativeInvoker: mockInvoker
  });

  assert.equal(reply, 'Async in JavaScript executes non-blocking tasks.');
  assert.equal(engine.messages.length, 2);
  assert.equal(engine.messages[1].content, 'Async in JavaScript executes non-blocking tasks.');
});

test('ChatEngine handles HTTP 401 and 429 without synthetic fallbacks', async () => {
  const engine = new ChatEngine();
  engine.addUserMessage('Test errors');

  const mockInvoker401 = async () => ({ status: 401, body: 'Unauthorized' });
  await assert.rejects(
    () => engine.requestCompletion({ provider: 'anthropic', apiKey: 'sk-invalid', nativeInvoker: mockInvoker401 }),
    /Authentication failed \(401 Unauthorized\)/
  );

  const mockInvoker429 = async () => ({ status: 429, body: 'Too many requests' });
  await assert.rejects(
    () => engine.requestCompletion({ provider: 'openai', apiKey: 'sk-test', nativeInvoker: mockInvoker429 }),
    /Rate limit exceeded \(429 Too Many Requests\)/
  );
});

test('providerCredentials manages session-only, provider-scoped keys with local provider rejection', async () => {
  const { ProviderCredentialStore } = await import('../src/core/provider-credentials.mjs');
  const store = new ProviderCredentialStore();

  // 1. Sets and gets key for cloud provider
  assert.equal(store.hasKey('openai'), false);
  assert.equal(store.setKey('openai', 'sk-openai-secret-123'), true);
  assert.equal(store.hasKey('openai'), true);
  assert.equal(store.getKey('openai'), 'sk-openai-secret-123');

  // 2. Strict provider isolation: key not shared with anthropic or gemini
  assert.equal(store.hasKey('anthropic'), false);
  assert.equal(store.getKey('anthropic'), '');
  assert.equal(store.hasKey('gemini'), false);
  assert.equal(store.getKey('gemini'), '');

  // 3. Local providers (Ollama & LM Studio) MUST reject cloud credentials
  assert.equal(store.setKey('ollama', 'sk-leaked-key'), false);
  assert.equal(store.hasKey('ollama'), false);
  assert.equal(store.getKey('ollama'), '');

  assert.equal(store.setKey('lmstudio', 'sk-leaked-key'), false);
  assert.equal(store.hasKey('lmstudio'), false);
  assert.equal(store.getKey('lmstudio'), '');

  // 4. Clear key for specific provider
  store.setKey('anthropic', 'sk-ant-test');
  assert.equal(store.hasKey('anthropic'), true);
  store.clearKey('anthropic');
  assert.equal(store.hasKey('anthropic'), false);
  assert.equal(store.getKey('anthropic'), '');
  // OpenAI key remains unaffected
  assert.equal(store.hasKey('openai'), true);
  assert.equal(store.getKey('openai'), 'sk-openai-secret-123');

  // 5. Clear all keys
  store.clearKey();
  assert.equal(store.hasKey('openai'), false);
  assert.equal(store.getKey('openai'), '');
});

test('ChatEngine _prepare enforces user-first, user-last flow and filters error messages', () => {
  const engine = new ChatEngine();
  engine.addAssistantReply('Should be trimmed because it is leading assistant');
  engine.addUserMessage('First user prompt');
  engine.addAssistantReply('⚠️ Rate limit exceeded (429)', { isError: true });
  engine.addUserMessage('Second user prompt');

  const prepared = engine._prepare(4000, 'System instructions');
  assert.equal(prepared.system, 'System instructions');
  assert.equal(prepared.messages.length, 1);
  // Merged user prompts without the error message in between
  assert.equal(prepared.messages[0].role, 'user');
  assert.equal(prepared.messages[0].content, 'First user prompt\n\nSecond user prompt');
});

test('ChatEngine handles multi-turn conversation across multiple responses with context preservation', async () => {
  const engine = new ChatEngine();
  const sentPayloads = [];

  const mockInvoker = async (_cmd, payload) => {
    sentPayloads.push(JSON.parse(payload.body));
    const turn = sentPayloads.length;
    if (turn === 1) {
      return {
        status: 200,
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Turn 1 reply: Paris' } }] })
      };
    } else {
      return {
        status: 200,
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Turn 2 reply: London' } }] })
      };
    }
  };

  // Turn 1
  engine.addUserMessage('What is capital of France?');
  const reply1 = await engine.requestCompletion({
    provider: 'openai',
    apiKey: 'sk-test',
    nativeInvoker: mockInvoker
  });
  assert.equal(reply1, 'Turn 1 reply: Paris');
  assert.equal(engine.messages.length, 2);

  // Turn 2
  engine.addUserMessage('What is capital of UK?');
  const reply2 = await engine.requestCompletion({
    provider: 'openai',
    apiKey: 'sk-test',
    nativeInvoker: mockInvoker
  });
  assert.equal(reply2, 'Turn 2 reply: London');
  assert.equal(engine.messages.length, 4);

  // Verify Turn 2 payload contained complete multi-turn context
  const turn2Messages = sentPayloads[1].messages;
  assert.equal(turn2Messages.length, 3);
  assert.equal(turn2Messages[0].role, 'user');
  assert.equal(turn2Messages[0].content, 'What is capital of France?');
  assert.equal(turn2Messages[1].role, 'assistant');
  assert.equal(turn2Messages[1].content, 'Turn 1 reply: Paris');
  assert.equal(turn2Messages[2].role, 'user');
  assert.equal(turn2Messages[2].content, 'What is capital of UK?');
});

test('ChatEngine handles HTTP 503 retry and categorizes provider overload', async () => {
  const engine = new ChatEngine();
  engine.addUserMessage('Test 503');

  let attempts = 0;
  const mockInvoker503 = async () => {
    attempts++;
    if (attempts < 2) {
      return { status: 503, headers: { 'retry-after': '0' }, body: 'Service Unavailable' };
    }
    return {
      status: 200,
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Recovered after retry' } }] })
    };
  };

  const reply = await engine.requestCompletion({
    provider: 'openai',
    apiKey: 'sk-test',
    nativeInvoker: mockInvoker503
  });
  assert.equal(reply, 'Recovered after retry');
  assert.equal(attempts, 2);
});

test('ChatEngine cancellation via AbortSignal aborts cleanly and calls cancel_native_ai_request', async () => {
  const engine = new ChatEngine();
  engine.addUserMessage('Long running prompt');

  let cancelledReqId = null;
  const controller = new AbortController();

  const mockInvoker = async (cmd, payload) => {
    if (cmd === 'cancel_native_ai_request') {
      cancelledReqId = payload.request_id || payload.requestId;
      return true;
    }
    return new Promise((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        const err = new Error('Chat completion aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });
  };

  const completionPromise = engine.requestCompletion({
    provider: 'ollama',
    nativeInvoker: mockInvoker,
    signal: controller.signal
  });

  // Trigger abort in-flight
  controller.abort();

  await assert.rejects(
    () => completionPromise,
    /aborted/
  );
  assert.ok(cancelledReqId, 'cancel_native_ai_request should have been invoked with request ID');
});

