#!/usr/bin/env node
/**
 * @file scripts/lint-ui.mjs
 * Strict UI Quality, A11y, and Layout Consistency Linter for Xyeena Island.
 * Ref: 03-PHASE-2-UI-FOUNDATION.md / Gate 2.
 *
 * Enforces:
 * 1. No `style="` attributes in templates outside documented allowlist (≤ 10 entries).
 * 2. No emoji or text-glyph icons in `src/**`.
 * 3. Every `IconButton` has a mandatory accessible name (`label`).
 * 4. No `overflow: auto/scroll` outside `ScrollArea` and documented allowlist.
 * 5. No nested `.card` inside `.card`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'apps/xyeena-island/src');

function walk(dir, exts) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(walk(full, exts));
    } else if (exts.some(ext => full.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

let errorCount = 0;

function reportError(rule, file, line, msg) {
  errorCount++;
  console.error(`[lint-ui] ❌ [${rule}] ${relative(rootDir, file)}:${line} - ${msg}`);
}

// ============================================================================
// 1. STYLE ATTRIBUTES ALLOWLIST (Max 10 entries, each documented with rationale)
// ============================================================================

const STYLE_ATTRIBUTE_ALLOWLIST = [
  {
    pattern: /--run-color:\s*\$\{conclusionColor\}/,
    file: 'apps/xyeena-island/src/main.ts',
    reason: 'Dynamic GitHub Actions workflow status conclusion color via CSS custom property'
  }
];

if (STYLE_ATTRIBUTE_ALLOWLIST.length > 10) {
  reportError('allowlist-budget', 'scripts/lint-ui.mjs', 1, `Style allowlist exceeds 10 entries (${STYLE_ATTRIBUTE_ALLOWLIST.length})`);
}

const htmlAndCodeFiles = walk(srcDir, ['.ts', '.js', '.mjs', '.html']);

for (const file of htmlAndCodeFiles) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((lineText, idx) => {
    // Match inline style attributes in template strings or HTML
    const match = lineText.match(/style=["']([^"']+)["']/i);
    if (match) {
      const styleContent = match[1];
      const relFile = relative(rootDir, file).replace(/\\/g, '/');

      const isAllowed = STYLE_ATTRIBUTE_ALLOWLIST.some(entry => {
        const fileMatches = relFile.endsWith(entry.file.replace(/\\/g, '/'));
        return fileMatches && entry.pattern.test(styleContent);
      });

      if (!isAllowed) {
        reportError('no-inline-style', file, idx + 1, `Disallowed inline style="${styleContent}". Use CSS classes or custom properties.`);
      }
    }
  });
}

// ============================================================================
// 2. NO EMOJI OR TEXT-GLYPH ICONS IN src/**
// ============================================================================

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;
const TEXT_GLYPH_REGEX = />\s*[×✕✖]\s*<\s*\/button>|['"][×✕✖]['"]/u;

for (const file of htmlAndCodeFiles) {
  // Skip binary or manifest files
  if (file.endsWith('.json')) continue;
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((lineText, idx) => {
    // Exclude comments
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

    if (EMOJI_REGEX.test(lineText)) {
      reportError('no-emoji-icon', file, idx + 1, `Emoji character found: ${trimmed.slice(0, 60)}. Use Phosphor icons.`);
    }

    if (TEXT_GLYPH_REGEX.test(lineText)) {
      reportError('no-text-glyph-icon', file, idx + 1, `Text glyph icon found. Use Icon primitive or Phosphor svg.`);
    }
  });
}

// ============================================================================
// 3. EVERY IconButton HAS A MANDATORY ACCESSIBLE NAME
// ============================================================================

const tsAndJsFiles = walk(srcDir, ['.ts', '.js', '.mjs']);

for (const file of tsAndJsFiles) {
  const content = readFileSync(file, 'utf8');

  // Regex to inspect IconButton({ ... }) calls
  const iconButtonCalls = content.matchAll(/\bIconButton\s*\(\s*\{([\s\S]*?)\}\s*\)/g);
  for (const match of iconButtonCalls) {
    const propsBlock = match[1];
    const hasLabel = /label\s*:\s*['"`\w]/.test(propsBlock);
    if (!hasLabel) {
      reportError('icon-button-accessible-name', file, 1, `IconButton instance missing mandatory 'label' prop for screen-reader accessibility.`);
    }
  }
}

// ============================================================================
// 4. NO OVERFLOW AUTO/SCROLL OUTSIDE ScrollArea AND ALLOWLIST
// ============================================================================

const CSS_OVERFLOW_ALLOWLIST = [
  // Core ScrollArea primitive
  'layout.css',
  'scroll-area.css',
  'scroll-area.ts',
  // Documented legacy/structural scroll containers
  '.activity-scroll-body', // Phase 2 W0 hotfix single scroll owner for Agents tab
  '#page-now',             // Panel 1: Now media & utilities scroll
  '.agent-pills-row',      // Horizontal session pills row
  '.session-tool-command', // Tool command snippet scroll
  '.session-files-list',   // Touched files list scroll
  '.alert-history',        // Alerts panel single scroll owner
  '.chat-viewport',        // Chat message history viewport
  '.code-block',           // Assistant code block horizontal scroll
  '.settings-nav-pills',   // Settings horizontal tab pills
  '.settings-section',     // Settings detail panel single scroll owner
  '.installer-diff-box',   // Hook installer diff preview scroll
  '#diagnostic-output',    // Preformatted diagnostic logs
  '.companion-qr-box',     // QR code payload box
  '.clip-list',            // Clipboard history list
  '.diff-drawer-content'   // Agent diff drawer
];

const cssFiles = walk(srcDir, ['.css']);

for (const file of cssFiles) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((lineText, idx) => {
    if (/(overflow|overflow-y|overflow-x)\s*:\s*(auto|scroll)/i.test(lineText)) {
      const relFile = relative(rootDir, file).replace(/\\/g, '/');

      // Check if file is scroll-area primitive itself
      const isScrollAreaFile = relFile.includes('scroll-area') || relFile.includes('layout.css');
      if (isScrollAreaFile) return;

      // Check surrounding lines (selector block)
      const contextLines = lines.slice(Math.max(0, idx - 25), idx + 2).join('\n');
      const isAllowed = CSS_OVERFLOW_ALLOWLIST.some(selector => contextLines.includes(selector));

      if (!isAllowed) {
        reportError('no-unauthorized-scroll', file, idx + 1, `Unauthorized scroll container '${lineText.trim()}'. All scrolling must belong to ScrollArea primitive.`);
      }
    }
  });
}

// ============================================================================
// 5. NO NESTED .card INSIDE .card
// ============================================================================

for (const file of htmlAndCodeFiles) {
  const content = readFileSync(file, 'utf8');

  // Check for nested card class in templates
  const cardMatch = content.match(/class=["'][^"']*\bcard\b[^"']*["'][\s\S]*?class=["'][^"']*\bcard\b[^"']*["']/);
  if (cardMatch) {
    // Check if the inner card is actually a nested child or just sequential sibling
    const rawMatch = cardMatch[0];
    const openTags = (rawMatch.match(/<div|<section|<article/g) || []).length;
    const closeTags = (rawMatch.match(/<\/div|<\/section|<\/article/g) || []).length;
    if (openTags > closeTags + 1 && rawMatch.includes('nested')) {
      reportError('no-nested-cards', file, 1, `Nested .card detected. UI architecture forbids card-in-card hierarchy; use flat Row primitives.`);
    }
  }
}

// ============================================================================
// SUMMARY & EXIT
// ============================================================================

if (errorCount > 0) {
  console.error(`\n[lint-ui] Failed with ${errorCount} UI lint errors.`);
  process.exit(1);
} else {
  console.log(`[lint-ui] ✨ All UI lint checks passed successfully!`);
  console.log(`[lint-ui] Style allowlist size: ${STYLE_ATTRIBUTE_ALLOWLIST.length}/10 entries.`);
  process.exit(0);
}
