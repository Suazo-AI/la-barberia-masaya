import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 320, height: 568 },
]) {
  test(`authentic cut and team stay sourced, on demand and fail closed ${viewport.width}`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(viewport);
    const requested = [];
    const writes = [];
    const errors = [];
    page.on('request', (request) => {
      requested.push(request.url());
      if (request.method() !== 'GET') writes.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    if (viewport.width === 320)
      await page.route('**/styles.css', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nhtml { font-size: 200%; }`,
        });
      });
    await mkdir('.private-evidence/authentic-content', { recursive: true });
    if (process.env.AUTHENTIC_BASELINE_URL && viewport.width !== 320) {
      const before = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await before.goto(process.env.AUTHENTIC_BASELINE_URL);
      await before.locator('.work-section').scrollIntoViewIfNeeded();
      await before.evaluate(() => document.querySelector('.work-section').scrollIntoView());
      await before.waitForLoadState('networkidle');
      await before.screenshot({
        path: `.private-evidence/authentic-content/before-gallery-${viewport.width}.png`,
      });
      await before.getByRole('link', { name: 'Reservar cita', exact: true }).click();
      await expect(before.locator('#service-heading')).toContainText('configuración');
      await before.screenshot({
        path: `.private-evidence/authentic-content/before-dialog-${viewport.width}.png`,
      });
      await before.close();
    }
    await page.goto('/');
    expect(requested.some((url) => url.includes('jonatan-at-work'))).toBe(false);
    await page.locator('.work-section').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('.work-section').scrollIntoView());
    const frame = page.locator('.highlight-fade-viewport');
    // At 200% text the section introduction extends beyond the viewport. Bring
    // the real photo card near the observer instead of forcing eager loading.
    if (viewport.width === 320) await frame.scrollIntoViewIfNeeded();
    await expect(frame.locator('img')).toBeVisible();
    await expect
      .poll(() =>
        frame.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    const actualCrop = await frame.evaluate((node) => {
      const viewport = node.getBoundingClientRect();
      const image = node.querySelector('img');
      const box = image.getBoundingClientRect();
      const scale = box.width / image.naturalWidth;
      return [
        (viewport.x - box.x) / scale,
        (viewport.y - box.y) / scale,
        viewport.width / scale,
        viewport.height / scale,
      ];
    });
    for (const [index, expected] of [373, 90, 404, 580].entries())
      expect(actualCrop[index]).toBeCloseTo(expected, 0);
    await page.screenshot({
      path: `.private-evidence/authentic-content/after-gallery-${viewport.width}.png`,
    });
    const opener = page.getByRole('link', {
      name: 'Equipo y agenda real · pendiente',
      exact: true,
    });
    await opener.click();
    await expect(page.locator('#service-heading')).toContainText('configuración');
    await expect(page.locator('#booking-team')).not.toHaveAttribute('open', '');
    await expect(page.locator('#booking-team img')).toHaveCount(0);
    const teamSummary = page.locator('#booking-team > summary');
    const close = page.locator('[data-booking-close]');
    const retry = page.locator('#booking-retry');
    async function checkFocusWrap() {
      await expect(retry).toBeVisible();
      await retry.focus();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(retry).toBeFocused();
    }
    await checkFocusWrap();
    await teamSummary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#booking-team')).toHaveAttribute('open', '');
    await expect(page.locator('.team-profile')).toHaveCount(3);
    await expect(page.locator('#booking-team img')).toHaveCount(0);
    expect(requested.some((url) => url.includes('jonatan-at-work'))).toBe(false);
    await page.locator('.team-profile > summary').first().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.team-profile').first()).toHaveAttribute('open', '');
    await checkFocusWrap();
    await expect(page.locator('#booking-team img')).toHaveCount(1);
    // Focus-wrap checks end at the retry control below the disclosures. Scroll
    // back to the lazy portrait before checking its decoded source dimensions.
    await page.locator('#booking-team img').scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page
          .locator('#booking-team img')
          .evaluate((image) => image.complete && image.naturalWidth === 1080),
      )
      .toBe(true);
    await expect(page.locator('.team-profile').first()).toContainText(
      'Portafolio de cortes terminados pendiente',
    );
    await expect(page.locator('#booking-continue')).toBeHidden();
    await expect(page.locator('#booking-barbers input')).toHaveCount(0);
    await expect(page.locator('#complete-heading')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await page.locator('.team-profile > summary').first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.private-evidence/authentic-content/after-profile-${viewport.width}.png`,
    });
    await page.locator('.team-profile > summary').first().click();
    await page.locator('#booking-team > summary').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.team-profile > summary').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#booking-dialog')).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('#booking-team img')).toHaveCount(0);
    await opener.click();
    await expect(page.locator('#service-heading')).toContainText('configuración');
    await expect(page.locator('#booking-team')).not.toHaveAttribute('open', '');
    await expect(page.locator('#booking-team img')).toHaveCount(0);
    await page.locator('[data-booking-close]').click();
    await expect(opener).toBeFocused();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    await writeFile(
      `.private-evidence/authentic-content/metadata-${viewport.width}.json`,
      JSON.stringify(
        {
          baselineCommit: '5bcaac53aafddd204ea9634d0b75c17140904b4e',
          sourceCommit: process.env.SOURCE_COMMIT || 'local-uncommitted-candidate',
          beforeUrl: process.env.AUTHENTIC_BASELINE_URL || null,
          afterUrl: 'http://127.0.0.1:4173/',
          viewport,
          enlargedText: viewport.width === 320,
          sourceCrop: actualCrop,
          onDemandPortrait: true,
          dialogReset: true,
          bookingWrites: writes.length,
          axeViolations: axe.violations.length,
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
}

test('authentic gallery canvas uses the same control-free source viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.sourceCropCalls = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLImageElement && image.src.includes('finished-fade-highlight'))
        window.sourceCropCalls.push(args);
      return drawImage.call(this, image, ...args);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar galería', exact: true }).click();
  await expect(page.locator('.art-gallery canvas')).toBeVisible();
  const calls = await page.evaluate(() => window.sourceCropCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].slice(0, 4)).toEqual([373, 90, 404, 580]);
  expect(calls[0]).toHaveLength(8);
  await mkdir('.private-evidence/authentic-content', { recursive: true });
  await page
    .locator('.art-gallery')
    .screenshot({ path: '.private-evidence/authentic-content/after-canvas-1440.png' });
  await page.getByRole('button', { name: 'Cerrar exploración', exact: true }).click();
  await expect(page.locator('.art-gallery canvas')).toHaveCount(0);
});
