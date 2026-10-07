import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const expectedServices = [
  ['cut', 'Corte', 'C$200', '30 min'],
  ['beard', 'Barba', 'C$150', '15 min'],
  ['combo', 'Corte + barba', 'C$300', '45 min'],
];

async function checkOffer(page) {
  await expect(page.locator('#servicios')).toHaveCount(1);
  await expect(page.locator('.service-line')).toHaveCount(3);
  for (const [id, name, price, duration] of expectedServices) {
    const row = page.locator(`[data-offer="${id}"]`);
    await expect(row.locator('dt')).toHaveText(name);
    await expect(row.locator('.service-price')).toHaveText(price);
    await expect(row.locator('dd')).toContainText(duration);
  }
  await expect(page.locator('#servicios input, #servicios button')).toHaveCount(0);
  await expect(page.locator('.hero .call-action')).toHaveAttribute('href', './demo.html#reservar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 320, height: 568 },
]) {
  test(`public services stay available while reservations remain closed ${viewport.width}`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(viewport);
    const writes = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(request.url());
    });
    if (viewport.width === 320)
      await page.route('**/styles.css', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nhtml { font-size: 200%; }`,
        });
      });
    await mkdir('.private-evidence/public-catalog', { recursive: true });
    if (process.env.CATALOG_BASELINE_URL && viewport.width !== 320) {
      const before = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await before.goto(process.env.CATALOG_BASELINE_URL);
      await expect(before.locator('#servicios')).toHaveCount(0);
      await before.locator('.space-section').scrollIntoViewIfNeeded();
      await before.evaluate(() => document.querySelector('.space-section').scrollIntoView());
      await before.waitForLoadState('networkidle');
      await before.screenshot({
        path: `.private-evidence/public-catalog/before-below-hero-${viewport.width}.png`,
      });
      await before.close();
    }
    await page.goto('/');
    const rootFontSize = await page.evaluate(
      () => getComputedStyle(document.documentElement).fontSize,
    );
    if (viewport.width === 320) expect(rootFontSize).toBe('32px');
    await page.locator('#servicios').scrollIntoViewIfNeeded();
    await checkOffer(page);
    await expect(page.locator('#booking-policy')).not.toHaveAttribute('open', '');
    await page.locator('#servicios').screenshot({
      path: `.private-evidence/public-catalog/after-services-${viewport.width}.png`,
    });
    const summary = page.locator('#booking-policy > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#booking-policy')).toHaveAttribute('open', '');
    await expect(page.locator('#booking-policy')).toContainText('cuando habilitemos la agenda');
    await expect(page.locator('#booking-policy')).toContainText(
      'las reservas reales siguen cerradas',
    );
    await expect(page.locator('#booking-policy li')).toHaveCount(3);
    await checkOffer(page);
    const axe = await new AxeBuilder({ page }).include('#servicios').analyze();
    expect(axe.violations).toEqual([]);
    await page.locator('#servicios').screenshot({
      path: `.private-evidence/public-catalog/after-policies-${viewport.width}.png`,
    });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#booking-policy')).not.toHaveAttribute('open', '');
    await page.locator('.hero .call-action').click();
    await expect(page).toHaveURL(/\/demo\.html#reservar$/);
    await expect(page.locator('#demo-slots button').first()).toBeVisible();
    await page.goBack();
    await checkOffer(page);
    expect(writes).toEqual([]);
    await writeFile(
      `.private-evidence/public-catalog/metadata-${viewport.width}.json`,
      JSON.stringify(
        {
          sourceCommit: process.env.SOURCE_COMMIT || 'local-candidate',
          baselineCommit: 'b69c66c44a4b96d1d20359cf499e4c75ab1cccf4',
          viewport,
          enlargedText: viewport.width === 320,
          rootFontSize,
          beforeCapture: 'Existing page immediately below the hero, with no public catalog',
          afterCapture: 'New services region, with policies collapsed and expanded',
          bookingWrites: writes.length,
          axeViolations: axe.violations.length,
          axeIncomplete: axe.incomplete,
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
}

test('public catalog and future policies work without JavaScript or API access', async ({
  browser,
}, testInfo) => {
  const videoDirectory = testInfo.outputPath('no-js-video');
  await mkdir(videoDirectory, { recursive: true });
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDirectory, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const apiCalls = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiCalls.push(request.url());
  });
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#servicios').scrollIntoViewIfNeeded();
  await checkOffer(page);
  await page.locator('#booking-policy > summary').click();
  await expect(page.locator('#booking-policy')).toHaveAttribute('open', '');
  await expect(page.locator('#booking-policy')).toContainText(
    'las reservas reales siguen cerradas',
  );
  await expect(page.locator('a[href="tel:+50585482197"]')).toHaveCount(1);
  expect(apiCalls).toEqual([]);
  await mkdir('.private-evidence/public-catalog', { recursive: true });
  await page
    .locator('#servicios')
    .screenshot({ path: '.private-evidence/public-catalog/after-no-js-390.png' });
  await writeFile(
    '.private-evidence/public-catalog/metadata-no-js-390.json',
    JSON.stringify(
      {
        sourceCommit: process.env.SOURCE_COMMIT || 'local-candidate',
        viewport: { width: 390, height: 844 },
        javaScriptEnabled: false,
        apiCalls: apiCalls.length,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await context.close();
});
