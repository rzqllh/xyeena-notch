import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XynLionRig, LivingLionRig, XyeenaGuardian } from '../src/index.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const mascotRoot=path.resolve(here,'..');

test('Xyn is an alias of the active Living Lion renderer, not a second renderer',()=>{
  assert.equal(XynLionRig,LivingLionRig);
  assert.equal(typeof XyeenaGuardian.prototype.setGazeFromClient,'function');
  assert.equal(typeof XyeenaGuardian.prototype.setGaze,'function');
  assert.equal(fs.existsSync(path.join(mascotRoot,'src','identity-lion.js')),false);
});

test('Xyn retains stable package and native element IDs',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(mascotRoot,'package.json'),'utf8'));
  assert.equal(pkg.name,'@xyeena/mascot');
  assert.equal(pkg.private,true);
  assert.match(pkg.description,/Xyn/);
  assert.match(fs.readFileSync(path.join(mascotRoot,'src','guardian.js'),'utf8'),/tag='xyeena-guardian'/);
});
