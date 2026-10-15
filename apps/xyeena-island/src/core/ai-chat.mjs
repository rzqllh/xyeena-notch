// @ts-nocheck
// Multi-provider AI chat client: Claude, OpenAI, Gemini, OpenRouter, Ollama, LM Studio.
// Client-side, adapter-based, streaming, token-budgeted history, safe Markdown, credential-safe.
//
// ── Native (Tauri) transport contract ────────────────────────────────────────
// Non-streaming (already exists):
//   invoke('native_ai_request', { requestId, url, method, headers, body })
//     -> { status: number, headers?: Record<string,string>, body: string }
//   invoke('cancel_native_ai_request', { requestId })
// Streaming (new, optional - without `nativeListen` the engine falls back to non-streaming):
//   invoke('native_ai_stream', { requestId, url, method, headers, body }) resolves when stream ends.
//   Rust emits events named `ai-stream:<requestId>` with payloads:
//     { type: 'head',  status: number, headers?: Record<string,string> }   (first)
//     { type: 'chunk', text: string }  (decoded UTF-8; for non-2xx this is the error body)
//     { type: 'end' }                                                      (last, always)
//     { type: 'error', message: string }                                   (transport failure)
//   JS passes `nativeListen = (name, cb) => listen(name, cb)` from '@tauri-apps/api/event'.
// Ideal: Rust injects the API key into headers itself so JS never touches it.

/**
 * @typedef {{
 *   id: string,
 *   role: 'user' | 'assistant' | 'system',
 *   content: string,
 *   at: number,
 *   files?: string[],
 *   partial?: boolean,
 *   model?: string,
 *   provider?: string,
 *   stopReason?: string,
 *   usage?: { input: number, output: number } | null
 * }} ChatMessage
 */

export const AI_PROVIDERS = Object.freeze([
  {
    id: 'anthropic', name: 'Anthropic (Claude)', isLocal: false, contextBudget: 32000,
    defaultModel: 'claude-sonnet-5-5',
    suggestedModels: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  },
  {
    id: 'openai', name: 'OpenAI', isLocal: false, contextBudget: 32000,
    defaultModel: 'gpt-6.1-sol',
    suggestedModels: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-sol'],
  },
  {
    id: 'gemini', name: 'Google Gemini', isLocal: false, contextBudget: 32000,
    defaultModel: 'gemini-flash-latest',
    suggestedModels: ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  },
  {
    id: 'openrouter', name: 'OpenRouter', isLocal: false, contextBudget: 32000,
    defaultModel: 'openrouter/auto',
    suggestedModels: ['openrouter/auto'],
  },
  {
    id: 'ollama', name: 'Ollama (local)', isLocal: true, contextBudget: 8000,
    defaultModel: 'llama3:latest', defaultBaseUrl: 'http://127.0.0.1:11434', suggestedModels: ['llama3:latest'],
  },
  {
    id: 'lmstudio', name: 'LM Studio (local)', isLocal: true, contextBudget: 8000,
    defaultModel: 'local-model', defaultBaseUrl: 'http://127.0.0.1:1234', suggestedModels: ['local-model'],
  },
]);

const PROVIDER_BY_ID = new Map(AI_PROVIDERS.map(p => [p.id, p]));

/* ───────────────────────────── utilities ───────────────────────────── */

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
const safe = (fn, ...args) => { if (typeof fn === 'function') { try { fn(...args); } catch (e) { console.error(e); } } };
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const normUsage = (input, output) => (input != null || output != null) ? { input: input ?? 0, output: output ?? 0 } : null;

export const estimateTokens = (s) => Math.ceil(String(s || '').length / 3.5);

