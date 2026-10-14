import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const root = resolve(app, '../..');
const dist = resolve(app, 'dist');
const mascot = resolve(root, 'packages/xyeena-mascot/src');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(app, 'web'), dist, { recursive: true });
await cp(mascot, resolve(dist, 'vendor/mascot'), { recursive: true });

const path = resolve(dist, 'app.js');
const original = await readFile(path, 'utf8');
const from = '/mascot/index.js';
if (!original.includes(from)) throw new Error('Mascot import entry was not found; refusing an incomplete build');
await writeFile(path, original.replaceAll(from, './vendor/mascot/index.js'));
console.log(`Guardian browser-only preview created in ${dist}`);
