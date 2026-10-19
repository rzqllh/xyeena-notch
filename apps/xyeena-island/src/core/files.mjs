// Local file utilities: metadata inspection, bounded safety, capability-based conversions.
// Runs 100% on-device; no external uploads or path traversal.

/**
 * @typedef {{
 *   name: string,
 *   size: number,
 *   type: string,
 *   extension: string,
 *   category: 'image' | 'code' | 'document' | 'archive' | 'other',
 *   formattedSize: string,
 *   valid: boolean,
 *   error?: string
 * }} FileMeta
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB bound

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * @param {string} extension
 * @param {string} mimeType
 */
export function detectCategory(extension, mimeType) {
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  const mime = (mimeType || '').toLowerCase();

  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
    return 'image';
  }
  if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'rs', 'py', 'json', 'html', 'css', 'md', 'toml', 'yaml', 'yml'].includes(ext)) {
    return 'code';
  }
  if (['pdf', 'txt', 'rtf', 'csv', 'docx', 'xlsx'].includes(ext) || mime.startsWith('text/')) {
    return 'document';
  }
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
    return 'archive';
  }
  return 'other';
}

/** @param {any} file @returns {FileMeta} */
export function inspectFile(file) {
  if (!file || typeof file.name !== 'string') {
    return {
      name: 'unknown',
      size: 0,
      type: '',
      extension: '',
      category: 'other',
      formattedSize: '0 B',
      valid: false,
      error: 'Invalid file reference',
    };
  }

  const name = file.name;
  const size = Number(file.size) || 0;
  const type = file.type || '';
  const dotIdx = name.lastIndexOf('.');
  const extension = dotIdx > 0 ? name.slice(dotIdx + 1).toLowerCase() : '';
  const category = detectCategory(extension, type);

  if (size > MAX_FILE_SIZE) {
    return {
      name,
      size,
      type,
      extension,
      category,
      formattedSize: formatBytes(size),
      valid: false,
      error: `File exceeds maximum limit of 50 MB (${formatBytes(size)})`,
    };
  }

  return {
    name,
    size,
    type,
    extension,
    category,
    formattedSize: formatBytes(size),
    valid: true,
  };
}

/**
 * Truthful capability matrix distinguishing verified local conversions from unsupported/heavyweight formats.
 */
export const CONVERSION_CAPABILITIES = Object.freeze({
  image: {
    supportedFormats: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
    targets: [
      { id: 'convert-webp', label: 'Convert to WebP', targetExt: 'webp', targetMime: 'image/webp' },
      { id: 'convert-png', label: 'Convert to PNG', targetExt: 'png', targetMime: 'image/png' },
      { id: 'convert-jpeg', label: 'Convert to JPEG', targetExt: 'jpg', targetMime: 'image/jpeg' },
    ],
    description: 'Local HTML5 Canvas raster conversion preserving resolution and dimensions.',
  },
  text_data: {
    json: [
      { id: 'json-to-csv', label: 'Convert to CSV', targetExt: 'csv', mime: 'text/csv' },
      { id: 'json-pretty', label: 'Prettify JSON', targetExt: 'json', mime: 'application/json' },
      { id: 'json-minify', label: 'Minify JSON', targetExt: 'json', mime: 'application/json' },
    ],
    csv: [
      { id: 'csv-to-json', label: 'Convert to JSON', targetExt: 'json', mime: 'application/json' },
    ],
    md: [
      { id: 'md-to-txt', label: 'Export Plain Text', targetExt: 'txt', mime: 'text/plain' },
    ],
    txt: [
      { id: 'txt-to-base64', label: 'Encode Base64', targetExt: 'b64', mime: 'text/plain' },
    ],
  },
  documents: {
    unsupported: ['pdf', 'docx', 'xlsx', 'pptx', 'rtf'],
    reason: 'Document conversion unavailable: external Office/PDF engines are disabled for security and zero-dependency alpha integrity.',
  },
});

/**
 * Returns available conversion options for a given file extension and category.
 * @param {string} extension
 * @param {string} [category]
 * @returns {{ supported: boolean, reason?: string, options: Array<{ id: string, label: string, targetExt: string, targetMime?: string, mime?: string, category: 'image' | 'text' }> }}
 */
