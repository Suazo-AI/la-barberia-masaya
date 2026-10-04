import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`visit panel and static local gallery ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const requests = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const action = page.getByRole('link', { name: 'Reservar cita' });
    await expect(action).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('h1 span')
          .first()
          .evaluate((el) => getComputedStyle(el).opacity),
      )
      .toBe('1');
    await action.hover();
    await expect
      .poll(() => action.evaluate((el) => getComputedStyle(el, '::before').transform))
      .not.toContain('0.57735');
    await page.locator('.space-grid').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.is-revealing').count()).toBe(0);
    const visit = page.getByRole('region', { name: 'NOS VEMOS EN EL LOCAL.' });
    await visit.scrollIntoViewIfNeeded();
    await expect(visit.getByRole('heading', { name: 'HORARIO' })).toBeVisible();
    const expected = [
      ['Lunes', '1:00–7:00 p. m.'],
      ['Martes', 'Cerrado'],
      ['Miércoles', '1:00–7:00 p. m.'],
      ['Jueves', '1:00–7:00 p. m.'],
      ['Viernes', '10:00 a. m.–7:00 p. m.'],
      ['Sábado', '10:00 a. m.–7:00 p. m.'],
      ['Domingo', '10:00 a. m.–5:00 p. m.'],
    ];
    expect(
      await visit
        .locator('.hours-list > div')
        .evaluateAll((rows) =>
          rows.map((row) => [
            row.querySelector('dt').textContent,
            row.querySelector('dd').textContent,
          ]),
        ),
    ).toEqual(expected);
    const directions = page.getByRole('link', { name: 'Cómo llegar' });
    const destination = new URL(await directions.getAttribute('href'));
    expect(destination.origin).toBe('https://www.google.com');
    expect(destination.searchParams.get('query_place_id')).toBe('ChIJ5VCti5kHdI8RfdKEhOxWcr4');
    await directions.focus();
    await expect(directions).toBeFocused();
    expect(await directions.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const bounds = await directions.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    // Intercept directions locally: no user location or route is sent during QA.
    await directions.evaluate((link) =>
      link.addEventListener('click', (event) => {
        event.preventDefault();
        window.directionsAttempts = (window.directionsAttempts || 0) + 1;
      }),
    );
    await page.keyboard.press('Enter');
    await directions.click();
    expect(await page.evaluate(() => window.directionsAttempts)).toBe(2);
    await expect(page.locator('.gallery-tools')).toBeVisible();
    await expect(page.locator('.space-grid')).toBeVisible();
    expect(requests.some((url) => url.endsWith('/art-gallery.js'))).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('.gallery-tools')).toBeVisible();
    expect(errors).toEqual([]);
    await mkdir('.private-evidence', { recursive: true });
    await visit.screenshot({ path: `.private-evidence/ui-after-visit-${viewport.width}.png` });
    await page.screenshot({
      path: `.private-evidence/ui-after-page-${viewport.width}.png`,
      fullPage: true,
    });
    await writeFile(
      `.private-evidence/ui-visit-manifest-${viewport.width}.json`,
      JSON.stringify(
        {
          commit: process.env.SOURCE_COMMIT || 'local-uncommitted',
          baselineCommit: '0755fce62688e380a737db9e267bad22e35acf25',
          viewport,
          url: page.url(),
          checks: [
            'seven exact weekly rows',
            'Maps place ID',
            'keyboard focus',
            'repeated intercepted directions',
            'premises remain static across motion changes; authentic gallery controls return',
          ],
          capture: 'Real Playwright Chromium screenshots and WebM',
        },
        null,
        2,
      ),
    );
  });
}
