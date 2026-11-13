import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const harnessDir = path.join(root, 'tests/harness');

const vendor: Record<string, string> = {
  '/vendor/vue.min.js': path.join(root, 'node_modules/vue2/dist/vue.min.js'),
  '/vendor/vue-multiselect.min.js': path.join(
    root,
    'node_modules/vue-multiselect-v2/dist/vue-multiselect.min.js',
  ),
  '/vendor/vue-multiselect.min.css': path.join(
    root,
    'node_modules/vue-multiselect-v2/dist/vue-multiselect.min.css',
  ),
};

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

let server: Server | undefined;
export let baseURL = '';

function resolveFile(pathname: string): string | null {
  if (vendor[pathname]) return vendor[pathname];
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(harnessDir, path.normalize(rel));
  return file.startsWith(harnessDir + path.sep) ? file : null;
}

export async function start(port = 0): Promise<string> {
  const s = createServer(async (req, res) => {
    const file = resolveFile(new URL(req.url ?? '/', 'http://localhost').pathname);
    try {
      if (!file) throw new Error('forbidden');
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': types[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  server = s;
  await new Promise<void>((resolve) => s.listen(port, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  return baseURL;
}

export async function stop(): Promise<void> {
  const s = server;
  server = undefined;
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
}

if (import.meta.filename === process.argv[1]) {
  start(Number(process.env.PORT ?? 0)).then((url) => console.log(`Harness em ${url}`));
}
