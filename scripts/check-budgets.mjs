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
  (await readFile('dist/booking-live.js')).length +
  (await readFile('dist/booking-client.js')).length;
const bookingJsGzipBytes = (await gzip('booking-live.js')) + (await gzip('booking-client.js'));
const total =
  applicationJsGzipBytes +
  markup +
  fontBytes +
  largestImage +
  galleryImage +
  (await gzip('favicon.svg'));
const workPhotoBytes =
  (await gzip('assets/images/finished-fade-highlight-2026-10-06.jpg')) +
  (await gzip('assets/images/cut-rear-view-2026-09-05.jpg'));
const teamPhotoBytes = await gzip('assets/images/jonatan-at-work-2026-09-16.jpg');
const pageBeforeTeamBytes = total + workPhotoBytes + bookingJsGzipBytes;
const report = {
  lazyWorkPhotoGzipBytes: workPhotoBytes,
  modeledPageBeforeTeamGzipBytes: pageBeforeTeamBytes,
  pageBeforeTeamBudget: 550 * 1024,
  optionalTeamPhotoGzipBytes: teamPhotoBytes,
  optionalTeamPhotoBudget: 160 * 1024,
  modeledPageIncludingTeamGzipBytes: pageBeforeTeamBytes + teamPhotoBytes,
  pageIncludingTeamBudget: 710 * 1024,
  optionalTeamBudgetReason:
    'One intact, caption-identified source portrait, requested only after opening its profile. The initial/core and pre-profile page caps are unchanged.',
  method:
    'Modeled core assets only, not observed initial requests: hero + local view + fonts + HTML/CSS/JS/favicon. Gallery JPGs and booking code are included in the pre-profile page total; the one on-demand team portrait has a separate enforced allowance. Optional gallery engine is reported separately. Browser tests measure actual initial requests.',
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
  // Persistent API/retry/capability flows plus document-loss guards. The former
  // 36 KiB cap predates reload recovery. Bootstrap/core/full gzip caps stay fixed.
  optionalBookingBudget: 40 * 1024,
  optionalBookingBudgetReason:
    'Persistent agenda client with server catalog, stale-response protection, idempotent retries, scoped management links and non-secret document-loss guards; no framework/runtime dependency.',
  optionalGalleryJsBytes: (await readFile('dist/art-gallery.js')).length,
  optionalGalleryJsGzipBytes: await gzip('art-gallery.js'),
  optionalGalleryBudget: 20 * 1024,
};
await mkdir('.private-evidence', { recursive: true });
await writeFile('.private-evidence/budgets.json', JSON.stringify(report, null, 2));
console.log(report);
if (
  markup > report.markupBudget ||
  report.modeledPageBeforeTeamGzipBytes > report.pageBeforeTeamBudget ||
  report.optionalTeamPhotoGzipBytes > report.optionalTeamPhotoBudget ||
  report.modeledPageIncludingTeamGzipBytes > report.pageIncludingTeamBudget ||
  total > report.coreBudget ||
  applicationJsBytes > report.applicationJsBudget ||
  bookingJsBytes > report.optionalBookingBudget ||
  report.optionalGalleryJsBytes > report.optionalGalleryBudget
)
  process.exitCode = 1;
