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
  assert.doesNotMatch(html, /<iframe|<form|wa\.me|whatsapp|Reservar|Reservar/i);
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.equal((html.match(/href="https?:\/\//g) || []).length, 6);
  assert.equal(html.includes('http-equiv="refresh"'), false);
});
test('all output image bytes exactly match optimized inputs, with no concept or source screenshots', async () => {
  const files = await readdir('dist/assets/images');
  assert.deepEqual(files.sort(), [
    'barber-at-work-2026-09-17.jpg',
    'cut-rear-view-2026-09-05.jpg',
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
  assert.match(html, /id="space-heading" tabindex="-1">EL LOCAL<\/h2>/);
  assert.equal((html.match(/class="space-tile /g) || []).length, 4);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 6);
  assert.doesNotMatch(html, /TRABAJOS|CLIENTES|nuestros cortes|nuestros resultados/);
});

test('progressive motion ships only one local script and retained upstream notice', async () => {
  assert.equal((html.match(/<script /g) || []).length, 1);
  assert.match(html, /<script src=".\/motion.js" type="module"><\/script>/);
  assert.match(
    await readFile('dist/THIRD-PARTY-NOTICES.txt', 'utf8'),
    /Copyright - 2026 BHARGAVPATEL1244/,
  );
  assert.match(await readFile('dist/styles.css', 'utf8'), /prefers-reduced-motion: no-preference/);
});

test('Obsidian atlas flips within each tile so photo labels retain their source identity', async () => {
  const source = await readFile('dist/art-gallery.js', 'utf8');
  assert.match(source, /atlasPos \+ vec2\(imageUV.x, 1.0 - imageUV.y\)/);
  assert.doesNotMatch(source, /atlasUV.y = 1.0 - atlasUV.y/);
});

test('visit facts retain exact place identity, weekly hours and dated source', () => {
  assert.match(html, /query_place_id=ChIJ5VCti5kHdI8RfdKEhOxWcr4/);
  assert.match(html, /Supermercado Pali, 4 cuadras al oeste/);
  assert.match(html, /datetime="2026-10-03"/);
  assert.match(html, /Puede variar en días festivos/);
  assert.equal((html.match(/<dt>/g) || []).length, 7);
  assert.doesNotMatch(html, /abierto ahora|horario confirmado/i);
  assert.match(html, /data-content-status="ready"/);
});

test('authentic content has two original photos and exactly three short attributed reviews', () => {
  assert.equal((html.match(/data-gallery-item/g) || []).length, 5);
  assert.equal((html.match(/<blockquote>/g) || []).length, 3);
  assert.match(html, /4.2/);
  assert.match(html, /10 reseñas/);
  assert.match(html, /cortes en proceso/);
  assert.match(html, /no\s+representan todas/);
  assert.match(html, /Jonatham Gabriel Suazo Martinez/);
  assert.match(html, /MUNDO DARYL DEL MÁS ALLA/);
  assert.match(html, /Moises Diaz/);
  const words = [...html.matchAll(/<blockquote>\s*<p>(.*?)<\/p>/gs)].flatMap((match) =>
    match[1].trim().split(/\s+/),
  );
  assert.ok(words.length <= 25);
});
