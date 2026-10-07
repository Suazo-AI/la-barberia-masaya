import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('labarberia:demo:v1')));
for (const width of [390, 1440]) {
  test(`homepage books, shares its appointment with administration, moves and cancels ${width}`, async ({
    page,
    browser,
  }) => {
    await mkdir('.private-evidence/main-booking', { recursive: true });
    const viewport = { width, height: 900 };
    if (process.env.MAIN_BOOKING_BASELINE_URL) {
      const before = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await before.goto(process.env.MAIN_BOOKING_BASELINE_URL);
      await before.getByRole('link', { name: 'Reservar cita', exact: true }).click();
      await expect(before.locator('#service-heading')).toContainText('configuración');
      await before.screenshot({
        path: `.private-evidence/main-booking/before-disabled-${width}.png`,
      });
      await before.close();
    }
    await page.clock.install({ time: new Date('2026-10-07T16:00:00Z') });
    await page.setViewportSize(viewport);
    const api = [],
      errors = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') || request.method() !== 'GET') api.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.hero a')).toHaveCount(1);
    const main = page.getByRole('link', { name: 'Reservar cita', exact: true });
    await expect(main).toHaveAttribute('href', './demo.html#reservar');
    await main.click();
    await expect(page).toHaveURL(/\/demo\.html#reservar$/);
    await page.locator('#demo-service').selectOption('combo');
    await page.locator('#demo-professional').selectOption('demo-carlos');
    await page.locator('#demo-slots button').first().click();
    await page.locator('#demo-submit').click();
    await expect(page.locator('#demo-feedback')).toContainText('Cita de prueba creada');
    const created = (await state(page)).appointments.find((item) => item.source === 'client');
    expect(created.serviceId).toBe('combo');
    expect(created.professionalId).toBe('demo-carlos');
    expect(created.status).toBe('confirmed');
    await page.screenshot({
      path: `.private-evidence/main-booking/after-created-${width}.png`,
      fullPage: true,
    });
    await page.locator('#demo-admin-tab').click();
    await expect(page).toHaveURL(/#administracion$/);
    await page.goBack();
    await page.locator('#demo-client-entries').getByRole('button', { name: 'Reprogramar' }).click();
    await page.goForward();
    await expect(page.locator('#demo-edit-dialog')).toBeHidden();
    await expect(page.locator('#demo-admin-tab')).toBeFocused();
    await page.goBack();
    await page
      .locator('#demo-client-entries')
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    await page.goForward();
    await expect(page.locator('#demo-confirm-dialog')).toBeHidden();
    await expect(page.locator('#demo-admin-tab')).toBeFocused();
    await page.locator('#demo-confirm-action').evaluate((button) => button.click());
    expect((await state(page)).appointments.find((item) => item.id === created.id).status).toBe(
      'confirmed',
    );
    await expect(page.locator('#demo-persona-note')).toContainText('Dueño');
    const adminRecord = page.locator(`#demo-admin-entries [data-appointment-id="${created.id}"]`);
    await expect(adminRecord).toContainText('Corte + barba');
    await expect(adminRecord).toContainText('C$300');
    await page.locator('#demo-persona').selectOption('jonathan');
    await expect(page.locator('#demo-persona-note')).toContainText('Jonathan');
    await expect(adminRecord).toBeVisible();
    await page.screenshot({
      path: `.private-evidence/main-booking/after-admin-${width}.png`,
      fullPage: true,
    });
    await page.locator('#demo-persona').focus();
    await page.goBack();
    await expect(page).toHaveURL(/#reservar$/);
    await expect(page.locator('#demo-client-pane')).toBeVisible();
    await expect(page.locator('#demo-client-tab')).toBeFocused();
    await page.goForward();
    await expect(page.locator('#demo-admin-pane')).toBeVisible();
    await adminRecord.getByRole('button', { name: 'Reprogramar' }).focus();
    await page.goBack();
    await expect(page.locator('#demo-client-tab')).toBeFocused();
    await page.reload();
    const ownRecord = page.locator(`#demo-client-entries [data-appointment-id="${created.id}"]`);
    await expect(ownRecord).toBeVisible();
    await ownRecord.getByRole('button', { name: 'Reprogramar' }).click();
    await page.locator('#demo-edit-slots button').nth(1).click();
    await page.locator('#demo-edit-save').click();
    await expect(page.locator('#demo-edit-dialog')).toBeHidden();
    const moved = (await state(page)).appointments.find((item) => item.id === created.id);
    expect(moved.version).toBe(2);
    expect(moved.startMinute).not.toBe(created.startMinute);
    await ownRecord.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('#demo-confirm-action').click();
    await expect(ownRecord).toContainText('Cancelada en la demo');
    await page.getByRole('link', { name: 'Volver al sitio de La Barbería' }).click();
    await page.getByRole('link', { name: 'Abrir agenda administrativa · demo' }).click();
    await expect(page).toHaveURL(/\/demo\.html#administracion$/);
    await expect(page.locator('#demo-admin-pane')).toBeVisible();
    await expect(
      page.locator(`#demo-admin-entries [data-appointment-id="${created.id}"]`),
    ).toContainText('Cancelada en la demo');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
    await writeFile(
      `.private-evidence/main-booking/metadata-${width}.json`,
      JSON.stringify(
        {
          sourceCommit: process.env.SOURCE_COMMIT || 'local',
          baselineCommit: 'd6b9f2121ce71c585ba6e52d08cd6c80d5f8190a',
          viewport,
          startedAtHomepage: true,
          createdAndSharedSameId: created.id,
          rescheduled: true,
          cancelled: true,
          adminPersonas: ['Dueño', 'Jonathan'],
          reloadPersistence: true,
          backForward: true,
          productionApiRequests: api,
          axeViolations: axe.violations.length,
        },
        null,
        2,
      ),
    );
  });
}
