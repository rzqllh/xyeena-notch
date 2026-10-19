import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectFile,
  detectCategory,
  formatBytes,
  convertImageDataUrl,
  MAX_FILE_SIZE,
  getAvailableConversions,
  convertTextData,
  jsonToCsv,
  csvToJson,
  markdownToPlainText
} from '../src/core/files.mjs';

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

test('getAvailableConversions accurately returns truthful options per matrix', () => {
  // Image: png offers webp and jpeg (excluding self)
  const pngAvail = getAvailableConversions('png', 'image');
  assert.equal(pngAvail.supported, true);
  const pngTargetExts = pngAvail.options.map(o => o.targetExt);
  assert.ok(pngTargetExts.includes('webp'));
  assert.ok(pngTargetExts.includes('jpg'));
  assert.ok(!pngTargetExts.includes('png'));

  // Text/Data: json offers csv, prettify, minify
  const jsonAvail = getAvailableConversions('json');
  assert.equal(jsonAvail.supported, true);
  assert.equal(jsonAvail.options.length, 3);
  assert.equal(jsonAvail.options[0].id, 'json-to-csv');

  // Text/Data: csv offers json
  const csvAvail = getAvailableConversions('csv');
  assert.equal(csvAvail.supported, true);
  assert.equal(csvAvail.options[0].id, 'csv-to-json');

  // Markdown offers plain text
  const mdAvail = getAvailableConversions('md');
  assert.equal(mdAvail.supported, true);
  assert.equal(mdAvail.options[0].id, 'md-to-txt');

  // Documents (PDF, DOCX) fail closed with explicit reason (no fake success)
  const pdfAvail = getAvailableConversions('pdf');
  assert.equal(pdfAvail.supported, false);
  assert.match(pdfAvail.reason, /Document conversion unavailable/);

  const docxAvail = getAvailableConversions('docx');
  assert.equal(docxAvail.supported, false);
  assert.match(docxAvail.reason, /Document conversion unavailable/);
});

test('jsonToCsv and csvToJson roundtrip structured data losslessly', () => {
  const original = [
    { name: 'Xyn', role: 'Guardian', power: 'Shield' },
    { name: 'Xyeena', role: 'Companion', power: 'Clarity, Logic' }
  ];
  const csv = jsonToCsv(JSON.stringify(original));
  assert.ok(csv.includes('name,role,power'));
  assert.ok(csv.includes('"Clarity, Logic"')); // Commas correctly quoted

  const restored = JSON.parse(csvToJson(csv));
  assert.equal(restored.length, 2);
  assert.equal(restored[0].name, 'Xyn');
  assert.equal(restored[1].power, 'Clarity, Logic');
});

test('markdownToPlainText strips markdown syntax cleanly', () => {
  const md = `# Title
This is **bold** and *italic* text.
- Bullet 1
- Bullet 2
[Link label](https://example.com)
\`inline code\`
> A quotation`;

  const plain = markdownToPlainText(md);
  assert.ok(!plain.includes('#'));
  assert.ok(!plain.includes('**'));
  assert.ok(!plain.includes('`'));
  assert.ok(plain.includes('This is bold and italic text.'));
  assert.ok(plain.includes('• Bullet 1'));
  assert.ok(plain.includes('Link label'));
});

test('convertTextData executes verified transforms and returns safe metadata', () => {
  const jsonRaw = '{"a":1,"b":2}';
  const pretty = convertTextData(jsonRaw, 'json-pretty');
  assert.equal(pretty.newExtension, 'json');
  assert.equal(pretty.content, '{\n  "a": 1,\n  "b": 2\n}');

  const b64 = convertTextData('Hello Xyeena', 'txt-to-base64');
  assert.equal(b64.newExtension, 'b64');
  assert.equal(b64.content, 'SGVsbG8gWHllZW5h');
});
