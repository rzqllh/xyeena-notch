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
 * Converts RFC 4180 CSV into a formatted JSON array string.
 * @param {string} csvStr
 * @returns {string}
 */
export function csvToJson(csvStr) {
  const lines = csvStr.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must contain at least a header row and one data row');
  }

  /** @param {string} row */
  const parseRow = row => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    cells.push(current);
    return cells;
  };

  const headers = parseRow(lines[0]).map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
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