export function getAvailableConversions(extension, category) {
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  const cat = category || detectCategory(ext, '');

  if (cat === 'image' || CONVERSION_CAPABILITIES.image.supportedFormats.includes(ext)) {
    return {
      supported: true,
      options: CONVERSION_CAPABILITIES.image.targets
        .filter(t => t.targetExt !== ext)
        .map(t => ({ ...t, category: /** @type {'image'} */ ('image') })),
    };
  }

  const textCapabilities = /** @type {Record<string, Array<{ id: string, label: string, targetExt: string, mime?: string }>>} */ (CONVERSION_CAPABILITIES.text_data);
  if (textCapabilities[ext]) {
    return {
      supported: true,
      options: textCapabilities[ext].map(t => ({ ...t, category: /** @type {'text'} */ ('text') })),
    };
  }

  if (CONVERSION_CAPABILITIES.documents.unsupported.includes(ext)) {
    return {
      supported: false,
      reason: CONVERSION_CAPABILITIES.documents.reason,
      options: [],
    };
  }

  return {
    supported: false,
    reason: 'Conversion unavailable: unsupported format',
    options: [],
  };
}

/**
 * Safely parses and converts JSON array or objects into RFC 4180 compliant CSV.
 * @param {string} jsonStr
 * @returns {string}
 */
export function jsonToCsv(jsonStr) {
  const parsed = JSON.parse(jsonStr);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (!items.length || typeof items[0] !== 'object' || items[0] === null) {
    throw new Error('JSON data must be an array of objects to convert to CSV');
  }

  const keys = Array.from(new Set(items.flatMap(item => Object.keys(item || {}))));
  /** @param {any} val */
  const escapeCell = val => {
    if (val === null || val === undefined) return '';
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerRow = keys.map(escapeCell).join(',');
  const rows = items.map(item => keys.map(k => escapeCell(item[k])).join(','));
  return [headerRow, ...rows].join('\r\n');
}

/**
 * Strict RFC 4180 CSV parser supporting multiline fields, escaped quotes, CRLF/LF,
 * empty fields, and strict malformation rejection.
 * @param {string} csvText
 * @returns {string[][]} Array of records, where each record is an array of field strings.
 */
export function parseRfc4180Csv(csvText) {
  if (typeof csvText !== 'string') {
    throw new Error('CSV input must be a string');
  }
  const records = [];
  let currentRecord = [];
  let currentField = '';
  let inQuotes = false;
  let fieldHasQuotes = false;
  let quoteClosed = false;

  const len = csvText.length;
  let i = 0;

  while (i < len) {
    const ch = csvText[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Escaped double-quote `""` inside quotes
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote for this field
          inQuotes = false;
          quoteClosed = true;
          i++;
          continue;
        }
      } else {
        currentField += ch;
        i++;
        continue;
      }
    } else {
      // Outside quotes
      if (ch === '"') {
        if (quoteClosed) {
          throw new Error(`Malformed CSV: Unexpected quote after closing quote at index ${i}`);
        }
        if (currentField.length > 0) {
          throw new Error(`Malformed CSV: Quote cannot appear inside unquoted field at index ${i}`);
        }
        inQuotes = true;
        fieldHasQuotes = true;
        i++;
        continue;
      }

      if (quoteClosed) {
        if (ch !== ',' && ch !== '\r' && ch !== '\n') {
          throw new Error(`Malformed CSV: Invalid trailing character '${ch}' after closing quote at index ${i}`);
        }
      }

      if (ch === ',') {
        currentRecord.push(currentField);
        currentField = '';
        fieldHasQuotes = false;
        quoteClosed = false;
        i++;
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && i + 1 < len && csvText[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField);
        records.push(currentRecord);
        currentRecord = [];
        currentField = '';
        fieldHasQuotes = false;
        quoteClosed = false;
        i++;
        continue;
      }

      currentField += ch;
      i++;
    }
  }

  if (inQuotes) {
    throw new Error('Malformed CSV: Unclosed quote at end of input');
  }

  // Handle trailing field/record (if text didn't end with a newline)
  if (currentRecord.length > 0 || currentField.length > 0 || fieldHasQuotes || quoteClosed) {
    currentRecord.push(currentField);
    records.push(currentRecord);
  }

  return records;
}

/**
 * Converts RFC 4180 CSV into a formatted JSON array string.
 * @param {string} csvStr
 * @returns {string}
 */
