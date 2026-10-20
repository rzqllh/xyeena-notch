#!/usr/bin/env node
/**
 * @file scripts/build-ui-esm.mjs
 * Compiles apps/xyeena-island/src/ui TypeScript files to ESM in tests/compiled-ui/
 * for native node:test runner compatibility without third-party runtime loaders.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const uiDir = resolve(rootDir, 'apps/xyeena-island/src/ui');
const outDirs = [
  resolve(rootDir, 'apps/xyeena-island/tests/compiled-ui'),
  resolve(rootDir, 'examples/ui-gallery/vendor-ui')
];

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(walk(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

const tsFiles = walk(uiDir);
let count = 0;

for (const tsFile of tsFiles) {
  const tsCode = readFileSync(tsFile, 'utf8');
  const result = esbuild.transformSync(tsCode, {
    loader: 'ts',
    target: 'es2022',
    format: 'esm'
  });

  const rel = relative(uiDir, tsFile);
  // Rewrite relative imports from .js to .mjs for pure Node resolution
  const mjsCode = result.code.replace(/(from\s+['"]\.[^'"]*?)\.js(['"])/g, '$1.mjs$2');

  for (const outDir of outDirs) {
    const mjsFile = join(outDir, rel.slice(0, -3) + '.mjs');
    mkdirSync(dirname(mjsFile), { recursive: true });
    writeFileSync(mjsFile, mjsCode, 'utf8');
  }
  count++;
}

// Copy styles and component CSS into examples/ui-gallery for standalone preview
const stylesDir = resolve(rootDir, 'apps/xyeena-island/src/styles');
const galleryStylesDir = resolve(rootDir, 'examples/ui-gallery/vendor-styles');
mkdirSync(galleryStylesDir, { recursive: true });
for (const f of readdirSync(stylesDir)) {
  if (f.endsWith('.css')) {
    writeFileSync(join(galleryStylesDir, f), readFileSync(join(stylesDir, f)));
  }
}

const galleryUiDir = resolve(rootDir, 'examples/ui-gallery/vendor-ui');
for (const entry of readdirSync(uiDir)) {
  const full = join(uiDir, entry);
  if (statSync(full).isDirectory()) {
    for (const sub of readdirSync(full)) {
      if (sub.endsWith('.css')) {
        mkdirSync(join(galleryUiDir, entry), { recursive: true });
        writeFileSync(join(galleryUiDir, entry, sub), readFileSync(join(full, sub)));
      }
    }
  } else if (entry.endsWith('.css')) {
    writeFileSync(join(galleryUiDir, entry), readFileSync(full));
  }
}

console.log(`[build-ui-esm] Compiled ${count} UI TypeScript primitives into tests/compiled-ui/ and examples/ui-gallery/vendor-ui/`);
