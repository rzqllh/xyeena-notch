import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspaceRoot=path.resolve(root,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('package.json'));
const conf=JSON.parse(read('src-tauri/tauri.conf.json'));
const native=read('src-tauri/Cargo.toml');
const errors=[];
function gate(test,message){if(!test)errors.push(message)}
const expected=pkg.version;
gate(/^1\.0\.0-alpha\.\d+$/.test(expected),'Version must be 1.0.0-alpha.N');
gate(conf.version===expected,'Tauri version differs from npm version');
gate(new RegExp('^version\\s*=\\s*"'+expected.replace(/\./g,'\\.')+'"','m').test(native),'Cargo version differs');
gate(pkg.private===true,'Island must remain private in npm (GitHub artifact only)');
gate(conf.bundle?.active===true&&conf.bundle?.targets?.includes('nsis'),'Windows NSIS bundling is not enabled');
gate(Array.isArray(conf.app?.windows)&&conf.app.windows.length===1&&conf.app.windows[0].label==='main'&&conf.app.windows[0].skipTaskbar&&conf.app.windows[0].transparent&&conf.app.windows[0].alwaysOnTop,'Island window config regression');
for(const needed of ['LICENSE','THIRD_PARTY_NOTICES.md','licenses/COUCOU-CODE-MIT.txt','src-tauri/icons/icon.ico','src-tauri/icons/tray.png','docs/RELEASE_GATES.md']) gate(fs.existsSync(path.join(root,needed)),`Missing ${needed}`);
gate(fs.existsSync(path.join(workspaceRoot,'SECURITY.md')),'Missing root SECURITY.md');
gate(fs.existsSync(path.join(workspaceRoot,'package-lock.json')),'Missing genuine workspace package-lock.json');
gate(fs.existsSync(path.join(root,'src-tauri/Cargo.lock')),'Missing genuine src-tauri/Cargo.lock');
if(fs.existsSync(path.join(workspaceRoot,'package-lock.json'))){try{const lock=JSON.parse(fs.readFileSync(path.join(workspaceRoot,'package-lock.json'),'utf8'));gate(lock.packages?.['apps/xyeena-island']?.version===expected,'npm workspace Island lockfile version mismatch');gate(lock.packages?.['packages/xyeena-mascot']?.name==='@xyeena/mascot','npm mascot package missing from workspace lock')}catch{gate(false,'Invalid workspace npm lockfile')}}
if(fs.existsSync(path.join(root,'src-tauri/Cargo.lock'))){const lock=read('src-tauri/Cargo.lock');gate(lock.includes('name = "xyeena-island"')&&lock.includes(`version = "${expected}"`),'Cargo.lock does not contain Xyeena alpha package')}
for(const illegal of ['node_modules','.env','src-tauri/target','dist','.git','coverage'])if(fs.existsSync(path.join(root,illegal)))console.log(`INFO local ignored directory or file exists: ${illegal} (do not commit it)`);
if(errors.length){console.error('BLOCKED release audit:\n'+errors.map(x=>'- '+x).join('\n'));process.exitCode=1}else console.log(`PASS release audit: ${expected} manifests, licenses, two lockfiles and packaging intent`);
