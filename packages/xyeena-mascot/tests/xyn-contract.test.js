import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LivingLionRig, XyeenaGuardian, defineXyeenaGuardian } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '../..');

test('Xyn is a human-facing rename of the original Lion, not a new renderer or API', () => {
  assert.equal(typeof LivingLionRig, 'function');
  assert.equal(typeof XyeenaGuardian.prototype.setGazeFromClient, 'function');
  assert.equal(typeof defineXyeenaGuardian, 'function');

  const guardianSource = fs.readFileSync(path.join(packageRoot, 'src/guardian.js'), 'utf8');
  assert.match(guardianSource, /new LivingLionRig\(/);
  assert.match(guardianSource, /tag='xyeena-guardian'/);
  assert.match(guardianSource, /Xyn — the Lion Guardian:/);

  const indexSource = fs.readFileSync(path.join(packageRoot, 'src/index.js'), 'utf8');
  assert.doesNotMatch(indexSource, /XynLionRig|IdentityLionRig/);
  assert.equal(fs.existsSync(path.join(packageRoot, 'src/identity-lion.js')), false);
});

test('Xyn branding preserves stable package, component and release identifiers', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@xyeena/mascot');
  assert.equal(pkg.private, true);
  assert.equal(root.version, '1.0.0-alpha.1');
  assert.match(pkg.description, /Xyn/);
  const preview = fs.readFileSync(path.join(repoRoot, 'examples/guardian-playground/web/index.html'), 'utf8');
  assert.match(preview, /Xyn, the Xyeena Lion Guardian/);
  assert.match(preview, /<xyeena-guardian/);
});
