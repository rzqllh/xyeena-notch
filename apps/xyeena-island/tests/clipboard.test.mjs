import test from 'node:test';
import assert from 'node:assert/strict';
import {ClipboardHistory,looksSensitive} from '../src/core/clipboard.mjs';
test('clipboard history is opt-in and never captures pre-enable content',()=>{
 const h=new ClipboardHistory();assert.equal(h.accept('prior secret'),false);h.enable();
 assert.equal(h.accept('prior secret'),false);assert.equal(h.items.length,0);
 assert.equal(h.accept('work note'),true);assert.equal(h.items[0].text,'work note');
 h.disable();assert.equal(h.accept('ignored'),false);assert.equal(h.items.length,1);
 h.clear();assert.equal(h.items.length,0);
});
test('clipboard bounds, deduplicates, and skips common credentials',()=>{
 const h=new ClipboardHistory();
 assert.equal(h.maxItems, 50); // spec default is 50
 assert.equal(h.setMaxItems(20), true);
 assert.equal(h.maxItems, 20);
 assert.equal(h.setMaxItems(50), true);
 assert.equal(h.setMaxItems(100), true);
 assert.equal(h.setMaxItems(999), false);
 h.setMaxItems(20);

 h.enable();h.accept('baseline');
 for(let n=0;n<32;n++)h.accept('safe text '+n);
 assert.equal(h.items.length,20);assert.equal(h.accept('safe text 31'),false);
 assert.equal(h.accept('password=supersecret'),false);
 assert.equal(h.accept(['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ')),false);
 assert.equal(h.accept('a'.repeat(2049)),false);
 assert.equal(h.items.length,20);
 assert.equal(looksSensitive('api_key: abc'),true);
});

test('clipboard acceptOnce works while monitoring remains OFF and respects dedup and limits', () => {
 const h = new ClipboardHistory();
 assert.equal(h.enabled, false);

 // 1. Text capture via acceptOnce
 assert.equal(h.acceptOnce('snapshot 1'), true);
 assert.equal(h.enabled, false); // monitoring MUST remain off!
 assert.equal(h.items.length, 1);
 assert.equal(h.items[0].text, 'snapshot 1');

 // Deduplication on immediate identical snapshot
 assert.equal(h.acceptOnce('snapshot 1'), false);
 assert.equal(h.items.length, 1);

 // 2. Structured image capture via acceptOnce
 const imgOk = h.acceptOnce({
  type: 'image',
  dataUrl: 'data:image/png;base64,iVBORw0KGgo...',
  hash: 'img:snap1',
  sizeBytes: 5000,
 });
 assert.equal(imgOk, true);
 assert.equal(h.enabled, false);
 assert.equal(h.items[0].type, 'image');

 // 3. Rejects sensitive text even in acceptOnce
 assert.equal(h.acceptOnce('api_key: secret-once'), false);
 assert.equal(h.items.length, 2);
});

test('clipboard enforces 20 MiB image cap, 32 file path cap, and 1024 char path cap', () => {
 const h = new ClipboardHistory();
 h.enable();
 h.accept('baseline');

 // Image under 20 MiB accepted
 assert.equal(h.accept({
  type: 'image',
  dataUrl: 'data:image/png;base64,...',
  hash: 'img:under-20mb',
  sizeBytes: 19 * 1024 * 1024,
 }), true);

 // Image over 20 MiB (20 * 1024 * 1024 + 1 bytes) rejected
 assert.equal(h.accept({
  type: 'image',
  dataUrl: 'data:image/png;base64,...',
  hash: 'img:over-20mb',
  sizeBytes: 20 * 1024 * 1024 + 1,
 }), false);

 // File list with <= 32 paths accepted
 const validPaths = Array.from({ length: 32 }, (_, i) => `C:\\files\\item_${i}.txt`);
 assert.equal(h.accept({
  type: 'files',
  filePaths: validPaths,
  hash: 'files:32-paths',
 }), true);

 // File list with > 32 paths rejected
 const tooManyPaths = Array.from({ length: 33 }, (_, i) => `C:\\files\\item_${i}.txt`);
 assert.equal(h.accept({
  type: 'files',
  filePaths: tooManyPaths,
  hash: 'files:33-paths',
 }), false);

 // Path exceeding 1024 chars rejected
 const longPath = 'C:\\files\\' + 'a'.repeat(1025);
 assert.equal(h.accept({
  type: 'files',
  filePaths: [longPath],
  hash: 'files:long-path',
 }), false);
});

