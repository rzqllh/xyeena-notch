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
 assert.equal(h.accept('-----BEGIN RSA PRIVATE KEY-----'),false);
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
