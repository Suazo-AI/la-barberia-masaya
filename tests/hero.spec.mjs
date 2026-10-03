import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

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
    await expect(page.getByRole('heading', { name: 'EL LOCAL' })).toBeVisible();
    const action = page.getByRole('link', { name: 'Llamar para consultar' });
    await expect(action).toHaveAttribute('href', 'tel:+50585482197');
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

test('keyboard, repeated call activation intercepted, and history', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  const skip = await page.locator('.skip-link').boundingBox();
  expect(skip.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  const action = page.getByRole('link', { name: 'Llamar para consultar' });
  await expect(action).toBeFocused();
  expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.evaluate(() => {
    window.callAttempts = [];
    document.querySelector('.call-action').addEventListener('click', (e) => {
      e.preventDefault();
      window.callAttempts.push(e.currentTarget.getAttribute('href'));
    });
  });
  await page.keyboard.press('Enter');
  await action.click();
  await action.click();
  expect(await page.evaluate(() => window.callAttempts)).toEqual(Array(3).fill('tel:+50585482197'));
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
  await expect(page.getByRole('link', { name: 'Llamar para consultar' })).toHaveAttribute(
    'href',
    'tel:+50585482197',
  );
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
    await expect(zoom.getByRole('link', { name: 'Llamar para consultar' })).toBeVisible();
    await zoom.close();
  }
  const missing = await browser.newPage();
  await missing.route('**/assets/images/**', (route) => route.abort());
  await missing.goto('http://127.0.0.1:4173/');
  await expect(missing.getByRole('link', { name: 'Llamar para consultar' })).toBeVisible();
  await missing.close();
});

test('404 navigation returns to real home without an overlay', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response.status()).toBe(404);
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/TU ESTILO.\s+BIEN HECHO./);
});
