import fs from 'node:fs';

const htmlTemplateMatch = fs.readFileSync('apps/xyeena-island/src/main.ts', 'utf8');
const rootHtmlMatch = htmlTemplateMatch.match(/root\.innerHTML\s*=\s*`([\s\S]*?)`;/);
if (!rootHtmlMatch) {
  console.error('Could not find root.innerHTML');
  process.exit(1);
}
const html = rootHtmlMatch[1];

// Extract all q<...>(...) calls
const qCalls = [...htmlTemplateMatch.matchAll(/q<[^>]+>\((['"])(.*?)\1\)/g)].map(m => m[2]);
const uniqueSelectors = [...new Set(qCalls)];

console.log('Testing ' + uniqueSelectors.length + ' selectors against root.innerHTML:');
const missing = [];
for (const sel of uniqueSelectors) {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    const regex = new RegExp(`id=["']${id}["']`);
    if (!regex.test(html)) {
      missing.push(sel);
    }
  } else if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    const regex = new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`);
    if (!regex.test(html)) {
      missing.push(sel);
    }
  }
}

console.log('MISSING SELECTORS:', missing);
