#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const roots=process.argv.slice(2); if(!roots.length){console.error('usage: node interface-static-audit.mjs <file-or-dir>...');process.exit(2)}
const exts=new Set(['.html','.css','.tsx','.jsx','.vue','.svelte','.js','.ts']); const files=[];
function walk(p){if(!fs.existsSync(p))return;const st=fs.statSync(p);if(st.isDirectory())for(const e of fs.readdirSync(p))walk(path.join(p,e));else if(exts.has(path.extname(p)))files.push(p)}; roots.forEach(walk);
const checks=[['placeholder metrics',/(10k\+|99\.99%|trusted by thousands|thousands of users)/i],['generic CTA',/>\s*(get started|learn more|try now|discover|explore)\s*</i],['obvious fake terminal',/(fake terminal|terminal-window|typing-effect)/i],['excessive pill hint',/(rounded-full|border-radius:\s*9999)/i]];
let n=0; for(const f of files){const s=fs.readFileSync(f,'utf8');for(const [name,re] of checks)if(re.test(s)){console.log(`${f}: ${name}`);n++}} console.log(JSON.stringify({files:files.length,heuristicFindings:n},null,2));
