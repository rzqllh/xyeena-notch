// Flow offline speech dictation, snippets expansion, and local statistics.
// Enforces local-only processing, zero background recording, and explicit user consent.

/**
 * @typedef {{
 *   trigger: string,
 *   replacement: string,
 *   description?: string
 * }} SnippetDefinition
 */

/**
 * @typedef {{
 *   wordsCount: number,
 *   charactersCount: number,
 *   sessionsCount: number
 * }} FlowStats
 */

/** @type {ReadonlyArray<SnippetDefinition>} */
export const DEFAULT_SNIPPETS = Object.freeze([
  { trigger: ':date', replacement: new Date().toISOString().slice(0, 10), description: 'Current date (YYYY-MM-DD)' },
  { trigger: ':time', replacement: '12:00', description: 'Current time' },
  { trigger: ':shrug', replacement: '¯\\_(ツ)_/¯', description: 'Shrug emoji' },
  { trigger: ':todo', replacement: '- [ ] ', description: 'Markdown task item' },
  { trigger: ':sig', replacement: 'Best regards,', description: 'Sign-off' }
]);

/**
 * Strips filler words, normalizes spacing, and capitalizes dictated text.
 * @param {string} text
 * @param {{ filterFillers?: boolean, autoCapitalize?: boolean }} [options]
 * @returns {string}
 */
export function cleanDictatedText(text, options = {}) {
  const { filterFillers = true, autoCapitalize = true } = options;
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();

  if (filterFillers) {
    // Case-insensitive word boundary replacement for common filler tokens
    cleaned = cleaned.replace(/\b(um|uh|erm|ah|like|you know)\b[\s,]*/gi, ' ');
  }

  // Normalize consecutive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (autoCapitalize && cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Expands snippet triggers within text.
 * @param {string} text
 * @param {ReadonlyArray<SnippetDefinition>} [snippets]
 * @returns {string}
 */
export function expandSnippets(text, snippets = DEFAULT_SNIPPETS) {
  if (!text || typeof text !== 'string') return '';
  let result = text;

  for (const snippet of snippets) {
    if (snippet && snippet.trigger && typeof snippet.replacement === 'string') {
      result = result.replaceAll(snippet.trigger, snippet.replacement);
    }
  }

  return result;
}

/**
 * Computes updated local dictation statistics without synthetic metrics.
 * @param {FlowStats} current
 * @param {string} text
 * @returns {FlowStats}
 */
export function updateDictationStats(current, text) {
  const base = current && typeof current === 'object' ? current : { wordsCount: 0, charactersCount: 0, sessionsCount: 0 };
  const str = typeof text === 'string' ? text.trim() : '';

  const wordsInText = str.length > 0 ? str.split(/\s+/).filter(Boolean).length : 0;
  const charsInText = str.length;

  return {
    wordsCount: (base.wordsCount || 0) + wordsInText,
    charactersCount: (base.charactersCount || 0) + charsInText,
    sessionsCount: (base.sessionsCount || 0) + (wordsInText > 0 ? 1 : 0)
  };
}

/**
 * Local Flow dictation controller managing push-to-talk and consent.
 */
export class FlowDictationController {
  constructor() {
    /** @type {'idle' | 'listening' | 'processing' | 'error' | 'disabled'} */
    this.state = 'idle';
    this.enabled = false;
    this.pushToTalk = true;
    /** @type {((state: string, text?: string) => void) | null} */
    this.onStateChange = null;
  }

  /**
   * Set opt-in enabled state.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled && this.state === 'listening') {
      this.cancel();
    }
    this.state = this.enabled ? 'idle' : 'disabled';
    if (this.onStateChange) this.onStateChange(this.state);
  }

  /**
   * Start listening session. Requires explicit opt-in.
   * @returns {boolean} true if listening started
   */
  startListening() {
    if (!this.enabled) {
      this.state = 'disabled';
      if (this.onStateChange) this.onStateChange(this.state);
      return false;
    }
    this.state = 'listening';
    if (this.onStateChange) this.onStateChange(this.state);
    return true;
  }

  /**
   * Complete listening session and process text.
   * @param {string} rawText
   * @param {ReadonlyArray<SnippetDefinition>} [snippets]
   * @returns {string} final expanded text
   */
  stopListening(rawText = '', snippets = DEFAULT_SNIPPETS) {
    if (this.state !== 'listening') return '';
    this.state = 'processing';
    if (this.onStateChange) this.onStateChange(this.state);

    const cleaned = cleanDictatedText(rawText);
    const expanded = expandSnippets(cleaned, snippets);

    this.state = 'idle';
    if (this.onStateChange) this.onStateChange(this.state, expanded);
    return expanded;
  }

  /**
   * Abort current session without output.
   */
  cancel() {
    this.state = this.enabled ? 'idle' : 'disabled';
    if (this.onStateChange) this.onStateChange(this.state);
  }
}
