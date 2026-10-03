import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const html = await readFile('dist/index.html', 'utf8');

test('semantic Spanish page and selected copy', () => {
  assert.match(html, /<html lang="es">/);
  for (const tag of ['header', 'main', 'footer', 'h1'])
    assert.equal((html.match(new RegExp(`<${tag}(?: |>)`, 'g')) || []).length, 1);
  for (const copy of [
    'LA BARBERÍA',
    'MASAYA · CAILAGUA',
    'TU ESTILO.',
    'BIEN HECHO.',
    'Un espacio para tu próximo corte.',
    'Llamar para consultar',
  ])
    assert.equal(html.split('<body>')[1].split(copy).length - 1, 1);
  assert.equal((html.match(/href="tel:/g) || []).length, 1);
  assert.match(html, /href="tel:\+50585482197"/);
});
test('preview privacy and no unsupported integrations', () => {
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /<script|<iframe|<form|wa\.me|whatsapp|Reservar|testimonio|estrellas/i);
  assert.doesNotMatch(html, /(?:href|src)="https?:\/\//);
  assert.equal(html.includes('http-equiv="refresh"'), false);
});
test('all output image bytes exactly match optimized inputs, with no concept or source screenshots', async () => {
  const files = await readdir('dist/assets/images');
  assert.deepEqual(files.sort(), [
    'interior-1200.webp',
    'interior-1672.webp',
    'interior-720.webp',
    'local-overview-1000.webp',
    'local-overview-720.webp',
  ]);
  const dir = process.env.HERO_ASSET_DIR || 'src/assets/images';
  for (const file of files) {
    const hash = (data) => createHash('sha256').update(data).digest('hex');
    assert.equal(
      hash(await readFile(`dist/assets/images/${file}`)),
      hash(await readFile(`${dir}/${file}`)),
    );
  }
});
test('fonts carry redistributable license files', async () => {
  for (const name of ['Anton', 'Barlow', 'Barlow-Condensed'])
    assert.match(
      await readFile(`dist/assets/fonts/OFL-${name}.txt`, 'utf8'),
      /SIL OPEN FONT LICENSE Version 1\.1/,
    );
});

test('approved local gallery uses four interior crops without customer-work claims', () => {
  assert.match(html, /id="space-heading">EL LOCAL<\/h2>/);
  assert.equal((html.match(/class="space-tile /g) || []).length, 4);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 4);
  assert.doesNotMatch(html, /TRABAJOS|CLIENTES|nuestros cortes|nuestros resultados/);
});
