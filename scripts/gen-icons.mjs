#!/usr/bin/env node
/**
 * @file scripts/gen-icons.mjs
 * Extracts SVG path data from @phosphor-icons/core regular assets for manifest icons.
 * Generates apps/xyeena-island/src/ui/icon/registry.generated.ts with IconName union and path registry.
 *
 * Usage:
 *   node scripts/gen-icons.mjs
 *   node scripts/gen-icons.mjs --check
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const manifestPath = resolve(rootDir, 'apps/xyeena-island/src/ui/icons.manifest.json');
const outputPath = resolve(rootDir, 'apps/xyeena-island/src/ui/icon/registry.generated.ts');
const assetsDir = resolve(rootDir, 'node_modules/@phosphor-icons/core/assets/regular');

if (!existsSync(manifestPath)) {
  console.error(`[gen-icons] Manifest not found: ${manifestPath}`);
  process.exit(1);
}

if (!existsSync(assetsDir)) {
  console.error(`[gen-icons] Phosphor assets not found: ${assetsDir}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const iconList = manifest.icons || [];
const aliases = manifest.aliases || {};

const pathMap = {};
let totalExtractedBytes = 0;

for (const name of iconList) {
  const svgPath = resolve(assetsDir, `${name}.svg`);
  if (!existsSync(svgPath)) {
    console.error(`[gen-icons] Icon SVG not found: ${name}.svg at ${svgPath}`);
    process.exit(1);
  }
  const svgContent = readFileSync(svgPath, 'utf8');
  const match = svgContent.match(/<path\s+d="([^"]+)"/);
  if (!match || !match[1]) {
    console.error(`[gen-icons] Failed to extract <path d="..."> from ${name}.svg`);
    process.exit(1);
  }
  const d = match[1];
  pathMap[name] = d;
  totalExtractedBytes += d.length;
}

// Validate aliases
for (const [alias, target] of Object.entries(aliases)) {
  if (!pathMap[target]) {
    console.error(`[gen-icons] Alias "${alias}" points to non-existent icon "${target}"`);
    process.exit(1);
  }
}

const sortedNames = Object.keys(pathMap).sort();
const sortedAliases = Object.keys(aliases).sort();

const code = `/**
 * @file apps/xyeena-island/src/ui/icon/registry.generated.ts
 * AUTOMATICALLY GENERATED FILE - DO NOT EDIT MANUALLY.
 * Source: apps/xyeena-island/src/ui/icons.manifest.json
 * Generator: scripts/gen-icons.mjs
 * Phosphor Icons (regular weight, 256x256 viewBox). MIT License (c) 2021 Phosphor Icons.
 */

export const PHOSPHOR_VIEWBOX = '0 0 256 256';

export const CANONICAL_ICON_NAMES = [
${sortedNames.map(n => `  '${n}',`).join('\n')}
] as const;

export type CanonicalIconName = typeof CANONICAL_ICON_NAMES[number];

export const ICON_ALIASES: Readonly<Record<string, CanonicalIconName>> = {
${sortedAliases.map(a => `  '${a}': '${aliases[a]}',`).join('\n')}
};

export type IconAliasName = keyof typeof ICON_ALIASES;

export type IconName = CanonicalIconName | IconAliasName;

export const ICON_PATHS: Readonly<Record<CanonicalIconName, string>> = {
${sortedNames.map(n => `  '${n}': '${pathMap[n]}',`).join('\n')}
};

export function resolveIconName(name: IconName | string): CanonicalIconName | undefined {
  if (Object.prototype.hasOwnProperty.call(ICON_PATHS, name)) {
    return name as CanonicalIconName;
  }
  if (Object.prototype.hasOwnProperty.call(ICON_ALIASES, name)) {
    return ICON_ALIASES[name as IconAliasName];
  }
  return undefined;
}

export function getIconPath(name: IconName | string): string {
  const canonical = resolveIconName(name);
  if (canonical) {
    return ICON_PATHS[canonical];
  }
  // Fallback to shield-check / logo if available, or empty
  return ICON_PATHS['shield-check'] || '';
}

export function isValidIconName(name: string): name is IconName {
  return resolveIconName(name) !== undefined;
}
`;

const isCheck = process.argv.includes('--check');

if (isCheck) {
  if (!existsSync(outputPath)) {
    console.error(`[gen-icons] Output file does not exist: ${outputPath}`);
    process.exit(1);
  }
  const current = readFileSync(outputPath, 'utf8');
  if (current !== code) {
    console.error(`[gen-icons] Generated icon registry is OUT OF DATE. Run 'node scripts/gen-icons.mjs' to regenerate.`);
    process.exit(1);
  }
  console.log(`[gen-icons] Generated icon registry is up to date (${sortedNames.length} icons, ${sortedAliases.length} aliases).`);
  process.exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, code, 'utf8');

const mjsOutputPath = resolve(rootDir, 'apps/xyeena-island/src/ui/icon/registry.generated.mjs');
// Strip TypeScript type annotations for pure Node ESM import
const mjsCode = code
  .replace(/\s+as\s+const;/g, ';')
  .replace(/export type [^;]+;/g, '')
  .replace(/: Readonly<Record<[^>]+>>/g, '')
  .replace(/: IconName \| string/g, '')
  .replace(/: CanonicalIconName \| undefined/g, '')
  .replace(/: string/g, '')
  .replace(/: name is IconName/g, '')
  .replace(/\s+as\s+CanonicalIconName/g, '')
  .replace(/\s+as\s+IconAliasName/g, '');
writeFileSync(mjsOutputPath, mjsCode, 'utf8');

const outputSize = statSync(outputPath).size;
console.log(`[gen-icons] Generated ${outputPath}`);
console.log(`[gen-icons] Icons bundled: ${sortedNames.length} canonical + ${sortedAliases.length} aliases.`);
console.log(`[gen-icons] Total path payload: ${totalExtractedBytes} bytes (${(totalExtractedBytes / 1024).toFixed(2)} KiB).`);
console.log(`[gen-icons] Registry file size: ${outputSize} bytes (${(outputSize / 1024).toFixed(2)} KiB).`);
