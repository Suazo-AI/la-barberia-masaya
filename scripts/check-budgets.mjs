import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const gzip = async (name) => gzipSync(await readFile(`dist/${name}`), { level: 9 }).length;
const markup = (await gzip('index.html')) + (await gzip('styles.css'));
const fonts = (await readdir('dist/assets/fonts')).filter((name) => /\.(woff2|ttf)$/.test(name));
const fontBytes = (await Promise.all(fonts.map((name) => gzip(`assets/fonts/${name}`)))).reduce(
  (a, b) => a + b,
  0,
);
const largestImage = await gzip('assets/images/interior-1672.webp');
const galleryImage = await gzip('assets/images/local-overview-1000.webp');
const total = markup + fontBytes + largestImage + galleryImage + (await gzip('favicon.svg'));
const report = {
  method:
    'Node gzipSync level 9; largest hero image + largest additional gallery view + all fonts + HTML/CSS/favicon; repeated crops reuse cached images',
  node: process.version,
  markupGzipBytes: markup,
  fontGzipBytes: fontBytes,
  largestImageGzipBytes: largestImage,
  galleryImageGzipBytes: galleryImage,
  initialAssetGzipBytes: total,
  markupBudget: 75 * 1024,
  initialBudget: 400 * 1024,
  applicationJsBytes: 0,
};
await mkdir('.private-evidence', { recursive: true });
await writeFile('.private-evidence/budgets.json', JSON.stringify(report, null, 2));
console.log(report);
if (markup > report.markupBudget || total > report.initialBudget) process.exitCode = 1;
