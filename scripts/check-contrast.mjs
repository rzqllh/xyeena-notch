#!/usr/bin/env node

/**
 * @file scripts/check-contrast.mjs
 * Authoritative WCAG contrast ratio verification script for Xyeena Notch tokens.
 * Complies with Phase 2 W1.3 & Gate 5:
 * Computes WCAG 2.1 contrast ratios for all declared text/surface token pairs in dark and light themes.
 */

function parseHex(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }
  throw new Error(`Unsupported hex color: ${hex}`);
}

function sRgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  const r = sRgbToLinear(rgb[0]);
  const g = sRgbToLinear(rgb[1]);
  const b = sRgbToLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(parseHex(hex1));
  const l2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const THEMES = {
  dark: {
    surfaces: {
      '--surface-0': '#0b0e14',
      '--surface-1': '#131720',
      '--surface-2': '#1a202c',
    },
    texts: {
      '--text-1': { hex: '#f0f3f6', minRatio: 7.0, level: 'AAA' },
      '--text-2': { hex: '#9ca6b3', minRatio: 4.5, level: 'AA' },
      '--text-3': { hex: '#808c9c', minRatio: 4.5, level: 'AA' },
      '--accent': { hex: '#89b8ca', minRatio: 4.5, level: 'AA' },
      '--state-ok': { hex: '#7ec89f', minRatio: 4.5, level: 'AA' },
      '--state-warn': { hex: '#dfb351', minRatio: 4.5, level: 'AA' },
      '--state-danger': { hex: '#e26d6d', minRatio: 4.5, level: 'AA' },
    },
    special: [
      { textName: '--accent-text', textHex: '#080e14', surfName: '--accent', surfHex: '#89b8ca', minRatio: 7.0 }
    ]
  },
  light: {
    surfaces: {
      '--surface-0': '#f4f6f8',
      '--surface-1': '#ffffff',
      '--surface-2': '#eef1f5',
    },
    texts: {
      '--text-1': { hex: '#111827', minRatio: 7.0, level: 'AAA' },
      '--text-2': { hex: '#4b5563', minRatio: 4.5, level: 'AA' },
      '--text-3': { hex: '#596372', minRatio: 4.5, level: 'AA' },
      '--accent': { hex: '#2a6880', minRatio: 4.5, level: 'AA' },
      '--state-ok': { hex: '#137242', minRatio: 4.5, level: 'AA' },
      '--state-warn': { hex: '#946300', minRatio: 4.5, level: 'AA' },
      '--state-danger': { hex: '#b91c1c', minRatio: 4.5, level: 'AA' },
    },
    special: [
      { textName: '--accent-text', textHex: '#ffffff', surfName: '--accent', surfHex: '#2a6880', minRatio: 4.5 }
    ]
  }
};

let errors = 0;
let checked = 0;

console.log('=== XYEENA NOTCH WCAG CONTRAST VERIFICATION ===\n');

for (const [themeName, theme] of Object.entries(THEMES)) {
  console.log(`Checking ${themeName.toUpperCase()} theme:`);
  for (const [sName, sHex] of Object.entries(theme.surfaces)) {
    for (const [tName, textSpec] of Object.entries(theme.texts)) {
      const ratio = contrastRatio(textSpec.hex, sHex);
      checked++;
      const passed = ratio >= textSpec.minRatio;
      const statusStr = passed ? 'PASS' : 'FAIL';
      if (!passed) {
        errors++;
        console.error(`  [${statusStr}] ${tName} (${textSpec.hex}) on ${sName} (${sHex}) = ${ratio.toFixed(2)}:1 (Requires ${textSpec.minRatio}:1)`);
      }
    }
  }

  for (const sp of theme.special) {
    const ratio = contrastRatio(sp.textHex, sp.surfHex);
    checked++;
    const passed = ratio >= sp.minRatio;
    const statusStr = passed ? 'PASS' : 'FAIL';
    if (!passed) {
      errors++;
      console.error(`  [${statusStr}] ${sp.textName} (${sp.textHex}) on ${sp.surfName} (${sp.surfHex}) = ${ratio.toFixed(2)}:1 (Requires ${sp.minRatio}:1)`);
    }
  }
  console.log(`  ✓ Checked ${themeName} theme surface/text combinations.`);
}

console.log(`\nVerified ${checked} contrast pairs.`);
if (errors > 0) {
  console.error(`\nFAIL: ${errors} contrast check(s) failed.`);
  process.exit(1);
} else {
  console.log('PASS: All token contrast pairs meet WCAG AA / AAA specifications.\n');
}
