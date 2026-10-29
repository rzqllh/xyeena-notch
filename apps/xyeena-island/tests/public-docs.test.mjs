import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function markdownFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith('.md') ? [file] : [];
  });
}

test('public guides link to existing files', () => {
  const files = [path.join(root, 'README.md'), ...markdownFiles(path.join(root, 'docs')),
    ...markdownFiles(path.join(root, 'apps/xyeena-island/docs'))];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').replace(/```[^\n]*\n[\s\S]*?```/g, '');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target))), `${file}: ${target}`);
    }
  }
});

test('release instructions describe the unsigned alpha without copied acceptance receipts', () => {
  const readme = read('README.md');
  assert.match(readme, /Xyeena\.Island_1\.0\.0-alpha\.1_x64-setup\.exe/);
  assert.match(readme, /SHA256SUMS\.txt/);
  assert.match(readme, /alpha/);
  const guide = read('docs/RELEASE_GATES.md');
  assert.match(guide, /unsigned/);
  assert.match(guide, /exact candidate|exact commit/);
  assert.match(guide, /Windows acceptance/);
  assert.doesNotMatch(guide, /\[x\]/);
  for (const file of ['docs/FEATURE-PARITY.md', 'docs/COUCOU-CAPABILITY-AUDIT.md',
    'docs/MASCOT-ASSET-RESEARCH.md', 'apps/xyeena-island/docs/COUCOU-CAPABILITY-AUDIT.md',
    'apps/xyeena-island/docs/MASCOT-ASSET-RESEARCH.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
});
