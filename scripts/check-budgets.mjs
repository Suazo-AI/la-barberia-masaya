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
const applicationJsBytes = (await readFile('dist/motion.js')).length;
const applicationJsGzipBytes = await gzip('motion.js');
const bookingJsBytes =
  (await readFile('dist/booking.js')).length + (await readFile('dist/booking-model.js')).length;
const bookingJsGzipBytes = (await gzip('booking.js')) + (await gzip('booking-model.js'));
const total =
  applicationJsGzipBytes +
  markup +
  fontBytes +
  largestImage +
  galleryImage +
  (await gzip('favicon.svg'));
const workPhotoBytes =
  (await gzip('assets/images/barber-at-work-2026-09-17.jpg')) +
  (await gzip('assets/images/cut-rear-view-2026-09-05.jpg'));
const report = {
  lazyWorkPhotoGzipBytes: workPhotoBytes,
  fullPageAssetGzipBytes: total + workPhotoBytes + bookingJsGzipBytes,
  fullPageBudget: 550 * 1024,
  method:
    'Modeled core assets only, not observed initial requests: hero + local view + fonts + HTML/CSS/JS/favicon. JPGs separately included in full-page total. Browser tests measure actual initial requests.',
  node: process.version,
  markupGzipBytes: markup,
  fontGzipBytes: fontBytes,
  largestImageGzipBytes: largestImage,
  galleryImageGzipBytes: galleryImage,
  modeledCoreAssetGzipBytes: total,
  markupBudget: 75 * 1024,
  coreBudget: 400 * 1024,
  applicationJsBytes,
  applicationJsGzipBytes,
  applicationJsBudget: 6 * 1024,
  optionalBookingJsBytes: bookingJsBytes,
  optionalBookingJsGzipBytes: bookingJsGzipBytes,
  optionalBookingBudget: 24 * 1024,
  optionalGalleryJsBytes: (await readFile('dist/art-gallery.js')).length,
  optionalGalleryJsGzipBytes: await gzip('art-gallery.js'),
  optionalGalleryBudget: 20 * 1024,
};
await mkdir('.private-evidence', { recursive: true });
await writeFile('.private-evidence/budgets.json', JSON.stringify(report, null, 2));
console.log(report);
if (
  markup > report.markupBudget ||
  report.fullPageAssetGzipBytes > report.fullPageBudget ||
  total > report.coreBudget ||
  applicationJsBytes > report.applicationJsBudget ||
  bookingJsBytes > report.optionalBookingBudget ||
  report.optionalGalleryJsBytes > report.optionalGalleryBudget
)
  process.exitCode = 1;
