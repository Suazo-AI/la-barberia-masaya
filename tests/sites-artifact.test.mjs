import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const source = await readFile('dist/server/index.js');
// Data URL import proves there are no unresolved relative imports or Node dependencies.
const worker = (await import(`data:text/javascript;base64,${source.toString('base64')}`)).default;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://artifact.example.test';

test('artifact is a bounded self-contained ESM Worker with fail-closed API', async () => {
  assert.equal(typeof worker.fetch, 'function');
  assert.ok(gzipSync(source).byteLength <= 2 * 1024 * 1024);
  const response = await worker.fetch(new Request(`${origin}/api/agenda/v1/catalog`), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'CONFIGURATION_REQUIRED');
  const output = await readdir('dist', { recursive: true });
  for (const path of output)
    assert.doesNotMatch(path, /fixture|backup|sqlite|config\.example|\.env|\.map$/);
  assert.deepEqual(
    output.filter((path) => !path.startsWith('.openai') && path !== 'server'),
    ['server/index.js'],
  );
});

test('every approved public file is served byte-for-byte including fonts and photographs', async () => {
  const files = [
    'index.html',
    '404.html',
    'styles.css',
    'motion.js',
    'booking-live.js',
    'booking-client.js',
    'manage.html',
    'manage.js',
    'admin.html',
    'admin.css',
    'admin.js',
    'art-gallery.js',
    'THIRD-PARTY-NOTICES.txt',
    'favicon.svg',
  ];
  for (const dir of ['assets/images', 'assets/fonts'])
    for (const name of await readdir(`src/${dir}`)) files.push(`${dir}/${name}`);
  for (const file of files) {
    const response = await worker.fetch(new Request(`${origin}/${file}?asset-check=1`), {});
    assert.equal(response.status, 200, file);
    assert.equal(
      hash(Buffer.from(await response.arrayBuffer())),
      hash(await readFile(`src/${file}`)),
      file,
    );
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff', file);
    const head = await worker.fetch(new Request(`${origin}/${file}`, { method: 'HEAD' }), {});
    assert.equal(head.status, 200, file);
    assert.equal(await head.text(), '', file);
  }
  const index = await worker.fetch(new Request(origin), {});
  assert.equal(
    hash(Buffer.from(await index.arrayBuffer())),
    hash(await readFile('src/index.html')),
  );
  assert.equal(
    await (await worker.fetch(new Request(`${origin}/robots.txt`), {})).text(),
    'User-agent: *\nDisallow: /\n',
  );
});

test('hosting metadata and generated migration tree are copied without mutation or public access', async () => {
  const original = await readFile('.openai/hosting.json');
  assert.equal(hash(original), hash(await readFile('dist/.openai/hosting.json')));
  const manifest = JSON.parse(original);
  assert.equal(manifest.project_id, 'appgprj_6ac0cca2458c8191b4f705b5984168a6');
  assert.equal(manifest.d1, 'DB');
  assert.equal(manifest.static, undefined);
  for (const entry of await readdir('drizzle', { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const sourcePath = `${entry.parentPath}/${entry.name}`;
    const builtPath = `dist/.openai/${sourcePath}`;
    assert.equal(hash(await readFile(sourcePath)), hash(await readFile(builtPath)), sourcePath);
  }
  for (const path of [
    '/server/index.js',
    '/.openai/hosting.json',
    '/drizzle/meta/_journal.json',
    '/.env',
    '/agenda/config.example.json',
  ]) {
    const response = await worker.fetch(new Request(`${origin}${path}`), {});
    assert.equal(response.status, 404, path);
  }
});

test('packaged Sites identity entry is no-store and does not activate the agenda', async () => {
  const response = await worker.fetch(new Request(`${origin}/api/agenda/v1/identity`), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const identity = await response.json();
  assert.equal(identity.authenticated, false);
  assert.equal(identity.subject, undefined);
  assert.equal(identity.signInPath, '/signin-with-chatgpt?return_to=%2Fadmin.html');
  assert.equal(
    (await worker.fetch(new Request(`${origin}/api/agenda/v1/admin/session`), {})).status,
    503,
  );
});
