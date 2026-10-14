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
  activeProvider = 'anthropic';
  activeModel = 'claude-3-7-sonnet-latest';

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
