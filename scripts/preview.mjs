import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(
      root,
      `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`,
    );
    if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const headers = {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
    };
    try {
      const file = await readFile(filename);
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch {
      res.writeHead(404, { ...headers, 'Content-Type': types['.html'] });
      res.end(await readFile(path.join(root, '404.html')));
    }
  } catch {
    res.writeHead(400);
    res.end('Bad request');
  }
});
server.listen(port, host, () => console.log(`Private local preview: http://${host}:${port}`));