export function abortError() {
  const e = new Error('Chat completion aborted');
  e.name = 'AbortError';
  return e;
}
export const isAbortError = (e) => e?.name === 'AbortError';

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => { clearTimeout(t); reject(abortError()); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function raceAbort(promise, signal, onAbort) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { try { onAbort?.(); } catch { /* ignore */ } reject(abortError()); };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function linkSignal(external, controller) {
  if (!external) return () => { };
  if (external.aborted) { controller.abort(); return () => { }; }
  const f = () => controller.abort();
  external.addEventListener('abort', f, { once: true });
  return () => external.removeEventListener('abort', f);
}

const headersToObject = (h) => {
  const out = {};
  if (h && typeof h.forEach === 'function') h.forEach((v, k) => { out[String(k).toLowerCase()] = v; });
  else if (h && typeof h === 'object') for (const k of Object.keys(h)) out[k.toLowerCase()] = h[k];
  return out;
};

/* ───────────────────────────── errors & retry ───────────────────────────── */

export class ApiError extends Error {
  constructor(message, { provider, status = 0, code, retryable = false, retryAfterMs } = {}) {
    super(message);
    this.name = 'ApiError';
    this.provider = provider;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

function parseRetryAfter(headers) {
  const ms = Number(headers?.['retry-after-ms']);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const v = headers?.['retry-after'];
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(v);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function buildApiError(provider, status, text, headers) {
  let detail = String(text || '').slice(0, 300);
  let code;
  const j = safeJson(text);
  if (j) {
    const e = j.error;
    detail = (typeof e === 'string' ? e : e?.message) || j.message || detail;
    if (e && typeof e === 'object') code = e.code ?? e.type ?? e.status;
  }
  code = code != null ? String(code) : undefined;
  const quota = code === 'insufficient_quota';
  let message;
  if (status === 400) message = `Bad request to ${provider}: ${detail}`;
  else if (status === 401) message = `Authentication failed (401 Unauthorized) for ${provider}. Please verify your API key.`;
  else if (status === 403) message = `Access denied (403) by ${provider}: ${detail}`;
  else if (status === 404) message = `Not found (404) on ${provider}: ${detail}. The model ID may be wrong or retired.`;
  else if (status === 413) message = `Request too large for ${provider} (413). Try a shorter conversation.`;
  else if (status === 429 && quota) message = `Quota exhausted for ${provider}. Check your plan and billing.`;
  else if (status === 429) message = `Rate limit exceeded (429 Too Many Requests) for ${provider}. Please try again shortly.`;
  else if (status === 503 || status === 529) message = `${provider} is overloaded or unavailable (${status}). Please try again shortly.`;
  else message = `Provider error (${status}) from ${provider}: ${detail}`;
  return new ApiError(message, {
    provider, status, code,
    retryable: RETRYABLE_STATUS.has(status) && !quota,
    retryAfterMs: parseRetryAfter(headers),
  });
}

async function withRetry(fn, { retries = 3, baseDelay = 800, maxDelay = 30000, signal, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!(err instanceof ApiError) || !err.retryable || attempt >= retries || signal?.aborted) throw err;
      const backoff = Math.min(baseDelay * 2 ** attempt, 8000) + Math.random() * 250;
      const delay = err.retryAfterMs ?? backoff;
      if (delay > maxDelay) throw err;
      safe(onRetry, { attempt: attempt + 1, delayMs: Math.round(delay), error: err });
      await sleep(delay, signal);
    }
  }
}

/* ───────────────────────────── stream parsers ───────────────────────────── */

/** Server-Sent Events parser. Handles split chunks, CRLF, comments, multi-line data. */
export function createSSEParser(onEvent) {
  let buf = '';
  let event = '';
  let data = [];
  const dispatch = () => {
    if (data.length) onEvent({ event: event || 'message', data: data.join('\n') });
    event = '';
    data = [];
  };
  const handleLine = (line) => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return;
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };
  return {
    feed(text) {
      buf += text;
      for (; ;) {
        const m = /\r\n|\n|\r/.exec(buf);
        if (!m) break;
        const line = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        handleLine(line);
      }
    },
    flush() {
      if (buf) { handleLine(buf); buf = ''; }
      dispatch();
    },
  };
}

/** Newline-delimited JSON parser (Ollama). */
export function createNDJSONParser(onEvent) {
  let buf = '';
  const emit = (line) => { if (line.trim()) onEvent({ data: line }); };
  return {
    feed(text) {
      buf += text;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        emit(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    },
    flush() { emit(buf); buf = ''; },
  };
}

/* ───────────────────────────── adapters ─────────────────────────────
 * Each adapter implements:
 *   buildRequest(ctx)  -> { url, headers, body }
 *   parseResponse(json)-> { text, thinking, usage, stopReason }
 *   parseStreamEvent(evt, state) -> { text?, thinking? } | null  (mutates state.usage / state.stopReason)
 *   buildModelsRequest(ctx) -> { url, headers }
 *   parseModels(json)  -> [{ id, name }]
 * ctx = { model, system, messages, apiKey, baseUrl, temperature, maxTokens, stream, browser }
 */

const flattenContent = (c) => {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => (typeof p === 'string' ? p : p?.text || '')).join('');
  return '';
};

function openAICompatible({ id, root, normalizeBase = (b) => b, maxTokensField, streamUsage, requireKeyForModels = true, filterModel = () => true }) {
  const base = (c) => normalizeBase(trimUrl(c.baseUrl) || root);
  const headers = (c) => {
    const h = { 'Content-Type': 'application/json' };
    if (c.apiKey) h.Authorization = `Bearer ${c.apiKey}`;
    return h;
  };
  return {
    id,
    streamFormat: 'sse',
    requireKeyForModels,
    buildRequest(c) {
      const messages = c.system ? [{ role: 'system', content: c.system }, ...c.messages] : c.messages;
      const body = { model: c.model, messages, stream: !!c.stream };
      if (c.temperature != null) body.temperature = c.temperature;
      if (c.maxTokens != null) body[maxTokensField] = c.maxTokens;
      if (c.stream && streamUsage) body.stream_options = { include_usage: true };
      return { url: `${base(c)}/chat/completions`, headers: headers(c), body };
    },
    parseResponse(j) {
      const ch = j.choices?.[0];
      return {
        text: flattenContent(ch?.message?.content),
        thinking: ch?.message?.reasoning_content || ch?.message?.reasoning || '',
        usage: normUsage(j.usage?.prompt_tokens, j.usage?.completion_tokens),
        stopReason: ch?.finish_reason || '',
      };
    },
    parseStreamEvent(evt, state) {
      if (evt.data === '[DONE]') return null;
      const j = safeJson(evt.data);
      if (!j) return null;
      if (j.error) {
        throw new ApiError(`Provider error from ${id}: ${j.error.message || JSON.stringify(j.error).slice(0, 200)}`, { provider: id });
      }
      if (j.usage) state.usage = normUsage(j.usage.prompt_tokens, j.usage.completion_tokens);
      const ch = j.choices?.[0];
      if (ch?.finish_reason) state.stopReason = ch.finish_reason;
      const d = ch?.delta;
      if (!d) return null;
      return { text: flattenContent(d.content), thinking: d.reasoning_content || d.reasoning || '' };
    },
    buildModelsRequest(c) {
      return { url: `${base(c)}/models`, headers: headers(c) };
    },
    parseModels(j) {
      return (j.data || [])
        .filter(m => m?.id && filterModel(m.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .map(m => ({ id: m.id, name: m.name || m.id }));
    },
  };
}

const OPENAI_CHAT_ID = /^(gpt-|o\d|chatgpt-|chat-latest)/;
const OPENAI_SKIP = /(embedding|tts|whisper|transcribe|realtime|audio|image|moderation|search|sora|dall-e|computer-use|codex|diarize)/;

const openai = openAICompatible({
  id: 'openai',
  root: 'https://api.openai.com/v1',
  maxTokensField: 'max_completion_tokens', // newer/reasoning models reject `max_tokens`
  streamUsage: true,
  filterModel: (id) => OPENAI_CHAT_ID.test(id) && !OPENAI_SKIP.test(id),
});

const openrouter = openAICompatible({
  id: 'openrouter',
  root: 'https://openrouter.ai/api/v1',
  maxTokensField: 'max_tokens',
  requireKeyForModels: false,
});

const lmstudio = openAICompatible({
  id: 'lmstudio',
  root: 'http://127.0.0.1:1234',
  normalizeBase: (b) => (b.endsWith('/v1') ? b : `${b}/v1`),
  maxTokensField: 'max_tokens',
});

function anthropicHeaders(c) {
  const h = {
    'Content-Type': 'application/json',
    'x-api-key': c.apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (c.browser) h['anthropic-dangerous-direct-browser-access'] = 'true';
  return h;
}

const anthropic = {
  id: 'anthropic',
  streamFormat: 'sse',
  buildRequest(c) {
    const body = {
      model: c.model,
      max_tokens: c.maxTokens ?? 8192,
      messages: c.messages,
      stream: !!c.stream,
    };
    if (c.system) body.system = c.system;
    if (c.temperature != null) body.temperature = c.temperature;
    return { url: 'https://api.anthropic.com/v1/messages', headers: anthropicHeaders(c), body };
  },
  parseResponse(j) {
    const blocks = j.content || [];
    return {
      text: blocks.filter(b => b.type === 'text').map(b => b.text).join(''),
      thinking: blocks.filter(b => b.type === 'thinking').map(b => b.thinking).join(''),
      usage: normUsage(j.usage?.input_tokens, j.usage?.output_tokens),
      stopReason: j.stop_reason || '',
    };
  },
  parseStreamEvent(evt, state) {
    const j = safeJson(evt.data);
    if (!j) return null;
    switch (j.type) {
      case 'message_start': {
        const u = j.message?.usage;
        if (u) {
          state.usage = {
            input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
            output: u.output_tokens || 0,
          };
        }
        return null;
      }
      case 'content_block_delta': {
        const d = j.delta;
        if (d?.type === 'text_delta') return { text: d.text };
        if (d?.type === 'thinking_delta') return { thinking: d.thinking };
        return null;
      }
      case 'message_delta':
        if (j.usage?.output_tokens != null) state.usage = { input: state.usage?.input ?? 0, output: j.usage.output_tokens };
        if (j.delta?.stop_reason) state.stopReason = j.delta.stop_reason;
        return null;
      case 'error':
        throw new ApiError(`Provider error from anthropic: ${j.error?.message || 'stream error'}`, {
          provider: 'anthropic', code: j.error?.type, status: j.error?.type === 'overloaded_error' ? 529 : 0,
        });
      default:
        return null;
    }
  },
  buildModelsRequest(c) {
    return { url: 'https://api.anthropic.com/v1/models?limit=1000', headers: anthropicHeaders(c) };
  },
  parseModels(j) {
    return (j.data || []).filter(m => m?.id).map(m => ({ id: m.id, name: m.display_name || m.id }));
  },
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const geminiHeaders = (c) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': c.apiKey }); // key stays out of the URL

function readGemini(j, state) {
  const parts = j.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
  const thinking = parts.filter(p => p.thought && typeof p.text === 'string').map(p => p.text).join('');
  const u = j.usageMetadata;
  if (u) state.usage = normUsage(u.promptTokenCount, (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0));
  const reason = j.candidates?.[0]?.finishReason || (j.promptFeedback?.blockReason ? `BLOCKED:${j.promptFeedback.blockReason}` : '');
  if (reason) state.stopReason = reason;
  return { text, thinking };
}

const gemini = {
  id: 'gemini',
  streamFormat: 'sse',
  buildRequest(c) {
    const model = encodeURIComponent(String(c.model).replace(/^models\//, ''));
    const url = `${GEMINI_BASE}/models/${model}:${c.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const body = {
      contents: c.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    };
    if (c.system) body.systemInstruction = { parts: [{ text: c.system }] };
    const gen = {};
    if (c.temperature != null) gen.temperature = c.temperature;
    if (c.maxTokens != null) gen.maxOutputTokens = c.maxTokens;
    if (Object.keys(gen).length) body.generationConfig = gen;
    return { url, headers: geminiHeaders(c), body };
  },
  parseResponse(j) {
    const state = { usage: null, stopReason: '' };
    const { text, thinking } = readGemini(j, state);
    return { text, thinking, usage: state.usage, stopReason: state.stopReason };
  },
  parseStreamEvent(evt, state) {
    const j = safeJson(evt.data);
    if (!j) return null;
    if (j.error) throw new ApiError(`Provider error from gemini: ${j.error.message || 'stream error'}`, { provider: 'gemini', code: j.error.status });
    return readGemini(j, state);
  },
  buildModelsRequest(c) {
    return { url: `${GEMINI_BASE}/models?pageSize=1000`, headers: geminiHeaders(c) };
  },
  parseModels(j) {
    return (j.models || [])
      .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map(m => ({ id: String(m.name).replace(/^models\//, ''), name: m.displayName || m.name }));
  },
};

const ollama = {
  id: 'ollama',
  streamFormat: 'ndjson',
  buildRequest(c) {
    const messages = c.system ? [{ role: 'system', content: c.system }, ...c.messages] : c.messages;
    const body = { model: c.model, messages, stream: !!c.stream };
    const options = {};
    if (c.temperature != null) options.temperature = c.temperature;
    if (c.maxTokens != null) options.num_predict = c.maxTokens;
    if (Object.keys(options).length) body.options = options;
    return {
      url: `${trimUrl(c.baseUrl) || 'http://127.0.0.1:11434'}/api/chat`,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  },
  parseResponse(j) {
    return {
      text: j.message?.content || '',
      thinking: j.message?.thinking || '',
      usage: normUsage(j.prompt_eval_count, j.eval_count),
      stopReason: j.done_reason || '',
    };
  },
  parseStreamEvent(evt, state) {
    const j = safeJson(evt.data);
    if (!j) return null;
    if (j.error) throw new ApiError(`Provider error from ollama: ${typeof j.error === 'string' ? j.error : JSON.stringify(j.error)}`, { provider: 'ollama' });
    if (j.done) {
      state.usage = normUsage(j.prompt_eval_count, j.eval_count);
      if (j.done_reason) state.stopReason = j.done_reason;
    }
    return { text: j.message?.content || '', thinking: j.message?.thinking || '' };
  },
  buildModelsRequest(c) {
    return { url: `${trimUrl(c.baseUrl) || 'http://127.0.0.1:11434'}/api/tags`, headers: {} };
  },
  parseModels(j) {
    return (j.models || []).map(m => ({ id: m.name || m.model, name: m.name || m.model }));
  },
};

export const ADAPTERS = Object.freeze({ anthropic, openai, gemini, openrouter, ollama, lmstudio });

/* ───────────────────────────── transport ───────────────────────────── */

/**
 * Wraps native (Tauri) or fetch transport behind one interface.
 * @param {{ nativeInvoker?: Function, nativeListen?: Function, fetchImpl?: Function }} [opts]
 */
export function createTransport({ nativeInvoker, nativeListen, fetchImpl } = {}) {
  const isNative = typeof nativeInvoker === 'function';
  const canStream = !isNative || typeof nativeListen === 'function';

  const normalizeNativeError = (err, label) => {
    if (isAbortError(err)) return err;
    if (typeof err === 'string' && err.includes('AbortError')) return abortError();
    return new Error(`Native transport failed for ${label}: ${err instanceof Error ? err.message : String(err)}`);
  };
  const cancelNative = (requestId) => () => { void Promise.resolve(nativeInvoker('cancel_native_ai_request', { requestId })).catch(() => { }); };
  const f = (...a) => (fetchImpl || globalThis.fetch)(...a);

  async function send(req) {
    const { requestId, url, method = 'POST', headers, body, signal, label } = req;
    if (signal?.aborted) { if (isNative) cancelNative(requestId)(); throw abortError(); }
    if (isNative) {
      try {
        const payload = { requestId, url, method, headers, body };
        const res = await raceAbort(
          nativeInvoker('native_ai_request', { ...payload, payload }),
          signal,
          cancelNative(requestId)
        );
        return { status: res.status, headers: headersToObject(res.headers), text: res.body ?? '' };
      } catch (err) { throw normalizeNativeError(err, label); }
    }
    try {
      const res = await f(url, { method, headers, body, signal });
      return { status: res.status, headers: headersToObject(res.headers), text: await res.text() };
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(`Connection to ${label} failed (${url}). Ensure endpoint is active.`);
    }
  }

  async function stream(req) {
    const { requestId, url, method = 'POST', headers, body, signal, label, onChunk } = req;
    if (signal?.aborted) { if (isNative) cancelNative(requestId)(); throw abortError(); }

    if (isNative) {
      let status = 0;
      let respHeaders = {};
      let errText = '';
      let failure = null;
      let finish;
      const ended = new Promise(r => { finish = r; });
      const unlisten = await nativeListen(`ai-stream:${requestId}`, (event) => {
        const p = event?.payload ?? event;
        if (!p) return;
        if (p.type === 'head') { status = p.status; respHeaders = headersToObject(p.headers); }
        else if (p.type === 'chunk') { if (status >= 200 && status < 300) onChunk(p.text); else errText += p.text; }
        else if (p.type === 'error') { failure = p.message; finish(); }
        else if (p.type === 'end') finish();
      });
      try {
        await raceAbort(nativeInvoker('native_ai_stream', { requestId, url, method, headers, body }), signal, cancelNative(requestId));
        // events can trail the invoke result by a tick; wait for the explicit `end`
        await Promise.race([ended, sleep(2000)]);
      } catch (err) {
        throw normalizeNativeError(err, label);
      } finally {
        try { (await unlisten)?.(); } catch { /* ignore */ }
      }
      if (failure) throw new Error(`Native transport failed for ${label}: ${failure}`);
      return { status, headers: respHeaders, text: errText };
    }

    let res;
    try {
      res = await f(url, { method, headers, body, signal });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(`Connection to ${label} failed (${url}). Ensure endpoint is active.`);
    }
    const respHeaders = headersToObject(res.headers);
    if (res.status < 200 || res.status >= 300) return { status: res.status, headers: respHeaders, text: await res.text() };
    if (!res.body) { onChunk(await res.text()); return { status: res.status, headers: respHeaders, text: '' }; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    try {
      for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(dec.decode(value, { stream: true }));
      }
      const tail = dec.decode();
      if (tail) onChunk(tail);
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(`Connection to ${label} was lost while streaming.`);
    }
    return { status: res.status, headers: respHeaders, text: '' };
  }

  return { isNative, canStream, send, stream };
}

function ensureOk(provider, res) {
  if (res.status < 200 || res.status >= 300) throw buildApiError(provider, res.status, res.text, res.headers);
}

/* ───────────────────────────── engine ───────────────────────────── */

export class ChatEngine {
  /** @type {ChatMessage[]} */ messages = [];
  maxMessages = 20;             // stored history cap (what is *sent* is governed by contextBudget)
  contextBudget = null;         // tokens sent per request; null = provider default
  systemPrompt = '';
  temperature = null;           // null = provider default (some newer models reject custom values)
  maxTokens = null;             // null = adapter default
  activeProvider = 'gemini';
  activeModel = PROVIDER_BY_ID.get('gemini').defaultModel;
  /** @type {string | null} */ activeRequestId = null;
  /** @type {{ text: string, usage: any, stopReason: string, model: string, provider: string, latencyMs: number, thinking: string } | null} */
  lastResult = null;
  /** @type {AbortController | null} */ _controller = null;

  /** Sets active provider and resets activeModel to the provider default. */
  setProvider(providerId) {
    const match = PROVIDER_BY_ID.get(providerId);
    if (match) {
      this.activeProvider = match.id;
      this.activeModel = match.defaultModel;
    }
  }

  setModel(modelId) {
    this.activeModel = String(modelId || '').trim();
  }

  addUserMessage(text, files) {
    return this._push({
      role: 'user',
      content: (text || '').trim(),
      files: Array.isArray(files) ? files.map(f => String(f).slice(0, 100)) : undefined,
    });
  }

  addAssistantReply(text, meta = {}) {
    return this._push({ role: 'assistant', content: (text || '').trim(), ...meta });
  }

  clear() { this.messages = []; }

  /** Abort the in-flight request. Any streamed text so far is kept as a partial reply. */
  stop() { this._controller?.abort(); }

  /** Drop trailing assistant messages and ask again. */
  regenerate(params = {}) {
    while (this.messages.length && this.messages[this.messages.length - 1].role === 'assistant') this.messages.pop();
    return this.requestCompletion(params);
  }

  /** Replace a user message and discard everything after it. Call requestCompletion() afterwards. */
  editMessage(id, text) {
    const i = this.messages.findIndex(m => m.id === id);
    if (i === -1 || this.messages[i].role !== 'user') return false;
    this.messages[i] = { ...this.messages[i], content: (text || '').trim(), at: Date.now() };
    this.messages.length = i + 1;
    return true;
  }

  _push(fields) {
    /** @type {ChatMessage} */
    const msg = { id: makeId('msg'), at: Date.now(), ...fields };
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) this.messages = this.messages.slice(-this.maxMessages);
    return msg;
  }

  /** Normalizes history for providers: splits system text, merges same-role runs, trims to token budget. */
  _prepare(budget, systemPrompt) {
    const sys = systemPrompt ? [systemPrompt] : [];
    let msgs = [];
    for (const m of this.messages) {
      if (m.role === 'system') { if (m.content) sys.push(m.content); continue; }
      if (!m.content) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const last = msgs[msgs.length - 1];
      if (last && last.role === role) last.content += `\n\n${m.content}`;
      else msgs.push({ role, content: m.content });
    }
    let total = 0;
    let start = msgs.length;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const t = estimateTokens(msgs[i].content) + 4;
      if (start < msgs.length && total + t > budget) break; // always keep the newest message
      total += t;
      start = i;
    }
    msgs = msgs.slice(start);
    while (msgs.length > 1 && msgs[0].role !== 'user') msgs.shift(); // providers expect a user-first history
    return { system: sys.join('\n\n'), messages: msgs };
  }

  /**
   * Lists models available from a provider (for a dynamic model picker).
   * @returns {Promise<{id: string, name: string}[]>}
   */
  async listModels(params = {}) {
    const provider = params.provider || this.activeProvider;
    const meta = PROVIDER_BY_ID.get(provider);
    const adapter = ADAPTERS[provider];
    if (!meta || !adapter) throw new Error(`Unsupported AI provider: ${provider}`);
    const apiKey = (params.apiKey || '').trim();
    if (!meta.isLocal && !apiKey && adapter.requireKeyForModels !== false) {
      throw new Error(`API key required for ${provider}. Please configure your API key in Settings.`);
    }
    const transport = params.transport || createTransport({ nativeInvoker: params.nativeInvoker, nativeListen: params.nativeListen, fetchImpl: params.fetchImpl });
    const req = adapter.buildModelsRequest({ apiKey, baseUrl: params.localUrl, browser: !transport.isNative });
    const res = await transport.send({
      requestId: makeId('models'), method: 'GET', url: req.url, headers: req.headers, body: undefined,
      signal: params.signal, label: provider,
    });
    ensureOk(provider, res);
    const json = safeJson(res.text);
    if (!json) throw new Error(`Invalid JSON response from ${provider}`);
    return adapter.parseModels(json);
  }

  /**
   * Runs a completion (streaming by default) and appends the reply to history.
   * Backward compatible: resolves with the full reply text.
   * @param {object} params
   * @param {string} [params.provider] @param {string} [params.model]
   * @param {string} [params.localUrl] @param {string} [params.apiKey]
   * @param {string} [params.requestId] @param {AbortSignal} [params.signal]
   * @param {boolean} [params.stream=true]
   * @param {string} [params.systemPrompt] @param {number|null} [params.temperature] @param {number|null} [params.maxTokens]
   * @param {number} [params.contextBudget]
   * @param {(delta: string, full: string) => void} [params.onDelta]
   * @param {(delta: string) => void} [params.onThinking]
   * @param {(info: {attempt: number, delayMs: number, error: Error}) => void} [params.onRetry]
   * @param {Function} [params.nativeInvoker] @param {Function} [params.nativeListen]
   * @returns {Promise<string>}
   */
  async requestCompletion(params = {}) {
    const provider = params.provider || this.activeProvider;
    const meta = PROVIDER_BY_ID.get(provider);
    const adapter = ADAPTERS[provider];
    if (!meta || !adapter) throw new Error(`Unsupported AI provider: ${provider}`);

    const apiKey = (params.apiKey || '').trim();
    if (!meta.isLocal && !apiKey) {
      throw new Error(`API key required for ${provider}. Please configure your API key in Settings.`);
    }
    const requestId = params.requestId || makeId('req');
    this.activeRequestId = requestId;

    if (params.signal?.aborted) {
      if (typeof params.nativeInvoker === 'function') {
        void Promise.resolve(params.nativeInvoker('cancel_native_ai_request', { requestId })).catch(() => {});
      }
      throw abortError();
    }

    const last = this.messages[this.messages.length - 1];
    if (!last || last.role === 'assistant') {
      if (params.prompt) {
        this.addUserMessage(params.prompt);
      } else {
        this.addUserMessage('Hello');
      }
    }

    // a new request supersedes any in-flight one
    this._controller?.abort();
    const controller = new AbortController();
    this._controller = controller;
    const signal = controller.signal;
    const unlink = linkSignal(params.signal, controller);

    const transport = createTransport({ nativeInvoker: params.nativeInvoker, nativeListen: params.nativeListen, fetchImpl: params.fetchImpl });
    const streaming = params.stream !== false && transport.canStream;

    let fullText = '';
    let thinking = '';
    let model = '';
    const started = Date.now();
    const state = { usage: null, stopReason: '' };

    try {
      model = String(params.model || (provider === this.activeProvider ? this.activeModel : '') || meta.defaultModel || '').trim();
      if (!model && meta.isLocal) {
        const models = await this.listModels({ provider, localUrl: params.localUrl, signal, transport });
        model = models[0]?.id || '';
        if (!model) throw new Error(`No model available on ${provider}. Load or pull a model first.`);
        if (provider === this.activeProvider) this.activeModel = model;
      }

      const budget = params.contextBudget ?? this.contextBudget ?? meta.contextBudget;
      const { system, messages } = this._prepare(budget, params.systemPrompt ?? this.systemPrompt);
      const temperature = params.temperature !== undefined ? params.temperature : this.temperature;
      const maxTokens = params.maxTokens !== undefined ? params.maxTokens : this.maxTokens;
      const ctx = { model, system, messages, apiKey, baseUrl: params.localUrl, temperature, maxTokens, stream: streaming, browser: !transport.isNative };

      const emit = (text, think) => {
        if (think) { thinking += think; safe(params.onThinking, think); }
        if (text) { fullText += text; safe(params.onDelta, text, fullText); }
      };

      const attempt = async () => {
        const req = adapter.buildRequest(ctx);
        const base = { requestId, method: 'POST', url: req.url, headers: req.headers, body: JSON.stringify(req.body), signal, label: provider };

        if (streaming) {
          const onEvent = (evt) => { const out = adapter.parseStreamEvent(evt, state); if (out) emit(out.text, out.thinking); };
          const parser = adapter.streamFormat === 'ndjson' ? createNDJSONParser(onEvent) : createSSEParser(onEvent);
          const res = await transport.stream({ ...base, onChunk: (t) => parser.feed(t) });
          ensureOk(provider, res);
          parser.flush();
          return;
        }

        const res = await transport.send(base);
        ensureOk(provider, res);
        const json = safeJson(res.text);
        if (!json) throw new Error(`Invalid JSON response from ${provider}`);
        const out = adapter.parseResponse(json);
        state.usage = out.usage;
        state.stopReason = out.stopReason;
        emit(out.text, out.thinking);
      };

      await withRetry(attempt, { signal, onRetry: params.onRetry });

      if (signal.aborted || this.activeRequestId !== requestId) throw abortError();
      if (!fullText.trim()) {
        throw new Error(`Empty response received from ${provider}${state.stopReason ? ` (stop reason: ${state.stopReason})` : ''}`);
      }

      const msg = this.addAssistantReply(fullText, { model, provider, usage: state.usage, stopReason: state.stopReason || undefined });
      this.lastResult = { text: msg.content, usage: state.usage, stopReason: state.stopReason, model, provider, latencyMs: Date.now() - started, thinking };
      return msg.content;
    } catch (err) {
      // keep what streamed in (stop / mid-stream failure) unless a newer request took over
      if (fullText.trim() && this.activeRequestId === requestId) {
        this.addAssistantReply(fullText, { partial: true, model, provider });
      }
      throw err;
    } finally {
      unlink();
      if (this._controller === controller) this._controller = null;
      if (this.activeRequestId === requestId) this.activeRequestId = null;
    }
  }
}

/* ───────────────────────────── markdown ───────────────────────────── */

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const BLOCK_TOKEN = /^\u0001\d+\u0001$/;

/**
 * Sandboxed Markdown -> safe HTML. Everything is HTML-escaped first; code is stashed
 * before any other formatting so it is never re-parsed. Supports fenced code (including
 * unclosed fences while streaming), inline code, headings, bold/italic/strike, http(s)/mailto
 * links, nested lists, blockquotes, tables, and horizontal rules. No images, no raw HTML.
 * @param {string} raw
 * @returns {string}
 */
export function renderSafeMarkdown(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const stash = [];
  const hold = (html, tok) => `${tok}${stash.push(html) - 1}${tok}`;
  const restore = (s) => {
    for (let pass = 0; pass < 3 && /[\u0000\u0001]\d+[\u0000\u0001]/.test(s); pass++) {
      s = s.replace(/([\u0000\u0001])(\d+)\1/g, (_m, _t, i) => stash[Number(i)] ?? '');
    }
    return s;
  };

  const text0 = escapeHtml(raw.replace(/[\u0000\u0001]/g, '').replace(/\r\n?/g, '\n'));

  // 1. fenced code (line-based; an unclosed fence runs to the end, which is what streaming needs)
  const lines = text0.split('\n');
  const kept = [];
  let open = null;
  const codeHtml = (lang, code) => `<pre class="code-block"${lang ? ` data-lang="${lang}"` : ''}><code>${code}</code></pre>`;
  for (const line of lines) {
    if (!open) {
      const m = /^(\s*)```([\w+.#-]*)\s*$/.exec(line);
      if (m) open = { indent: m[1].length, lang: m[2], buf: [] };
      else kept.push(line);
    } else if (/^\s*```\s*$/.test(line)) {
      kept.push(' '.repeat(open.indent) + hold(codeHtml(open.lang, open.buf.join('\n')), '\u0001'));
      open = null;
    } else {
      open.buf.push(open.indent ? line.replace(new RegExp(`^ {0,${open.indent}}`), '') : line);
    }
  }
  if (open) kept.push(' '.repeat(open.indent) + hold(codeHtml(open.lang, open.buf.join('\n')), '\u0001'));
  let text = kept.join('\n');

  // 2. inline code, then links (both stashed so emphasis never touches them)
  text = text.replace(/`([^`\n]+)`/g, (_m, c) => hold(`<code class="inline-code">${c}</code>`, '\u0000'));
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, label, url) => hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`, '\u0000'));

  const inline = (s) => s
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

  const itemHtml = (txt) => {
    const out = [];
    let buf = [];
    const flush = () => { if (buf.length) { out.push(inline(buf.join('\n')).replace(/\n/g, '<br>')); buf = []; } };
    for (const l of txt.split('\n')) {
      if (BLOCK_TOKEN.test(l.trim())) { flush(); out.push(l.trim()); } else buf.push(l);
    }
    flush();
    return out.join('');
  };

  const buildList = (items) => {
    let html = '';
    const stack = [];
    for (const it of items) {
      const tag = it.ordered ? 'ol' : 'ul';
      const openTag = () => `<${tag}${it.ordered && it.num !== 1 ? ` start="${it.num}"` : ''}><li>`;
      while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
      const top = stack[stack.length - 1];
      if (!top || it.indent > top.indent) {
        html += openTag();
        stack.push({ tag, indent: it.indent });
      } else {
        html += '</li>';
        if (top.tag !== tag) { html += `</${top.tag}>${openTag()}`; stack[stack.length - 1] = { tag, indent: top.indent }; }
        else html += '<li>';
      }
      html += itemHtml(it.text);
    }
    while (stack.length) html += `</li></${stack.pop().tag}>`;
    return html;
  };

  const parseList = (ls, start) => {
    const items = [];
    let i = start;
    while (i < ls.length) {
      const m = LIST_RE.exec(ls[i]);
      if (m) {
        items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), num: parseInt(m[2], 10) || 1, text: m[3] });
        i++;
      } else if (items.length && ls[i].trim() && /^\s{2,}\S/.test(ls[i])) {
        items[items.length - 1].text += `\n${ls[i].trim()}`;
        i++;
      } else if (!ls[i].trim()) {
        let j = i + 1;
        while (j < ls.length && !ls[j].trim()) j++;
        if (j < ls.length && LIST_RE.test(ls[j])) i = j; else break;
      } else break;
    }
    return { html: buildList(items), next: i };
  };

  const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  const parseTable = (ls, start) => {
    const head = splitRow(ls[start]);
    const aligns = splitRow(ls[start + 1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : ''));
    const cell = (tag, c, idx) => `<${tag}${aligns[idx] ? ` class="align-${aligns[idx]}"` : ''}>${inline(c)}</${tag}>`;
    let i = start + 2;
    let body = '';
    while (i < ls.length && ls[i].trim() && ls[i].includes('|')) {
      body += `<tr>${splitRow(ls[i]).map((c, k) => cell('td', c, k)).join('')}</tr>`;
      i++;
    }
    const html = `<table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>${body}</tbody></table>`;
    return { html, next: i };
  };

  const renderBlocks = (src) => {
    const ls = src.split('\n');
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) { out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`); para = []; }
    };
    let i = 0;
    while (i < ls.length) {
      const line = ls[i];
      if (!line.trim()) { flush(); i++; continue; }
      if (BLOCK_TOKEN.test(line.trim())) { flush(); out.push(line.trim()); i++; continue; }
      let m = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
      if (m) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
      if (/^ {0,3}&gt;/.test(line)) {
        flush();
        const q = [];
        while (i < ls.length && /^ {0,3}&gt;/.test(ls[i])) { q.push(ls[i].replace(/^ {0,3}&gt; ?/, '')); i++; }
        out.push(`<blockquote>${renderBlocks(q.join('\n'))}</blockquote>`);
        continue;
      }
      if (line.includes('|') && i + 1 < ls.length && TABLE_SEP.test(ls[i + 1])) {
        flush();
        const r = parseTable(ls, i);
        out.push(r.html);
        i = r.next;
        continue;
      }
      if (LIST_RE.test(line)) {
        flush();
        const r = parseList(ls, i);
        out.push(r.html);
        i = r.next;
        continue;
      }
      para.push(line);
      i++;
    }
    flush();
    return out.join('');
  };

  return restore(renderBlocks(text));
}