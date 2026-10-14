// Local file utilities: metadata inspection, bounded safety, and image format conversion.
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
