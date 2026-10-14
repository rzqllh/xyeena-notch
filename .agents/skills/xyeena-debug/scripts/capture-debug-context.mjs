#!/usr/bin/env node
import { spawnSync } from 'node:child_process'; import fs from 'node:fs';
const run=(c,a=[])=>{const r=spawnSync(c,a,{encoding:'utf8'});return {status:r.status,stdout:(r.stdout||'').trim(),stderr:(r.stderr||'').trim()}};
const out={node:process.version,cwd:process.cwd(),gitStatus:run('git',['status','--short']),gitHead:run('git',['rev-parse','HEAD']),packageScripts:null};
if(fs.existsSync('package.json')){try{out.packageScripts=JSON.parse(fs.readFileSync('package.json','utf8')).scripts||{}}catch{}}
console.log(JSON.stringify(out,null,2));
