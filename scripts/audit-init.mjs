import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'xyeena-island');
const fail = [];
const j = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const exists = p => fs.existsSync(path.join(root, p));
const rootPkg = j('package.json');
const appPkg = j('apps/xyeena-island/package.json');
const mascotPkg = j('packages/xyeena-mascot/package.json');
const tauri = j('apps/xyeena-island/src-tauri/tauri.conf.json');
const cargo = fs.readFileSync(path.join(app,'src-tauri','Cargo.toml'),'utf8');
if (rootPkg.version !== '1.0.0-alpha.1' || appPkg.version !== rootPkg.version || tauri.version !== rootPkg.version || !cargo.includes('version = "1.0.0-alpha.1"')) fail.push('Alpha package version is inconsistent');
if (appPkg.name !== '@xyeena/island' || mascotPkg.name !== '@xyeena/mascot') fail.push('Canonical workspace identities changed');
if (!rootPkg.private || !appPkg.private || !mascotPkg.private) fail.push('A workspace unexpectedly became npm publishable');
for (const p of ['apps/xyeena-island/src-tauri/tauri.conf.json','apps/xyeena-island/src/main.ts','packages/xyeena-mascot/src/guardian.js','licenses/COUCOU-CODE-MIT.txt']) {
  if (!exists(p) && !(p === 'licenses/COUCOU-CODE-MIT.txt' && exists('apps/xyeena-island/licenses/COUCOU-CODE-MIT.txt'))) fail.push('Missing essential source: '+p);
}
for (const p of ['apps/xyeena-island/package-lock.json','apps/xyeena-island/src/core/agent-events.before-hotfix.mjs.bak','apps/xyeena-island/src-tauri/gen/schemas/desktop-schema.json','apps/xyeena-island/dist/index.html','examples/guardian-playground/src-tauri/tauri.conf.json']) {
 if (exists(p)) fail.push('Unexpected stale artifact or second desktop host: '+p);
}
if (fail.length) { console.error('INIT AUDIT BLOCKED:\n'+fail.map(x=>'- '+x).join('\n'));process.exitCode=1; }
else console.log('PASS: canonical Island + Guardian source, alpha versions, no demo desktop host or stale artifacts. Dependency locks and Windows native gates checked separately.');
