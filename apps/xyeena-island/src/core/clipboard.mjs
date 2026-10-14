// Clipboard history is always OFF at launch. Items never reach disk or the network.
// Background observation is only allowed after explicit consent in the running session.
/**
 * @typedef {{
 *   id: number,
 *   type: 'text' | 'image' | 'files',
 *   text: string,
 *   dataUrl?: string,
 *   filePaths?: string[],
 *   hash: string,
 *   pinned?: boolean,
 *   sizeBytes?: number,
 *   at: number
 * }} ClipItem
 */
export class ClipboardHistory {
  /** @type {ClipItem[]} */ items = [];
  enabled = false;
  /** @type {string|null} */ last = null;
  nextId = 1;
  maxItems = 25;
  maxLength = 2048;

  enable() {
    this.enabled = true;
    this.last = null;
  }

  disable() {
    this.enabled = false;
    this.last = null;
  }

  /**
   * Clears clipboard history in memory.
   * @param {boolean} [onlyUnpinned=false] - If true, preserves pinned items.
   */
  clear(onlyUnpinned = false) {
    if (onlyUnpinned) {
      this.items = this.items.filter(item => item.pinned);
    } else {
      this.items = [];
    }
    this.last = null;
  }

  deleteItem(id) {
    const prevLen = this.items.length;
    this.items = this.items.filter(item => item.id !== id);
    return this.items.length < prevLen;
  }

  togglePin(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return false;
    item.pinned = !item.pinned;
    return true;
  }

  filter(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [...this.items];
    return this.items.filter(item => {
      if (item.text && item.text.toLowerCase().includes(q)) return true;
      if (item.type && item.type.toLowerCase().includes(q)) return true;
      if (item.filePaths && item.filePaths.some(p => p.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  /**
   * Accepts text or a structured native clipboard payload.
   * @param {unknown} input
   * @param {number} [now]
   * @returns {boolean}
   */
  accept(input, now = Date.now()) {
    if (!this.enabled || input === null || input === undefined) return false;

    // Handle legacy/plain text string input
    if (typeof input === 'string') {
      if (this.last === null) {
        this.last = input;
        return false;
      }
      if (this.last === input) return false;
      this.last = input;
      const text = input.trim();
      if (!text || text.length > this.maxLength || looksSensitive(text)) return false;

      this.items = this.items.filter(item => item.text !== text);
      this.items.unshift({
        id: this.nextId++,
        type: 'text',
        text,
        hash: 'text:' + text,
        pinned: false,
        sizeBytes: text.length,
        at: Number.isFinite(now) ? now : Date.now(),
      });
      this._trim();
      return true;
    }

    // Handle structured native clipboard item (object)
    if (typeof input === 'object' && input !== null) {
      const payload = /** @type {any} */ (input);
      const hash = payload.hash || (payload.text ? 'text:' + payload.text : null);
      if (!hash) return false;

      if (this.last === null) {
        this.last = hash;
        return false;
      }
      if (this.last === hash) return false;
      this.last = hash;

      const itemType = payload.itemType || payload.type || 'text';
      const text = (payload.text || '').trim();

      // Check text constraints if text item
      if (itemType === 'text') {
        if (!text || text.length > this.maxLength || looksSensitive(text)) return false;
      }

      this.items = this.items.filter(item => item.hash !== hash && item.text !== text);
      this.items.unshift({
        id: this.nextId++,
        type: itemType,
        text: text || (itemType === 'image' ? 'Image' : 'File list'),
        dataUrl: payload.dataUrl,
        filePaths: payload.filePaths,
        hash,
        pinned: false,
        sizeBytes: payload.sizeBytes || text.length,
        at: Number.isFinite(now) ? now : Date.now(),
      });
      this._trim();
      return true;
    }

    return false;
  }

  _trim() {
    if (this.items.length <= this.maxItems) return;
    // Keep pinned items when trimming excess unpinned items
    const pinned = this.items.filter(i => i.pinned);
    const unpinned = this.items.filter(i => !i.pinned);
    const allowedUnpinned = Math.max(0, this.maxItems - pinned.length);
    this.items = [...pinned, ...unpinned.slice(0, allowedUnpinned)].sort((a, b) => {
      // Pinned first, then newest first
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.at - a.at;
    });
  }
}

/**
 * Heuristic only. Never promise that all passwords, tokens or private text are detected.
 * @param {string} value
 */
export function looksSensitive(value) {
  return /-----BEGIN (?:.* )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|authorization|password|passwd|secret)\s*[:=]\s*\S+|(?:sk-[A-Za-z0-9_-]{16,})|(?:gh[opusr]_[A-Za-z0-9]{20,})/i.test(value);
}
