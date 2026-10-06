import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const html = await readFile('dist/index.html', 'utf8');

test('semantic Spanish page and selected copy', () => {
  assert.match(html, /<html lang="es">/);
  for (const tag of ['main', 'footer', 'h1'])
    assert.equal((html.match(new RegExp(`<${tag}(?: |>)`, 'g')) || []).length, 1);
  for (const copy of [
    'TU ESTILO.',
    'BIEN HECHO.',
    'Un espacio para tu próximo corte.',
    'Reservar cita',
  ])
    assert.equal(html.split('<body>')[1].split(copy).length - 1, 1);
  assert.equal((html.match(/href="tel:/g) || []).length, 1);
  assert.doesNotMatch(html, /<header|class="masthead"/);
  assert.match(html, /href="tel:\+50585482197"/);
});
test('preview privacy and no unsupported integrations', () => {
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /<iframe|<form|wa\.me|whatsapp/i);
  assert.match(html, /Agenda pendiente de configuración/);
  assert.match(html, /No se puede crear una cita hasta verificar/);
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.equal((html.match(/href="https?:\/\//g) || []).length, 10);
  assert.equal(html.includes('http-equiv="refresh"'), false);
});
test('static build excludes configuration, fixtures and persistent private data', async () => {
  const entries = await readdir('dist', { recursive: true });
  assert.ok(entries.includes('booking-live.js'));
  assert.ok(entries.includes('admin.html'));
  assert.ok(entries.includes('manage.html'));
  for (const entry of entries)
    assert.doesNotMatch(entry, /fixture|sqlite|backup|\.ts$|agenda\/|booking-model|legacy-booking/);
});
test('all output image bytes exactly match approved inputs, with no concept or private UI screenshots', async () => {
  const files = await readdir('dist/assets/images');
  assert.deepEqual(files.sort(), [
    'barber-at-work-2026-09-17.jpg',
    'cut-rear-view-2026-09-05.jpg',
    'finished-fade-highlight-2026-10-06.jpg',
    'interior-1200.webp',
    'interior-1672.webp',
    'interior-720.webp',
    'jonatan-at-work-2026-09-16.jpg',
    'local-overview-1000.webp',
    'local-overview-720.webp',
  ]);
  const approvedSourceHashes = {
    'finished-fade-highlight-2026-10-06.jpg':
      'b6c8b4f12fc693f2430fedf2eff4c6d18ef197e78d5c86ea739baf0001d1d219',
    'jonatan-at-work-2026-09-16.jpg':
      '203d7fc6a8031c9a97e747d8f216a34fb05c1418bc925a630144de11e83982ed',
  };
  for (const [file, expectedHash] of Object.entries(approvedSourceHashes))
    assert.equal(
      createHash('sha256')
        .update(await readFile(`dist/assets/images/${file}`))
        .digest('hex'),
      expectedHash,
    );
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
  assert.equal((html.match(/loading="lazy"/g) || []).length, 9);
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
  const hours = html.match(/<dl class="hours-list">([\s\S]*?)<\/dl>/)[1];
  assert.equal((hours.match(/<dt>/g) || []).length, 7);
  assert.doesNotMatch(html, /abierto ahora|horario confirmado/i);
  assert.match(html, /data-content-status="ready"/);
});

test('authentic content has one finished cut, one process photo and three attributed reviews', () => {
  assert.equal((html.match(/data-gallery-item/g) || []).length, 5);
  assert.equal((html.match(/<blockquote>/g) || []).length, 3);
  assert.match(html, /4.2/);
  assert.match(html, /10 reseñas/);
  assert.match(html, /CORTE TERMINADO · 01/);
  assert.match(html, /CORTE EN PROCESO · 02/);
  assert.match(html, /data-source-crop="373,90,404,580"/);
  assert.match(html, /no\s+representan todas/);
  assert.match(html, /Jonatham Gabriel Suazo Martinez/);
  assert.match(html, /MUNDO DARYL DEL MÁS ALLA/);
  assert.match(html, /Moises Diaz/);
  const words = [...html.matchAll(/<blockquote>\s*<p>(.*?)<\/p>/gs)].flatMap((match) =>
    match[1].trim().split(/\s+/),
  );
  assert.ok(words.length <= 25);
});

test('team introductions are on demand and separate from booking identities', async () => {
  assert.match(html, /<details class="booking-team" id="booking-team">/);
  assert.match(html, /<strong>Jonatan<\/strong>/);
  assert.match(html, /<strong>Manuel<\/strong>/);
  assert.match(html, /Su nombre aún no está verificado/);
  assert.match(html.replace(/\s+/g, ' '), /Ver un perfil no selecciona un profesional/);
  assert.match(html, /Portafolio de cortes terminados pendiente/);
  assert.doesNotMatch(html, /Diego|Carlos|Luis|manuel_intro_context|jonatan_intro_context/);
  const source = await readFile('dist/booking-live.js', 'utf8');
  assert.match(source, /event.target.matches\('\.team-profile'\)/);
  assert.match(source, /function resetTeam\(/);
});

test('confirmed public services and future policies are readable without activating bookings', () => {
  const section = html.match(/<section class="services-section"[\s\S]*?<\/section>/)[0];
  assert.equal((html.match(/id="servicios"/g) || []).length, 1);
  for (const [id, name, price, minutes] of [
    ['cut', 'Corte', '200', '30'],
    ['beard', 'Barba', '150', '15'],
    ['combo', 'Corte + barba', '300', '45'],
  ]) {
    const row = section.match(new RegExp(`data-offer="${id}"[\\s\\S]*?<\\/div>`))[0];
    assert.ok(row.includes(`<dt>${name}</dt>`));
    assert.ok(row.includes(`C$${price}</span>`));
    assert.ok(row.includes(`${minutes} min</span>`));
  }
  assert.match(section, /duración prevista/);
  assert.match(section, /cuando habilitemos la agenda/);
  assert.match(section, /no se puede\s+reservar\s+desde la web/);
  assert.match(section, /al menos 1 hora[\s\S]*hasta 14 días/);
  assert.match(section, /cancelar o cambiar la cita hasta 1 hora/);
  assert.match(section, /5 minutos después de cada servicio/);
  assert.doesNotMatch(section, /<button|<input|<form|data-booking-open/);
  assert.doesNotMatch(html, /Servicios y profesionales pendientes de configuración/);
});
