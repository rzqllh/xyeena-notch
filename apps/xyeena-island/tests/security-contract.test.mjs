import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('Tauri IPC manifest exposes only intended desktop and text-clipboard privileges',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'src-tauri/capabilities/default.json'),'utf8'));
  assert.deepEqual(config.windows,['main']);
  assert.deepEqual(config.permissions, [
    'core:default',
    'notification:allow-is-permission-granted',
    'notification:allow-request-permission',
    'notification:allow-notify',
    'clipboard-manager:allow-read-text',
    'clipboard-manager:allow-write-text'
  ]);
});
test('app CSP does not permit remote scripts or unsafe eval',()=>{
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
  const csp=cfg.app.security.csp;
  assert.match(csp,/script-src 'self'/);
  assert.doesNotMatch(csp,/unsafe-eval|https:\/\//);
});
