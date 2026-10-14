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
 const h=new ClipboardHistory();h.enable();h.accept('baseline');
 for(let n=0;n<32;n++)h.accept('safe text '+n);
 assert.equal(h.items.length,25);assert.equal(h.accept('safe text 31'),false);
 assert.equal(h.accept('password=supersecret'),false);
 assert.equal(h.accept(['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ')),false);
 assert.equal(h.accept('a'.repeat(2049)),false);
 assert.equal(h.items.length,25);
 assert.equal(looksSensitive('api_key: abc'),true);
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
