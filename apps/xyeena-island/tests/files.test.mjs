import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFile, detectCategory, formatBytes, convertImageDataUrl, MAX_FILE_SIZE} from '../src/core/files.mjs';

test('formatBytes accurately formats byte orders', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(1073741824), '1.0 GB');
});

test('detectCategory resolves categories for extensions and mime types', () => {
  assert.equal(detectCategory('png', ''), 'image');
  assert.equal(detectCategory('', 'image/webp'), 'image');
  assert.equal(detectCategory('rs', 'text/x-rust'), 'code');
  assert.equal(detectCategory('pdf', 'application/pdf'), 'document');
  assert.equal(detectCategory('zip', 'application/zip'), 'archive');
  assert.equal(detectCategory('bin', 'application/octet-stream'), 'other');
});

test('inspectFile validates bounded sizes and identifies metadata', () => {
  const good = inspectFile({ name: 'snapshot.png', size: 1024 * 1024 * 2, type: 'image/png' });
  assert.equal(good.valid, true);
  assert.equal(good.category, 'image');
  assert.equal(good.extension, 'png');
  assert.equal(good.formattedSize, '2.0 MB');

  // Oversized file rejection
  const huge = inspectFile({ name: 'dump.raw', size: MAX_FILE_SIZE + 1, type: '' });
  assert.equal(huge.valid, false);
  assert.match(huge.error, /exceeds maximum limit/);

  // Invalid file
  const invalid = inspectFile(null);
  assert.equal(invalid.valid, false);
});

test('convertImageDataUrl handles conversions and mime switching safely', async () => {
  const dummy = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const result = await convertImageDataUrl(dummy, 'image/jpeg');
  assert.equal(result.mime, 'image/jpeg');
  assert.ok(result.dataUrl.startsWith('data:image/jpeg;'));
  assert.ok(result.sizeBytes > 0);
});
