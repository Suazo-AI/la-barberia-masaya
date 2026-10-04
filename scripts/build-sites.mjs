import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

// Preserve the existing static build and its exact approved asset allowlist.
await import('./build.mjs');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};
const assets = {};
for (const entry of await readdir('dist', { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const absolute = resolve(entry.parentPath, entry.name);
  const relative = absolute.slice(resolve('dist').length).replaceAll('\\', '/');
  const type = types[extname(relative)];
  if (!type) throw new Error(`Unexpected public asset: ${relative}`);
  assets[relative] = { type, base64: (await readFile(absolute)).toString('base64') };
}
const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
if (hosting.static || hosting.d1 !== 'DB' || !hosting.project_id)
  throw new Error('Sites agenda build requires the retained project ID and logical DB binding.');
const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
if (!journal.entries?.length) throw new Error('D1 migrations are required.');
const result = await build({
  stdin: {
    contents: `import { createSitesAgendaWorker } from './agenda/adapters/sites.ts';\nexport default createSitesAgendaWorker(${JSON.stringify(assets)});\n`,
    resolveDir: process.cwd(),
    sourcefile: 'sites-entry.generated.js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  sourcemap: false,
  metafile: true,
});
if (result.outputFiles.length !== 1) throw new Error('Expected one self-contained Worker module.');
const worker = result.outputFiles[0].contents;
// Deliberately conservative project budget, not an assertion of Sites account limits.
const compressedBytes = gzipSync(worker).byteLength;
if (compressedBytes > 2 * 1024 * 1024)
  throw new Error('Worker exceeds the 2 MiB project gzip budget.');
for (const input of Object.keys(result.metafile.inputs))
  if (/fixtures|local-server|node-server|adapters\/sqlite|backup-cli/.test(input))
    throw new Error(`Non-hosted source entered the Worker: ${input}`);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', worker);
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });
console.log(
  `Built source-only Sites candidate: ${Object.keys(assets).length} exact public assets; ${worker.byteLength} Worker bytes, ${compressedBytes} gzip bytes. No deployment performed.`,
);
