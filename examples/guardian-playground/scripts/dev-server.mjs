import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(app, 'web');
const mascot = resolve(app, '../../packages/xyeena-mascot/src');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const port = Number(process.env.PORT || 4181);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');

const server = createServer(async(req,res)=>{
  try {
    if(req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);res.end();return;}
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const fromMascot = pathname.startsWith('/mascot/');
    const base = fromMascot ? mascot : web;
    const requested = fromMascot ? pathname.slice('/mascot/'.length) : pathname.replace(/^\//,'');
    const filename = resolve(base, requested || 'index.html');
    if (!filename.startsWith(base + sep)) {res.writeHead(403);res.end();return;}
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('not a file');
    const kind = mime[extname(filename)];
    if(!kind) {res.writeHead(403);res.end();return;}
    const body = await readFile(filename);
    res.writeHead(200, {'Content-Type':kind,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Xyeena Island: http://127.0.0.1:${port}`));
