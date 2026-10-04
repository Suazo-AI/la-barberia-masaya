import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const clock = new Date('2026-10-03T15:00:00Z'); // 09:00 in Managua; deterministic demo evidence.
const dialogFor = (page) => page.getByRole('dialog', { name: 'RESERVÁ TU TIEMPO.' });
const continueIn = (dialog) => dialog.locator('#booking-continue');
async function openDemo(page) {
  await page.clock.install({ time: clock });
  await page.goto('/');
  await page.getByRole('link', { name: 'Reservar cita' }).click();
  const dialog = dialogFor(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Elegí tu servicio' })).toBeFocused();
  return dialog;
}
async function chooseService(dialog, name = /Corte \+ barba/) {
  await dialog.getByRole('radio', { name }).check();
  await continueIn(dialog).click();
  await expect(dialog.getByRole('heading', { name: 'Encontrá tu horario' })).toBeFocused();
}
async function capture(page, name, fullPage = false) {
  await mkdir('.private-evidence', { recursive: true });
  await page.screenshot({ path: `.private-evidence/ui-${name}.png`, fullPage });
  // Deliberate reading time in the real evidence video, never used to synchronize assertions.
  await page.waitForTimeout(650);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test.describe(`booking at ${viewport.width}`, () => {
    test.use({ viewport });
    test(`complete, edit, unavailable days and reopen ${viewport.width}`, async ({ page }) => {
      const requests = [],
        errors = [];
      page.on('request', (request) =>
        requests.push({ url: request.url(), method: request.method() }),
      );
      page.on('pageerror', (error) => errors.push(error.message));
      const dialog = await openDemo(page);
      await expect(continueIn(dialog)).toBeDisabled();
      await capture(page, `after-booking-service-${viewport.width}`);
      await chooseService(dialog);
      await expect(dialog.locator('#booking-summary')).toContainText('50 min · C$ 300 NIO');
      await dialog.locator('#booking-date').fill('2026-10-04');
      await dialog.locator('#booking-date').press('Tab');
      await dialog.getByRole('radio', { name: '10:00 a. m.', exact: true }).check();
      await expect(continueIn(dialog)).toBeEnabled();
      await capture(page, `after-booking-time-${viewport.width}`);
      await continueIn(dialog).click();
      await expect(dialog.getByRole('heading', { name: 'Revisá tu selección' })).toBeFocused();
      await expect(dialog.locator('#booking-review')).toContainText('10:00 a. m. – 10:50 a. m.');
      await expect(dialog.locator('#booking-review')).toContainText(
        'Profesional A · demo · sin preferencia',
      );
      await capture(page, `after-booking-review-${viewport.width}`);
      await dialog.getByRole('button', { name: 'Editar servicio', exact: true }).click();
      await dialog.getByRole('radio', { name: /^Barba / }).check();
      await continueIn(dialog).click();
      await expect(continueIn(dialog)).toBeDisabled();
      await expect(dialog.locator('#booking-slots input:checked')).toHaveCount(0);
      await dialog.getByRole('radio', { name: /Profesional B/ }).check();
      await dialog.locator('#booking-date').fill('2026-10-06');
      await dialog.locator('#booking-date').press('Tab');
      await expect(dialog.locator('#booking-empty')).toContainText('El martes está cerrado');
      await expect(continueIn(dialog)).toBeDisabled();
      await capture(page, `after-booking-closed-${viewport.width}`);
      await dialog.locator('#booking-next-date').click();
      await expect(dialog.locator('#booking-date')).toHaveValue('2026-10-07');
      await dialog.locator('#booking-date').fill('2026-10-08');
      await dialog.locator('#booking-date').press('Tab');
      await expect(dialog.locator('#booking-empty')).toContainText('No quedan horarios de ejemplo');
      await capture(page, `after-booking-empty-${viewport.width}`);
      await dialog.locator('#booking-next-date').click();
      await expect(dialog.locator('#booking-date')).toHaveValue('2026-10-09');
      await dialog.locator('#booking-slots').getByRole('radio').first().check();
      await continueIn(dialog).click();
      await expect(dialog.locator('#booking-review')).toContainText('20 min · C$ 150 NIO');
      await continueIn(dialog).click();
      await expect(dialog.getByRole('heading', { name: 'Simulación completada.' })).toBeFocused();
      await expect(
        dialog.getByText('No se ha creado ni enviado una cita.', { exact: true }),
      ).toBeVisible();
      await capture(page, `after-booking-complete-${viewport.width}`);
      await dialog.getByRole('button', { name: 'Nueva simulación' }).click();
      await expect(dialog.locator('#booking-services input:checked')).toHaveCount(0);
      await expect(continueIn(dialog)).toBeDisabled();
      await dialog.getByRole('button', { name: 'Cerrar y descartar demo' }).click();
      await expect(page.getByRole('link', { name: 'Reservar cita' })).toBeFocused();
      await page.getByRole('link', { name: 'Reservar cita' }).click();
      await expect(continueIn(dialog)).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      for (const card of await page.locator('.work-photo').all()) {
        await card.scrollIntoViewIfNeeded();
        await expect
          .poll(() => card.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0))
          .toBe(true);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, `after-booking-page-${viewport.width}`, true);
      expect(await page.context().cookies()).toEqual([]);
      expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([
        0, 0,
      ]);
      expect(
        requests.filter(
          ({ url, method }) => !url.startsWith('http://127.0.0.1:4173/') || method !== 'GET',
        ),
      ).toEqual([]);
      expect(errors).toEqual([]);
      await writeFile(
        `.private-evidence/ui-booking-manifest-${viewport.width}.json`,
        JSON.stringify(
          {
            commit: process.env.SOURCE_COMMIT || 'local-uncommitted',
            baselineCommit: '0755fce62688e380a737db9e267bad22e35acf25',
            viewport,
            url: page.url(),
            clock: clock.toISOString(),
            timezone: 'America/Managua',
            capture: 'Real Chrome/Chromium screenshots and WebM via Playwright; no compositing',
            checks: [
              'duration/price examples',
              'automatic any-professional assignment',
              'service invalidates slot',
              'closed Tuesday',
              'occupied Thursday',
              'next date',
              'edit/review/complete/reset',
              'Escape/focus/reopen',
              'same-origin GET only',
              'no storage/cookies',
            ],
          },
          null,
          2,
        ),
      );
    });
    test(`accessibility: booking steps ${viewport.width}`, async ({ page }) => {
      const dialog = await openDemo(page);
      const reports = [];
      for (const step of [1, 2, 3, 4]) {
        if (step === 2) await chooseService(dialog);
        if (step === 3) {
          await dialog.locator('#booking-slots').getByRole('radio').first().check();
          await continueIn(dialog).click();
        }
        if (step === 4) await continueIn(dialog).click();
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        reports.push({
          step,
          violations: result.violations,
          incomplete: result.incomplete,
          passes: result.passes.length,
        });
        expect(result.violations).toEqual([]);
      }
      await mkdir('.private-evidence', { recursive: true });
      await writeFile(
        `.private-evidence/ui-booking-axe-${viewport.width}.json`,
        JSON.stringify(reports, null, 2),
      );
    });
  });
}

