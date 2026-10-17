import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('DOM markup and accessibility audit across Island template', () => {
  const mainTsPath = resolve(__dirname, '../src/main.ts');
  const mainContent = readFileSync(mainTsPath, 'utf8');

  // Verify all nav tabs have role="tab", aria-selected, and type="button"
  const navTabMatches = [...mainContent.matchAll(/class="nav-tab[^"]*"[^>]*>/g)];
  assert.equal(navTabMatches.length >= 5, true);
  for (const match of navTabMatches) {
    const snippet = match[0];
    assert.equal(snippet.includes('role="tab"'), true, `Nav tab missing role="tab": ${snippet}`);
    assert.equal(snippet.includes('type="button"'), true, `Nav tab missing type="button": ${snippet}`);
    assert.equal(snippet.includes('aria-selected='), true, `Nav tab missing aria-selected: ${snippet}`);
  }

  // Verify all settings pills have type="button" and data-section
  const pillMatches = [...mainContent.matchAll(/class="settings-pill[^"]*"[^>]*>/g)];
  assert.equal(pillMatches.length >= 10, true);
  for (const match of pillMatches) {
    const snippet = match[0];
    assert.equal(snippet.includes('type="button"'), true, `Settings pill missing type="button": ${snippet}`);
    assert.equal(snippet.includes('data-section='), true, `Settings pill missing data-section: ${snippet}`);
  }

  // Verify all checkbox and select inputs have aria-label
  const inputMatches = [...mainContent.matchAll(/<input [^>]*type="checkbox"[^>]*>/g)];
  for (const match of inputMatches) {
    const snippet = match[0];
    assert.equal(snippet.includes('aria-label='), true, `Checkbox missing aria-label: ${snippet}`);
  }

  const selectMatches = [...mainContent.matchAll(/<select [^>]*>/g)];
  for (const match of selectMatches) {
    const snippet = match[0];
    assert.equal(snippet.includes('aria-label='), true, `Select missing aria-label: ${snippet}`);
  }
});

test('CSS accessibility audit: focus-visible and reduced motion tokens', () => {
  const cssPath = resolve(__dirname, '../src/style.css');
  const cssContent = readFileSync(cssPath, 'utf8');

  // Focus visible definition
  assert.equal(cssContent.includes(':focus-visible'), true);
  assert.equal(cssContent.includes('.nav-tab:focus-visible'), true);
  assert.equal(cssContent.includes('.settings-pill:focus-visible'), true);

  // Reduced motion
  assert.equal(cssContent.includes('prefers-reduced-motion: reduce'), true);
  assert.equal(cssContent.includes('[data-motion="reduced"]'), true);

  // High contrast / forced colors
  assert.equal(cssContent.includes('forced-colors: active'), true);

  // High DPI
  assert.equal(cssContent.includes('min-resolution: 120dpi'), true);
});
