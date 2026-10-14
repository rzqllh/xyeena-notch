import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(fileURLToPath(new URL('..',import.meta.url)));


test('web app consumes one canonical mascot package rather than duplicate art',async()=>{
 const js=await readFile(resolve(root,'web/app.js'),'utf8');
 assert.match(js,/from '\/mascot\/index\.js'/);
 assert.match(js,/defineXyeenaGuardian\(\)/);
 assert.match(js,/xyeena:agent/);
 assert.match(js,/xyeena:transfer/);
});
test('Tauri desktop shell is permission-minimal',async()=>{
 const cfg=JSON.parse(await readFile(resolve(root,'../../apps/xyeena-island/src-tauri/tauri.conf.json'),'utf8'));
 assert.equal(cfg.app.windows[0].decorations,false);
 assert.equal(cfg.app.windows[0].transparent,true);
 assert.ok(cfg.app.security.csp.includes("script-src 'self'"));
 const caps=JSON.parse(await readFile(resolve(root,'../../apps/xyeena-island/src-tauri/capabilities/default.json'),'utf8'));
 assert.ok(caps.permissions.includes('core:default'));
});
test('static build is relocatable and includes local source',async()=>{
 const script=await readFile(resolve(root,'scripts/build.mjs'),'utf8');
 assert.match(script,/vendor\/mascot/);
 assert.match(script,/mascot\/index\.js/);
});