test('booking keyboard trap, radio arrows, back, reset and Escape restore focus', async ({
  page,
}) => {
  const dialog = await openDemo(page);
  await page.keyboard.press('Shift+Tab');
  for (let i = 0; i < 18; i++) {
    expect(
      await page.evaluate(() =>
        document.querySelector('#booking-dialog').contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press('Tab');
  }
  const service = dialog.getByRole('radio', { name: /Corte clásico/ });
  await service.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: /^Barba / })).toBeChecked();
  expect(
    await dialog
      .getByRole('radio', { name: /^Barba / })
      .locator('..')
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe('none');
  await continueIn(dialog).click();
  await dialog.locator('#booking-slots').getByRole('radio').first().check();
  await continueIn(dialog).click();
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(dialog.locator('#booking-slots input:checked')).toHaveCount(1);
  await dialog.getByRole('radio', { name: /Profesional A/ }).check();
  await expect(continueIn(dialog)).toBeDisabled();
  await dialog.locator('#booking-reset').click();
  await expect(dialog.getByRole('heading', { name: 'Elegí tu servicio' })).toBeFocused();
  await expect(dialog.locator('#booking-services input:checked')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Reservar cita' })).toBeFocused();
});

test('booking reflow at 320px and 200% text with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dialog = await openDemo(page);
  for (const textSize of ['100%', '200%']) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, textSize);
    await dialog.locator('#booking-reset').click();
    for (const step of [1, 2, 3, 4]) {
      if (step === 2) await chooseService(dialog);
      if (step === 3) {
        await dialog.locator('#booking-slots').getByRole('radio').first().check();
        await continueIn(dialog).click();
      }
      if (step === 4) await continueIn(dialog).click();
      const focusBox = await dialog.locator(`[data-panel="${step}"] h3`).boundingBox();
      expect(focusBox.y, `Focused heading top at ${textSize}, step ${step}`).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        focusBox.y + focusBox.height,
        `Focused heading bottom at ${textSize}, step ${step}`,
      ).toBeLessThanOrEqual(568);
      const reflow = await dialog.evaluate((el) => ({
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
        offenders: [...el.querySelectorAll('*')]
          .filter(
            (node) => node.getBoundingClientRect().right > el.getBoundingClientRect().right + 1,
          )
          .map((node) => ({
            tag: node.tagName,
            class: node.className,
            text: node.textContent.slice(0, 80),
          })),
      }));
      expect(
        reflow.scrollWidth <= reflow.width,
        JSON.stringify({ textSize, step, ...reflow }),
      ).toBe(true);
      await expect(dialog.getByRole('button', { name: 'Cerrar y descartar demo' })).toBeVisible();
      for (const control of await dialog.locator('button:visible').all()) {
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await dialog.evaluate(
          (el) =>
            el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
        ),
      ).toBe(0);
    }
    await dialog.getByRole('button', { name: 'Nueva simulación' }).click();
  }
});

test('booking revalidates expired start before completing demo', async ({ page }) => {
  const dialog = await openDemo(page);
  await chooseService(dialog, /Corte clásico/);
  await dialog.getByRole('radio', { name: '10:00 a. m.', exact: true }).check();
  await continueIn(dialog).click();
  await page.clock.setSystemTime(new Date('2026-10-03T16:01:00Z'));
  await continueIn(dialog).click();
  await expect(dialog.getByRole('heading', { name: 'Encontrá tu horario' })).toBeFocused();
  await expect(continueIn(dialog)).toBeDisabled();
  await expect(dialog.locator('#booking-status')).toContainText('ya pasó o cambió');
});
