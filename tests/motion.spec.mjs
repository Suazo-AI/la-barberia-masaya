import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

test.use({ reducedMotion: 'no-preference' });
const digest = (image) => createHash('sha256').update(image).digest('hex');

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`real UI motion and Obsidian gallery ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const action = page.getByRole('link', { name: 'Llamar para consultar' });
    await expect(action).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('h1 span')
          .first()
          .evaluate((el) => getComputedStyle(el).opacity),
      )
      .toBe('1');
    await mkdir('.private-evidence', { recursive: true });
    await page.screenshot({
      path: `.private-evidence/ui-after-hero-${viewport.width}.png`,
      fullPage: true,
    });
    await action.hover();
    await expect
      .poll(() => action.evaluate((el) => getComputedStyle(el, '::before').transform))
      .not.toContain('0.57735');
    await page.screenshot({ path: `.private-evidence/ui-after-button-${viewport.width}.png` });
    await page.locator('.space-grid').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.is-revealing').count()).toBe(0);
    expect(requests.some((url) => url.endsWith('/art-gallery.js'))).toBe(false);
    await page.getByRole('button', { name: 'Explorar galería' }).click();
    const surface = page.locator('.art-gallery');
    await expect(surface.locator('canvas')).toBeVisible();
    await expect(surface).toBeFocused();
    await expect(page.locator('.space-grid')).toBeHidden();
    await expect(
      page.getByRole('list', { name: 'Fotos incluidas en la galería' }).getByRole('listitem'),
    ).toHaveCount(4);
    await expect(page.getByRole('list', { name: 'Fotos incluidas en la galería' })).toContainText(
      'Detalle de una lámpara',
    );
    await expect
      .poll(() => surface.locator('canvas').evaluate((canvas) => canvas.width))
      .toBeGreaterThan(0);
    // Wait for actual interpolation settling, not merely a canvas element to exist.
    await page.waitForTimeout(500);
    const before = digest(await surface.screenshot());
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(800);
    expect(digest(await surface.screenshot())).not.toBe(before);
    await page.keyboard.press('Home');
    await page.waitForTimeout(800);
    const box = await surface.boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.6, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    expect(digest(await surface.screenshot())).not.toBe(before);
    await page.screenshot({
      path: `.private-evidence/ui-after-obsidian-${viewport.width}.png`,
      fullPage: true,
    });
    expect(await surface.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.getByRole('button', { name: 'Ver cuadrícula' }).click();
    await expect(page.locator('.space-grid')).toBeVisible();
    await expect(surface.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Explorar galería' }).click();
    await expect(surface.locator('canvas')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('heading', { name: 'EL LOCAL' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'EL LOCAL' })).toBeVisible();
    await expect(page.locator('.space-grid')).toBeVisible();
    await expect(surface.locator('canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(requests.every((url) => url.startsWith('http://127.0.0.1:4173'))).toBe(true);
    await writeFile(
      `.private-evidence/ui-manifest-${viewport.width}.json`,
      JSON.stringify(
        {
          commit: process.env.SOURCE_COMMIT || 'local-uncommitted',
          baselineCommit: '3dbff80204c72754959b39966620146704b5233b',
          viewport,
          afterUrl: 'http://127.0.0.1:4173/',
          beforeUrl: process.env.UI_BASELINE_URL || null,
          checks: [
            'hero entry',
            'CTA wipe',
            'gallery reveal',
            'lazy WebGL source',
            'actual changed WebGL pixels after keyboard and drag',
            'repeated open/close',
            'reduced-motion change',
            'axe interactive mode',
          ],
          capture:
            'Playwright Chromium real screenshots and test-results WebM recording; no generated reconstruction',
          axeViolations: audit.violations,
        },
        null,
        2,
      ),
    );
  });
  test(`real pre-change baseline ${viewport.width}`, async ({ page }) => {
    test.skip(!process.env.UI_BASELINE_URL, 'Pinned baseline app is provided by CI');
    await page.setViewportSize(viewport);
    await page.goto(process.env.UI_BASELINE_URL);
    await page.evaluate(() => document.fonts.ready);
    await mkdir('.private-evidence', { recursive: true });
    await page.screenshot({
      path: `.private-evidence/ui-before-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Llamar para consultar' }).hover();
    await page.locator('.space-grid').scrollIntoViewIfNeeded();
    await expect(page.locator('.space-grid img')).toHaveCount(4);
    await page.screenshot({
      path: `.private-evidence/ui-before-grid-${viewport.width}.png`,
      fullPage: true,
    });
  });
}

test('WebGL denied and context loss restore semantic gallery', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar galería' }).click();
  await expect(page.getByRole('status')).toContainText('no está disponible');
  await expect(page.locator('.space-grid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explorar galería' })).toBeEnabled();
});

test('real context loss and pointer cancellation recover', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar galería' }).click();
  const surface = page.locator('.art-gallery');
  await expect(surface.locator('canvas')).toBeVisible();
  const bounds = await surface.boundingBox();
  await page.mouse.move(bounds.x + 50, bounds.y + 50);
  await page.mouse.down();
  await surface.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(surface).not.toHaveClass(/is-dragging/);
  await page.mouse.down();
  await surface
    .locator('canvas')
    .evaluate((canvas) =>
      canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext(),
    );
  await expect(page.locator('.space-grid')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('no está disponible');
  await page.mouse.up();
  await expect(surface).not.toHaveClass(/is-dragging/);
  await page.getByRole('button', { name: 'Explorar galería' }).click();
  await expect(surface.locator('canvas')).toBeVisible();
  await expect(surface).not.toHaveClass(/is-dragging/);
});

test('reduced motion keeps static content and downloads no gallery engine', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const urls = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto('/');
  await expect(page.locator('.space-grid')).toBeVisible();
  await expect(page.locator('.gallery-tools')).toBeHidden();
  expect(
    await page
      .locator('h1 span')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(
    await page
      .locator('.call-action')
      .evaluate((el) => getComputedStyle(el, '::before').transitionDuration),
  ).toBe('0s');
  expect(urls.some((url) => url.endsWith('/art-gallery.js'))).toBe(false);
});
