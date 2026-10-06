import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const media = resolve(process.env.HERO_ASSET_DIR || 'src/assets/images');
const requiredImages = [
  'barber-at-work-2026-09-17.jpg',
  'finished-fade-highlight-2026-10-06.jpg',
  'jonatan-at-work-2026-09-16.jpg',
  'cut-rear-view-2026-09-05.jpg',
  ...[720, 1200, 1672].map((width) => `interior-${width}.webp`),
  ...[720, 1000].map((width) => `local-overview-${width}.webp`),
];
// Fail before replacing the current build. Never silently replace the approved scene.
for (const name of requiredImages) {
  await readFile(resolve(media, name)).catch(() => {
    throw new Error(
      `Missing approved media ${name}. Set HERO_ASSET_DIR to the approved asset directory. See README.`,
    );
  });
}
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets/images', { recursive: true });
for (const name of [
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
]) {
  await cp(`src/${name}`, `dist/${name}`);
}
await cp('src/assets/fonts', 'dist/assets/fonts', { recursive: true });
for (const name of requiredImages) await cp(resolve(media, name), `dist/assets/images/${name}`);
await writeFile('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
console.log('Built static review site in dist. No website deployment performed.');
