// Multi-provider AI chat client: Claude, OpenAI, Gemini, Ollama, LM Studio.
// Client-side, bounded history, sandboxed Markdown rendering, and credential safety.

/**
 * @typedef {{
 *   id: string,
 *   role: 'user' | 'assistant' | 'system',
 *   content: string,
 *   at: number,
 *   files?: string[]
 * }} ChatMessage
 */

export const AI_PROVIDERS = Object.freeze([
  { id: 'anthropic', name: 'Anthropic (Claude 3.7 / 3.5)', defaultModel: 'claude-3-7-sonnet-latest', isLocal: false },
  { id: 'openai', name: 'OpenAI (GPT-4o / o1)', defaultModel: 'gpt-4o', isLocal: false },
  { id: 'gemini', name: 'Google Gemini (2.5 / 2.0 Flash)', defaultModel: 'gemini-2.0-flash', isLocal: false },
  { id: 'openrouter', name: 'OpenRouter', defaultModel: 'anthropic/claude-3.5-sonnet', isLocal: false },
  { id: 'ollama', name: 'Ollama Local (127.0.0.1:11434)', defaultModel: 'llama3:latest', isLocal: true },
  { id: 'lmstudio', name: 'LM Studio (127.0.0.1:1234)', defaultModel: 'local-model', isLocal: true },
]);

export class ChatEngine {
  /** @type {ChatMessage[]} */ messages = [];
  maxMessages = 20;
  activeProvider = 'gemini';
  activeModel = AI_PROVIDERS.find(p => p.id === 'gemini')?.defaultModel || 'gemini-2.0-flash';
  /** @type {string | null} */ activeRequestId = null;

  /**
   * Sets active provider and updates activeModel to provider default.
   * @param {string} providerId
   */
  setProvider(providerId) {
    const match = AI_PROVIDERS.find(p => p.id === providerId);
    if (match) {
      this.activeProvider = match.id;
      this.activeModel = match.defaultModel;
    }
  }

