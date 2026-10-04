import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

async function openSchedule(page) {
  await page.clock.install({ time: new Date('2026-10-03T15:00:00Z') });
  await page.goto('/');
  await page.getByRole('link', { name: 'Reservar cita' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Corte clásico/ }).check();
  await dialog.locator('#booking-continue').click();
  await dialog.locator('#booking-date').fill('2026-10-04');
  await dialog.locator('#booking-date').press('Tab');
  return dialog;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`barber portfolio selection and interruption ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [],
      requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) =>
      requests.push({ url: request.url(), method: request.method() }),
    );
    const dialog = await openSchedule(page);
    const any = dialog.locator('input[name="demo-barber"][value="any"]');
    const professionalA = dialog.locator('input[name="demo-barber"][value="a"]');
    const viewA = dialog.locator('[data-portfolio-open="a"]');
    const viewB = dialog.locator('[data-portfolio-open="b"]');
    const heading = dialog.locator('#portfolio-heading');
    await expect(any).toBeChecked();
    await expect(dialog.locator('.booking-profile-photo')).toHaveCount(2);
    await expect(dialog.locator('#booking-portfolio-works img')).toHaveCount(0);
    await dialog.locator('#booking-slots').getByRole('radio').first().check();
    await viewA.click();
    await expect(heading).toBeFocused();
    await expect(heading).toHaveText('Trabajos de Profesional A');
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(dialog.locator('[data-panel="2"]')).toBeHidden();
    await expect(dialog.locator('.booking-progress')).toBeHidden();
    await expect(dialog.locator('.booking-footer')).toBeHidden();
    await expect(dialog.locator('#booking-portfolio-empty')).toContainText('Portafolio pendiente.');
    await expect(dialog.locator('[data-panel="portfolio"]')).toContainText(
      'Este perfil es de ejemplo.',
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await mkdir('.private-evidence/cleanup', { recursive: true });
    await writeFile(
      `.private-evidence/cleanup/portfolio-axe-${viewport.width}.json`,
      JSON.stringify(
        {
          viewport,
          violations: audit.violations,
          incomplete: audit.incomplete,
          passes: audit.passes.length,
        },
        null,
        2,
      ),
    );
    await dialog.getByRole('button', { name: 'Volver a barberos' }).click();
    await expect(viewA).toBeFocused();
    await expect(any).toBeChecked();
    await expect(dialog.locator('#booking-continue')).toBeEnabled();
    await viewA.click();
    await dialog.getByRole('button', { name: 'Elegir este barbero' }).click();
    await expect(professionalA).toBeChecked();
    await expect(dialog.locator('#booking-continue')).toBeDisabled();
    await expect(dialog.locator('#booking-date')).toHaveValue('2026-10-04');
    await expect(dialog.locator('#booking-slots input:checked')).toHaveCount(0);
    await dialog.locator('#booking-slots').getByRole('radio').first().check();
    await viewA.click();
    await dialog.getByRole('button', { name: 'Elegir este barbero' }).click();
    await expect(dialog.locator('#booking-continue')).toBeEnabled();
    await viewB.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(viewB).toBeFocused();
    await expect(professionalA).toBeChecked();
    await expect(dialog.locator('#booking-continue')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('link', { name: 'Reservar cita' })).toBeFocused();
    await page.getByRole('link', { name: 'Reservar cita' }).click();
    await expect(dialog.locator('#booking-services input:checked')).toHaveCount(0);
    await dialog.getByRole('radio', { name: /Corte clásico/ }).check();
    await dialog.locator('#booking-continue').click();
    await viewA.click();
    await dialog.getByRole('button', { name: 'Cerrar y descartar demo' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('link', { name: 'Reservar cita' }).click();
    await expect(dialog.locator('[data-panel="portfolio"]')).toBeHidden();
    await expect(dialog.locator('#booking-services input:checked')).toHaveCount(0);
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(
      requests.filter(
        ({ url, method }) => !url.startsWith('http://127.0.0.1:4173/') || method !== 'GET',
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('portfolio 320px at 200% text preserves visible focus and keyboard return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dialog = await openSchedule(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  const view = dialog.locator('[data-portfolio-open="b"]');
  await view.click();
  const heading = dialog.locator('#portfolio-heading');
  await expect(heading).toBeFocused();
  const box = await heading.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (const button of await dialog.locator('button:visible').all()) {
    const rect = await button.boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  const close = dialog.getByRole('button', { name: 'Cerrar y descartar demo' });
  const choose = dialog.getByRole('button', { name: 'Elegir este barbero' });
  await choose.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(choose).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(
    await dialog.evaluate(
      (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    ),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('portfolio images are requested only after opening their attributed profile', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('portfolio-fixture')) requests.push(request.url());
  });
  await page.route('**/portfolio-fixture.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><rect width="160" height="200" fill="#777366" /></svg>',
    }),
  );
  const dialog = await openSchedule(page);
  await page.evaluate(async () => {
    const { BARBERS } = await import('/booking-model.js');
    BARBERS[0].portfolio.push(
      { verified: false, src: '/portfolio-fixture-unverified.svg' },
      {
        verified: true,
        src: '/portfolio-fixture.svg',
        alt: 'Ilustración de prueba, sin atribución a una persona real',
        width: 160,
        height: 200,
        caption: 'Contenido exclusivo de esta prueba',
        sourceURL: 'https://example.com/',
      },
    );
  });
  expect(requests).toEqual([]);
  await dialog.locator('[data-portfolio-open="b"]').click();
  expect(requests).toEqual([]);
  await expect(dialog.locator('#booking-portfolio-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.locator('[data-portfolio-open="a"]').click();
  const photo = dialog.locator('#booking-portfolio-works img');
  await expect(photo).toHaveCount(1);
  await expect
    .poll(() => photo.evaluate((img) => img.complete && img.naturalWidth === 160))
    .toBe(true);
  expect(requests).toHaveLength(1);
  await expect(dialog.locator('#booking-portfolio-empty')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(photo).toHaveCount(0);
  await dialog.locator('[data-portfolio-open="a"]').click();
  await expect(photo).toHaveCount(1);
  await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});