test('clipboard aggregate memory budget (64 MiB) trims oldest unpinned items', () => {
 const h = new ClipboardHistory();
 h.enable();
 h.accept('baseline');

 // Add pinned item (5 MiB)
 h.accept({
  type: 'image',
  hash: 'img:pinned-item',
  sizeBytes: 5 * 1024 * 1024,
 });
 const pinnedId = h.items[0].id;
 h.togglePin(pinnedId);

 // Add unpinned items that approach budget (3 x 18 MiB = 54 MiB)
 h.accept({ type: 'image', hash: 'img:big-1', sizeBytes: 18 * 1024 * 1024 });
 h.accept({ type: 'image', hash: 'img:big-2', sizeBytes: 18 * 1024 * 1024 });
 h.accept({ type: 'image', hash: 'img:big-3', sizeBytes: 18 * 1024 * 1024 });

 // Total is now 5 + 18 + 18 + 18 = 59 MiB (fits in 64 MiB)
 assert.equal(h.items.length, 4);

 // Adding another 18 MiB causes total to be 77 MiB > 64 MiB.
 // It must trim oldest unpinned item (img:big-1), keeping pinned item intact!
 h.accept({ type: 'image', hash: 'img:big-4', sizeBytes: 18 * 1024 * 1024 });

 assert.ok(h.items.some(i => i.id === pinnedId), 'pinned item must be preserved');
 assert.ok(!h.items.some(i => i.hash === 'img:big-1'), 'oldest unpinned item must be trimmed');
 const totalBytes = h.items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
 assert.ok(totalBytes <= 64 * 1024 * 1024, 'total bytes must remain within 64 MiB budget');
});

test('clipboard history preserves items during background polling and only clears on explicit clear', () => {
 const h = new ClipboardHistory();
 h.enable();
 h.accept('baseline prior text');
 h.accept('copied item 1');
 h.accept('copied item 2');
 assert.equal(h.items.length, 2);

 // Re-polling same content does not duplicate or clear
 assert.equal(h.accept('copied item 2'), false);
 assert.equal(h.items.length, 2);

 // Explicit clear wipes memory
 h.clear();
 assert.equal(h.items.length, 0);
});

test('clipboard history handles structured image items, thumbnails, and file lists', () => {
 const h = new ClipboardHistory();
 h.enable();
 h.accept({ type: 'text', text: 'initial baseline', hash: 'text:init' });

 // Add image item
 const imgAccepted = h.accept({
  type: 'image',
  text: 'Image (1.2 MB)',
  dataUrl: 'data:image/bmp;base64,Qk0...',
  hash: 'img:abcd1234',
  sizeBytes: 1200000,
 });
 assert.equal(imgAccepted, true);
 assert.equal(h.items[0].type, 'image');
 assert.equal(h.items[0].dataUrl, 'data:image/bmp;base64,Qk0...');

 // Add file list item
 const filesAccepted = h.accept({
  type: 'files',
  text: 'C:\\docs\\report.pdf\nC:\\docs\\notes.txt',
  filePaths: ['C:\\docs\\report.pdf', 'C:\\docs\\notes.txt'],
  hash: 'files:xyz987',
  sizeBytes: 2,
 });
 assert.equal(filesAccepted, true);
 assert.equal(h.items[0].type, 'files');
 assert.deepEqual(h.items[0].filePaths, ['C:\\docs\\report.pdf', 'C:\\docs\\notes.txt']);
 assert.equal(h.items.length, 2);
});

test('clipboard pin, delete, search filtering, and clear-unpinned', () => {
 const h = new ClipboardHistory();
 h.enable();
 h.accept('baseline item');
 h.accept('pinned item alpha');
 h.accept('regular item beta');

 // Search
 assert.equal(h.filter('alpha').length, 1);
 assert.equal(h.filter('item').length, 2);
 assert.equal(h.filter('nonexistent').length, 0);

 // Pin
 const alphaId = h.items.find(i => i.text.includes('alpha')).id;
 assert.equal(h.togglePin(alphaId), true);
 assert.equal(h.items.find(i => i.id === alphaId).pinned, true);

 // Clear unpinned only
 h.clear(true);
 assert.equal(h.items.length, 1);
 assert.equal(h.items[0].id, alphaId);

 // Delete single item
 assert.equal(h.deleteItem(alphaId), true);
 assert.equal(h.items.length, 0);
});
