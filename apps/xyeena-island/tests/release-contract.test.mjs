import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const conf=JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
const cargo=fs.readFileSync(path.join(root,'src-tauri/Cargo.toml'),'utf8');
test('all public alpha manifests use a single prerelease version',()=>{
 assert.equal(pkg.version,'1.0.0-alpha.1');
 assert.equal(conf.version,pkg.version);
 assert.match(cargo,/version\s*=\s*"1\.0\.0-alpha\.1"/);
 assert.equal(pkg.private,true);
});
test('release is a GitHub-only prerelease, not npm publish or stable installer',()=>{
 assert.equal(conf.bundle.active,true);
 assert.deepEqual(conf.bundle.targets,['nsis']);
 assert.equal(conf.bundle.windows.nsis.installMode,'currentUser');
 assert.equal(conf.app.windows[0].skipTaskbar,true);
 assert.equal(conf.app.windows[0].alwaysOnTop,true);
});
test('third party source attribution and native branding are present',()=>{
 for(const item of ['THIRD_PARTY_NOTICES.md','licenses/COUCOU-CODE-MIT.txt','src-tauri/icons/icon.ico','src-tauri/icons/tray.png']){
  assert.equal(fs.existsSync(path.join(root,item)),true,item);
 }
});
test('notch-first release has exactly one Island window',()=>{
 assert.deepEqual(conf.app.windows.map(w=>w.label),['main']);
 assert.equal(fs.existsSync(path.join(root,'guardian.html')),false);
 assert.equal(fs.existsSync(path.join(root,'src-tauri/capabilities/guardian.json')),false);
});
