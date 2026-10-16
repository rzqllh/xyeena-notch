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
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MiB
const MAX_TOTAL_BYTES = 64 * 1024 * 1024; // 64 MiB
const MAX_FILE_PATHS = 32;
const MAX_PATH_LENGTH = 1024;

export class ClipboardHistory {
  /** @type {ClipItem[]} */ items = [];
  enabled = false;
  /** @type {string|null} */ last = null;
  nextId = 1;
  maxItems = 50;
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
   * Sets max history items. Permitted limits: 20, 50, 100.
   * @param {number} limit
   * @returns {boolean}
   */
  setMaxItems(limit) {
    if (limit === 20 || limit === 50 || limit === 100) {
      this.maxItems = limit;
      this._trim();
      return true;
    }
    return false;
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

  /** @param {number} id */
  deleteItem(id) {
    const prevLen = this.items.length;
    this.items = this.items.filter(item => item.id !== id);
    return this.items.length < prevLen;
  }

  /** @param {number} id */
  togglePin(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return false;
    item.pinned = !item.pinned;
    return true;
  }

  /** @param {string} [query] */
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
   * Accepts text or a structured native clipboard payload during continuous monitoring.
   * @param {unknown} input
   * @param {number} [now]
   * @returns {boolean}
   */
  accept(input, now = Date.now()) {
    if (!this.enabled) return false;
    return this._processItem(input, now, false);
  }

  /**
   * Accepts a single explicit clipboard snapshot while monitoring remains OFF.
   * Does not enable continuous monitoring or polling.
   * @param {unknown} input
   * @param {number} [now]
   * @returns {boolean}
   */
  acceptOnce(input, now = Date.now()) {
    return this._processItem(input, now, true);
  }

  /**
   * Internal processor for continuous monitoring and one-shot snapshot capture.
   * @private
   * @param {unknown} input
   * @param {number} now
   * @param {boolean} isOnce
   * @returns {boolean}
   */
  _processItem(input, now, isOnce) {
    if (input === null || input === undefined) return false;

    // Handle legacy/plain text string input
    if (typeof input === 'string') {
      const text = input.trim();
      if (!text || text.length > this.maxLength || looksSensitive(text)) return false;

      const hash = 'text:' + text;
      if (!isOnce) {
        if (this.last === null) {
          this.last = text;
          return false;
        }
        if (this.last === text) return false;
      } else {
        if (this.last === text && this.items.length > 0 && this.items[0].hash === hash) {
          return false;
        }
      }
      this.last = text;

      const sizeBytes = text.length;
      if (sizeBytes > MAX_TOTAL_BYTES) return false;

      this.items = this.items.filter(item => item.text !== text);
      this.items.unshift({
        id: this.nextId++,
        type: 'text',
        text,
        hash,
        pinned: false,
        sizeBytes,
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

      if (!isOnce) {
        if (this.last === null) {
          this.last = hash;
          return false;
        }
        if (this.last === hash) return false;
      } else {
        if (this.last === hash && this.items.length > 0 && this.items[0].hash === hash) {
          return false;
        }
      }

      const itemType = payload.itemType || payload.type || 'text';
      const text = (payload.text || '').trim();

      // Check text constraints if text item
      if (itemType === 'text') {
        if (!text || text.length > this.maxLength || looksSensitive(text)) return false;
      }

      // Check image size constraints (max 20 MiB)
      let sizeBytes = payload.sizeBytes || text.length;
      if (itemType === 'image') {
        if (payload.dataUrl && !payload.sizeBytes) {
          sizeBytes = payload.dataUrl.length;
        }
        if (sizeBytes > MAX_IMAGE_BYTES) return false;
      }

      // Check file list constraints (max 32 paths, each max 1024 chars)
      if (itemType === 'files') {
        const paths = Array.isArray(payload.filePaths) ? payload.filePaths : [];
        if (paths.length === 0 || paths.length > MAX_FILE_PATHS) return false;
        if (paths.some((/** @type {any} */ p) => typeof p !== 'string' || p.length > MAX_PATH_LENGTH)) return false;
        if (!sizeBytes) {
          sizeBytes = paths.reduce((/** @type {number} */ acc, /** @type {any} */ p) => acc + (typeof p === 'string' ? p.length : 0), 0);
        }
      }

      if (sizeBytes > MAX_TOTAL_BYTES) return false;

      this.last = hash;
      this.items = this.items.filter(item => item.hash !== hash && item.text !== text);
      this.items.unshift({
        id: this.nextId++,
        type: itemType,
        text: text || (itemType === 'image' ? 'Image' : 'File list'),
        dataUrl: payload.dataUrl,
        filePaths: payload.filePaths,
        hash,
        pinned: false,
        sizeBytes,
        at: Number.isFinite(now) ? now : Date.now(),
      });
      this._trim();
      return true;
    }

    return false;
  }

  _trim() {
    // 1. Trim by maxItems keeping pinned items
    if (this.items.length > this.maxItems) {
      const pinned = this.items.filter(i => i.pinned);
      const unpinned = this.items.filter(i => !i.pinned);
      const allowedUnpinned = Math.max(0, this.maxItems - pinned.length);
      this.items = [...pinned, ...unpinned.slice(0, allowedUnpinned)];
    }

    // 2. Enforce 64 MiB total memory budget by trimming unpinned items from oldest to newest
    let totalBytes = this.items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      for (let i = this.items.length - 1; i >= 0 && totalBytes > MAX_TOTAL_BYTES; i--) {
        if (!this.items[i].pinned) {
          totalBytes -= (this.items[i].sizeBytes || 0);
          this.items.splice(i, 1);
        }
      }
    }

    // Sort: pinned first, then newest first
    this.items.sort((a, b) => {
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
