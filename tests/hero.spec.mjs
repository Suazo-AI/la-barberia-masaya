import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
for (const viewport of viewports) {
  test(`responsive ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const failed = [],
      external = [],
      errors = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(r.url());
    });
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4173')) external.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator('h1').innerText()).toMatch(/TU ESTILO.\s+BIEN HECHO./);
    expect(await page.locator('.hero a').count()).toBe(1);
    await expect(page.locator('.space-grid img')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'EL LOCAL', exact: true })).toBeVisible();
    const columns = await page
      .locator('.space-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(viewport.width >= 768 ? 4 : 2);
    const action = page.getByRole('link', { name: 'Reservar cita' });
    await expect(action).toHaveAttribute('href', './demo.html#reservar');
    const box = await action.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.locator('h1').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(
      await page.locator('.hero-scene img').evaluate((el) => el.complete && el.naturalWidth > 0),
    ).toBe(true);
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(failed).toEqual([]);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    if ([320, 390, 1440].includes(viewport.width)) {
      for (const card of await page.locator('.work-photo').all()) {
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator('img')).toHaveCount(1);
        await expect
          .poll(() => card.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0))
          .toBe(true);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await mkdir('.private-evidence', { recursive: true });
      await page.screenshot({
        path: `.private-evidence/hero-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
    }
  });
}

test('accessibility: no WCAG A/AA violations at mobile and desktop', async ({ page }) => {
  const reports = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    reports.push({
      viewportWidth: width,
      violations: result.violations,
      incomplete: result.incomplete,
      passes: result.passes.length,
    });
    expect(result.violations).toEqual([]);
  }
  await mkdir('.private-evidence', { recursive: true });
  await writeFile('.private-evidence/axe-results.json', JSON.stringify(reports, null, 2));
});

test('keyboard, repeated agenda opening, and history', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  const skip = await page.locator('.skip-link').boundingBox();
  expect(skip.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  const action = page.getByRole('link', { name: 'Reservar cita' });
  await expect(action).toBeFocused();
  expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/demo\.html#reservar$/);
    await expect(page.locator('#demo-slots button').first()).toBeVisible();
    await page.goBack();
    await expect(action).toBeVisible();
    await action.focus();
  }
  await expect(page.locator('h1')).toBeVisible();
  await page.goBack();
  expect(new URL(page.url()).hash).toBe('');
  await page.goForward();
  expect(new URL(page.url()).hash).toBe('#contenido');
});

test('no JavaScript, enlarged text, reduced motion, and missing image remain usable', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('link', { name: /Consultar una cita real/ })).toHaveAttribute(
    'href',
    'tel:+50585482197',
  );
  await expect(page.getByRole('link', { name: 'Reservar cita' })).toHaveAttribute(
    'href',
    './demo.html#reservar',
  );
  await page.getByRole('link', { name: 'Reservar cita' }).click();
  await expect(page).toHaveURL(/\/demo\.html#reservar$/);
  await expect(page.locator('noscript .demo-notice')).toContainText('Activá JavaScript');
  await expect(page.locator('noscript .demo-notice')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.work-grid img')).toHaveCount(2);
  await expect(page.locator('.work-grid blockquote')).toHaveCount(3);
  await expect(page.locator('.work-grid')).toContainText('Moises Diaz');
  await expect(page.locator('.gallery-tools')).toBeHidden();
  for (const card of await page.locator('.work-photo').all()) {
    const cardBox = await card.boundingBox();
    const crop = card.locator('.work-photo-viewport');
    const imageBox = await card.locator('img').boundingBox();
    if (await crop.count()) {
      const cropBox = await crop.boundingBox();
      expect(cropBox.y).toBeCloseTo(cardBox.y, 0);
      expect(cropBox.x).toBeCloseTo(cardBox.x, 0);
      expect(cropBox.width).toBeCloseTo(cardBox.width, 0);
      const scale = imageBox.width / 1165;
      const actual = [
        (cropBox.x - imageBox.x) / scale,
        (cropBox.y - imageBox.y) / scale,
        cropBox.width / scale,
        cropBox.height / scale,
      ];
      for (const [index, expected] of [373, 90, 404, 580].entries())
        expect(actual[index]).toBeCloseTo(expected, 0);
    } else expect(imageBox.y).toBeCloseTo(cardBox.y, 0);
  }
  await mkdir('.private-evidence', { recursive: true });
  await page.screenshot({ path: '.private-evidence/ui-no-js-390.png', fullPage: true });
  await context.close();
  for (const width of [320, 390, 720]) {
    const zoom = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await zoom.goto('http://127.0.0.1:4173/');
    await zoom.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await zoom.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
      '32px',
    );
    const overflowing = await zoom.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => {
          if (el.matches('.work-photo-viewport img')) return false; // Only the cropped image is exempt; its clipping viewport stays checked.
          if (el.closest('.space-tile')) return false; // Intentional, clipped photographic detail crops.
          const box = el.getBoundingClientRect();
          return getComputedStyle(el).display !== 'none' && box.right > innerWidth + 1;
        })
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          right: el.getBoundingClientRect().right,
          width: el.getBoundingClientRect().width,
        })),
    );
    expect(overflowing, `Overflow at ${width}px / 200% text`).toEqual([]);
    expect(await zoom.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await zoom.locator('h1').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(zoom.getByRole('link', { name: 'Reservar cita' })).toBeVisible();
    await zoom.close();
  }
  const missing = await browser.newPage();
  await missing.route('**/assets/images/**', (route) => route.abort());
  await missing.goto('http://127.0.0.1:4173/');
  await expect(missing.getByRole('link', { name: 'Reservar cita' })).toBeVisible();
  await missing.close();
});

