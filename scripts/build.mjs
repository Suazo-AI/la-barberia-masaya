import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const media = resolve(process.env.HERO_ASSET_DIR || 'src/assets/images');
const requiredImages = [720, 1200, 1672].map((width) => `interior-${width}.webp`);
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
for (const name of ['index.html', '404.html', 'styles.css', 'favicon.svg']) {
  await cp(`src/${name}`, `dist/${name}`);
}
await cp('src/assets/fonts', 'dist/assets/fonts', { recursive: true });
for (const name of requiredImages) await cp(resolve(media, name), `dist/assets/images/${name}`);
await writeFile('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
console.log('Built static review site in dist. No website deployment performed.');