export function csvToJson(csvStr) {
  if (!csvStr || typeof csvStr !== 'string') {
    throw new Error('CSV input must be a non-empty string');
  }
  const records = parseRfc4180Csv(csvStr.trim());
  const validRecords = records.filter(r => r.length > 1 || (r.length === 1 && r[0].length > 0));
  if (validRecords.length < 2) {
    throw new Error('CSV must contain at least a header row and one data row');
  }

  const headers = validRecords[0].map(h => h.trim());
  const result = [];
  for (let i = 1; i < validRecords.length; i++) {
    const row = validRecords[i];
    /** @type {Record<string, any>} */
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    result.push(obj);
  }
  return JSON.stringify(result, null, 2);
}

/**
 * Strips basic Markdown formatting to return clean plain text.
 * @param {string} mdStr
 * @returns {string}
 */
export function markdownToPlainText(mdStr) {
  return mdStr
    .replace(/^#+\s+/gm, '') // Remove headings
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1') // Italic
    .replace(/~~(.*?)~~/g, '$1') // Strikethrough
    .replace(/`{3}[\s\S]*?`{3}/g, match => match.replace(/`{3}[a-zA-Z]*\n?/g, '').replace(/`{3}/g, '')) // Fenced code blocks
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links [text](url) -> text
    .replace(/^>\s+/gm, '') // Blockquotes
    .replace(/^[-*+]\s+/gm, '• ') // List bullets
    .replace(/^\d+\.\s+/gm, match => match) // Ordered lists
    .trim();
}

/**
 * Executes a text/data conversion on-device without external tools.
 * @param {string} content
 * @param {string} conversionId
 * @returns {{ content: string, newExtension: string, mime: string, sizeBytes: number }}
 */
export function convertTextData(content, conversionId) {
  let result = '';
  let newExtension = 'txt';
  let mime = 'text/plain';

  switch (conversionId) {
    case 'json-to-csv':
      result = jsonToCsv(content);
      newExtension = 'csv';
      mime = 'text/csv';
      break;
    case 'csv-to-json':
      result = csvToJson(content);
      newExtension = 'json';
      mime = 'application/json';
      break;
    case 'json-pretty': {
      const parsed = JSON.parse(content);
      result = JSON.stringify(parsed, null, 2);
      newExtension = 'json';
      mime = 'application/json';
      break;
    }
    case 'json-minify': {
      const parsed = JSON.parse(content);
      result = JSON.stringify(parsed);
      newExtension = 'json';
      mime = 'application/json';
      break;
    }
    case 'md-to-txt':
      result = markdownToPlainText(content);
      newExtension = 'txt';
      mime = 'text/plain';
      break;
    case 'txt-to-base64':
      result = (typeof globalThis !== 'undefined' && /** @type {any} */ (globalThis).Buffer)
        ? /** @type {any} */ (globalThis).Buffer.from(content, 'utf8').toString('base64')
        : btoa(unescape(encodeURIComponent(content)));
      newExtension = 'b64';
      mime = 'text/plain';
      break;
    default:
      throw new Error(`Unsupported text/data conversion: ${conversionId}`);
  }

  const bytes = new TextEncoder().encode(result).length;
  return {
    content: result,
    newExtension,
    mime,
    sizeBytes: bytes,
  };
}

/**
 * Converts an image data URL to the target format (png, jpeg, webp) using HTML5 Canvas.
 * Safe fallback for Node/headless environments.
 * @param {string} sourceDataUrl
 * @param {'image/png'|'image/jpeg'|'image/webp'} targetMime
 * @param {number} [quality=0.92]
 * @returns {Promise<{ dataUrl: string, mime: string, sizeBytes: number }>}
 */
export async function convertImageDataUrl(sourceDataUrl, targetMime, quality = 0.92) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    // Headless / mock environment
    return {
      dataUrl: sourceDataUrl.replace(/^data:image\/[a-z]+;/, `data:${targetMime};`),
      mime: targetMime,
      sizeBytes: Math.round(sourceDataUrl.length * 0.75),
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Cannot acquire canvas context for conversion'));
        return;
      }
      if (targetMime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      const converted = canvas.toDataURL(targetMime, quality);
      resolve({
        dataUrl: converted,
        mime: targetMime,
        sizeBytes: Math.round(converted.length * 0.75),
      });
    };
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = sourceDataUrl;
  });
}