test('404 navigation returns to real home without an overlay', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response.status()).toBe(404);
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/TU ESTILO.\s+BIEN HECHO./);
});

for (const dpr of [1, 2]) {
  test(`gallery loads every tile and shares bounded image requests at DPR ${dpr}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: dpr,
    });
    const page = await context.newPage();
    const resources = new Set();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === 'http://127.0.0.1:4173')
        resources.add(url.pathname === '/' ? '/index.html' : url.pathname);
    });
    await page.goto('http://127.0.0.1:4173/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    const initialCosts = [];
    for (const path of resources)
      initialCosts.push({
        path,
        gzipBytes: gzipSync(await readFile(`dist${path}`), { level: 9 }).length,
      });
    const initialGzipBytes = initialCosts.reduce((sum, item) => sum + item.gzipBytes, 0);
    await mkdir('.private-evidence', { recursive: true });
    await writeFile(
      `.private-evidence/network-initial-dpr${dpr}.json`,
      JSON.stringify(
        {
          initialCosts,
          initialGzipBytes,
          budget: 400 * 1024,
          observation: 'Actual requests after initial network idle, before scrolling',
        },
        null,
        2,
      ),
    );
    expect.soft(initialGzipBytes, 'Actual initial request budget').toBeLessThanOrEqual(400 * 1024);
    await page.locator('.space-grid').scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page
          .locator('.space-grid img')
          .evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0)),
      )
      .toBe(true);
    const frontSources = await page
      .locator('.hero-scene img, .space-tile-front img, .space-tile-lamp img')
      .evaluateAll((images) => images.map((img) => img.currentSrc));
    expect(new Set(frontSources).size).toBe(1);
    await page.locator('.work-grid').scrollIntoViewIfNeeded();
    await expect(page.locator('.work-grid img')).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator('.work-grid img')
          .evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0)),
      )
      .toBe(true);
    const imagePaths = [...resources].filter((path) => path.endsWith('.webp')).sort();
    expect(imagePaths).toEqual([
      '/assets/images/interior-1672.webp',
      '/assets/images/local-overview-1000.webp',
    ]);
    const costs = [];
    for (const path of resources)
      costs.push({ path, gzipBytes: gzipSync(await readFile(`dist${path}`), { level: 9 }).length });
    const totalGzipBytes = costs.reduce((sum, resource) => sum + resource.gzipBytes, 0);
    expect(totalGzipBytes).toBeLessThanOrEqual(550 * 1024);
    await mkdir('.private-evidence', { recursive: true });
    await writeFile(
      `.private-evidence/network-budget-dpr${dpr}.json`,
      JSON.stringify(
        { viewport: { width: 1920, height: 1080 }, dpr, costs, totalGzipBytes, budget: 550 * 1024 },
        null,
        2,
      ),
    );
    await context.close();
  });
}