  /**
   * @param {string} text
   * @param {string[]} [files]
   * @returns {ChatMessage}
   */
  addUserMessage(text, files) {
    const cleanText = (text || '').trim();
    /** @type {ChatMessage} */
    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: cleanText,
      at: Date.now(),
      files: Array.isArray(files) ? files.map(f => String(f).slice(0, 100)) : undefined
    };
    this.messages.push(msg);
    this._trim();
    return msg;
  }

  /**
   * @param {string} text
   * @returns {ChatMessage}
   */
  addAssistantReply(text) {
    const cleanText = (text || '').trim();
    /** @type {ChatMessage} */
    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      content: cleanText,
      at: Date.now()
    };
    this.messages.push(msg);
    this._trim();
    return msg;
  }

  clear() {
    this.messages = [];
  }

  _trim() {
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  /**
   * Executes a real AI completion via privileged native transport (Tauri) or fallback fetch.
   * Handles local models (Ollama, LM Studio) and remote BYOK providers (Anthropic, OpenAI, Gemini, OpenRouter).
   * @param {object} params
   * @param {string} [params.requestId]
   * @param {string} [params.provider]
   * @param {string} [params.model]
   * @param {string} [params.localUrl]
   * @param {string} [params.apiKey]
   * @param {function} [params.nativeInvoker]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<string>}
   */
  async requestCompletion(params = {}) {
    const provider = params.provider || this.activeProvider;
    const model = params.model || this.activeModel;
    const localUrl = (params.localUrl || '').trim();
    const apiKey = (params.apiKey || '').trim();
    const nativeInvoker = params.nativeInvoker;
    const signal = params.signal;
    const requestId = params.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.activeRequestId = requestId;

    const isLocal = provider === 'ollama' || provider === 'lmstudio';
    if (!isLocal && !apiKey) {
      throw new Error(`API key required for ${provider}. Please configure your API key in Settings.`);
    }

    let url = '';
    /** @type {Record<string, string>} */
    let headers = { 'Content-Type': 'application/json' };
    let body = '';

    const history = this.messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    if (provider === 'ollama') {
      const base = localUrl || 'http://127.0.0.1:11434';
      url = `${base.replace(/\/+$/, '')}/api/chat`;
      body = JSON.stringify({
        model: model || 'llama3:latest',
        messages: history,
        stream: false
      });
    } else if (provider === 'lmstudio') {
      const base = localUrl || 'http://127.0.0.1:1234';
      url = `${base.replace(/\/+$/, '')}/v1/chat/completions`;
      body = JSON.stringify({
        model: model || 'local-model',
        messages: history,
        stream: false
      });
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = JSON.stringify({
        model: model || 'gpt-4o',
        messages: history,
        stream: false
      });
    } else if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({
        model: model || 'claude-3-7-sonnet-latest',
        max_tokens: 1024,
        messages: history.filter(m => m.role === 'user' || m.role === 'assistant')
      });
    } else if (provider === 'gemini') {
      const gModel = model || 'gemini-2.0-flash';
      url = `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      body = JSON.stringify({
        contents: history.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      });
    } else if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = JSON.stringify({
        model: model || 'anthropic/claude-3.5-sonnet',
        messages: history,
        stream: false
      });
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }

    if (signal?.aborted) {
      if (typeof nativeInvoker === 'function') {
        void nativeInvoker('cancel_native_ai_request', { requestId }).catch(() => { });
      }
      const err = new Error('Chat completion aborted');
      err.name = 'AbortError';
      throw err;
    }

    let responseText = '';
    let status = 200;

    if (typeof nativeInvoker === 'function') {
      try {
        const invokePromise = nativeInvoker('native_ai_request', {
          requestId,
          url,
          method: 'POST',
          headers,
          body
        });
        const res = signal ? await Promise.race([
          invokePromise,
          new Promise((_, reject) => {
            if (signal.aborted) {
              void nativeInvoker('cancel_native_ai_request', { requestId }).catch(() => { });
              const err = new Error('Chat completion aborted');
              err.name = 'AbortError';
              reject(err);
            } else {
              signal.addEventListener('abort', () => {
                void nativeInvoker('cancel_native_ai_request', { requestId }).catch(() => { });
                const err = new Error('Chat completion aborted');
                err.name = 'AbortError';
                reject(err);
              }, { once: true });
            }
          })
        ]) : await invokePromise;
        status = res.status;
        responseText = res.body;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (typeof err === 'string' && err.includes('AbortError')) throw new Error(err);
        throw new Error(`Native transport failed for ${provider}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal
        });
        status = res.status;
        responseText = await res.text();
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (typeof err === 'string' && err.includes('AbortError')) throw new Error(err);
        throw new Error(`Connection to ${provider} failed (${url}). Ensure endpoint is active.`);
      }
    }

    if (signal?.aborted || this.activeRequestId !== requestId) {
      const err = new Error('Chat completion aborted');
      err.name = 'AbortError';
      throw err;
    }

    if (status === 401) {
      throw new Error(`Authentication failed (401 Unauthorized) for ${provider}. Please verify your API key.`);
    }
    if (status === 429) {
      throw new Error(`Rate limit exceeded (429 Too Many Requests) for ${provider}. Please try again shortly.`);
    }
    if (status < 200 || status >= 300) {
      let errDetail = responseText.slice(0, 200);
      try {
        const parsedErr = JSON.parse(responseText);
        errDetail = parsedErr.error?.message || parsedErr.message || errDetail;
      } catch { }
      throw new Error(`Provider error (${status}) from ${provider}: ${errDetail}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON response from ${provider}`);
    }

    let reply = '';
    if (provider === 'ollama') {
      reply = parsed.message?.content || '';
    } else if (provider === 'anthropic') {
      reply = parsed.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      reply = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      reply = parsed.choices?.[0]?.message?.content || '';
    }

    if (!reply.trim()) {
      throw new Error(`Empty response received from ${provider}`);
    }

    this.addAssistantReply(reply);
    return reply;
  }
}

/**
 * Sandboxed basic Markdown to safe HTML.
 * Escapes raw HTML entities and parses code blocks, inline code, bold, italics, and links.
 * @param {string} raw
 * @returns {string}
 */
export function renderSafeMarkdown(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // 1. Escape HTML
  let out = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 2. Fenced code blocks ```code```
  out = out.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>`;
  });

  // 3. Inline code `code`
  out = out.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 4. Bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 5. Italic *text*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 6. Newlines to <br> outside <pre>
  const parts = out.split(/(<pre[\s\S]*?<\/pre>)/);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/\n/g, '<br>');
  }
  return parts.join('');
}
