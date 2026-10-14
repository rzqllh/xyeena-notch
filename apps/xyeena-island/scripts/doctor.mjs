import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspaceRoot=path.resolve(root,'../..');
const minimum=22;
const nodeMajor=Number(process.versions.node.split('.')[0]);
let failures=0;
if(nodeMajor<minimum){console.error('FAIL: Node 22.14+ required.');failures++;}
else console.log('PASS: Node '+process.versions.node);
for(const [label,program,args] of [['Rust','rustc',['--version']],['Cargo','cargo',['--version']]]) {
  const result=spawnSync(program,args,{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0){console.error('MISSING: '+label+' (install Rust + MSVC build tools for Windows Tauri builds)');failures++;}
  else console.log('PASS: '+label+' '+result.stdout.trim());
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const conf=JSON.parse(fs.readFileSync(path.join(root,'src-tauri','tauri.conf.json'),'utf8'));
if(pkg.version!==conf.version){console.error('FAIL: frontend/desktop version mismatch');failures++;}
else console.log('PASS: package and native version '+pkg.version);
for (const icon of ['icon.ico','tray.png']) {
 const location=path.join(root,'src-tauri','icons',icon);
 if(!fs.existsSync(location)){console.error('MISSING: bundled Windows/tray icon: '+location);failures++;}
 else console.log('PASS: packaged icon '+icon);
}
const declaredClipboard=Boolean(pkg.dependencies?.['@tauri-apps/plugin-clipboard-manager']);
const perms=JSON.parse(fs.readFileSync(path.join(root,'src-tauri','capabilities','default.json'),'utf8'));
if(!declaredClipboard || !perms.permissions.includes('clipboard-manager:allow-read-text') || !perms.permissions.includes('clipboard-manager:allow-write-text')){
 console.error('FAIL: clipboard source and Tauri permissions are not aligned');failures++;
}else console.log('PASS: explicit text-only clipboard permissions');
const native=fs.readFileSync(path.join(root,'src-tauri','Cargo.toml'),'utf8');
const cargoVersion=native.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if(cargoVersion!==pkg.version){console.error('FAIL: Cargo package version does not match JS version');failures++;}
else console.log('PASS: native Cargo version '+cargoVersion);
const windowConfig=conf.app.windows.find(w=>w.label==='main');
if(!native.includes('tray-icon')||!windowConfig?.skipTaskbar||!windowConfig?.alwaysOnTop){
 console.error('FAIL: Windows tray/always-on-top defaults are not configured');failures++;
}else console.log('PASS: tray, skipTaskbar, alwaysOnTop configured');
if(process.platform==='win32'){
 const lookup=path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe');
 if(fs.existsSync(lookup)){
  const res=spawnSync(lookup,['-products','*','-find','VC\\Tools\\MSVC\\**\\bin\\Hostx64\\x64\\link.exe'],{encoding:'utf8',windowsHide:true});
  if(res.status===0&&res.stdout.trim()) console.log('PASS: MSVC x64 linker detected');
  else console.log('INFO: MSVC linker not found by vswhere; native Windows build may fail');
 }
}
console.log('INFO: Windows WebView2 + Visual Studio C++ build tools must be available for native compilation.');
console.log(`INFO: ${conf.bundle?.active?'Unsigned NSIS alpha packaging configured':'NSIS packaging not configured'}; signing and Windows manual acceptance still required.`);
if(!fs.existsSync(path.join(workspaceRoot,'package-lock.json'))) {console.log('BLOCKER: Missing dependency lockfile package-lock.json (release not reproducible yet)');failures++;}
if(!fs.existsSync(path.join(root,'src-tauri','Cargo.lock'))) {console.log('BLOCKER: Missing dependency lockfile src-tauri/Cargo.lock (release not reproducible yet)');failures++;}
process.exitCode=failures?1:0;
