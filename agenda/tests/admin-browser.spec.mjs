import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

if (process.env.ADMIN_BASE_URL) test.use({ baseURL: process.env.ADMIN_BASE_URL });

const api = '/api/agenda/v1';
const time = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const dateAfter = (date, offset) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

async function catalogFor(request) {
  const response = await request.get(`${api}/catalog`);
  expect(response.status()).toBe(200);
  const catalog = await response.json();
  expect(catalog.mode).toBe('fixture');
  return catalog;
}

async function findFreeDay(request, catalog, offset = 3) {
  const service = catalog.services[0];
  const professionalId = service.professionalIds[0];
  for (let index = offset; index < offset + 6; index++) {
    const date = dateAfter(catalog.dateRange.min, index);
    const query = new URLSearchParams({ serviceId: service.id, professionalId, date });
    const response = await request.get(`${api}/availability?${query}`);
    expect(response.status()).toBe(200);
    const availability = await response.json();
    if (availability.slots.length >= 4)
      return { service, professionalId, date, slots: availability.slots };
  }
  throw new Error('Fixture has no suitable free date for the admin integration test.');
}

async function openAdmin(page, date) {
  await page.goto('/admin.html');
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#mode-notice')).toContainText('PRUEBA LOCAL');
  if (date) {
    await page.locator('#schedule-date').fill(date);
    await page.getByRole('button', { name: 'Ver agenda', exact: true }).click();
    await expect(page.locator('#agenda-status')).toContainText(`Agenda del ${date} actualizada`);
  }
}

async function createWalkIn(page, freeDay, name) {
  await page.locator('#walkin-service').selectOption(freeDay.service.id);
  await page.locator('#walkin-professional').selectOption(freeDay.professionalId);
  await page.locator('#walkin-date').fill(freeDay.date);
  await page.locator('#walkin-time').fill(time(freeDay.slots[0].startMinute));
  await page.locator('#walkin-name').fill(name);
  const result = page.waitForResponse(
    (response) =>
      response.url().endsWith('/admin/walk-ins') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click();
  const response = await result;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  expect(receipt.booking.kind).toBe('walk-in');
  expect(receipt.notification).toBe('disabled');
  await expect(page.locator('#booking-list')).toContainText(name);
  return receipt.booking;
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`real fixture admin walk-in, block, rollback, reschedule, cancel and private export ${viewport.width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    const catalog = await catalogFor(request);
    const day = await findFreeDay(request, catalog, viewport.width === 1440 ? 3 : 8);
    await openAdmin(page, day.date);
    const name = `Cliente ficticio de panel ${viewport.width} ${randomUUID().slice(0, 8)}`;
    const booking = await createWalkIn(page, day, name);
    const blockSlot = day.slots.at(-1);
    await page.locator('#block-professional').selectOption(day.professionalId);
    await page.locator('#block-date').fill(day.date);
    await page.locator('#block-start').fill(time(blockSlot.startMinute));
    await page.locator('#block-end').fill(time(blockSlot.endMinute));
    await page.locator('#block-label').fill(`Bloqueo ficticio de panel ${viewport.width}`);
    const blockResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/admin/blocks') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Crear bloqueo', exact: true }).click();
    const createdBlock = await blockResponse;
    expect(createdBlock.status()).toBe(201);
    const block = await createdBlock.json();
    await expect(page.locator('#block-list')).toContainText(block.label);
    const bookingCard = page.locator('#booking-list article').filter({ hasText: name });
    await bookingCard.getByRole('button', { name: 'Gestionar cita' }).click();
    const modal = page.locator('#manage-dialog');
    await expect(modal).toBeVisible();
    await page.locator('#reschedule-time').fill(time(blockSlot.startMinute));
    const conflictResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/bookings/${booking.id}/reschedule`),
    );
    await page.getByRole('button', { name: 'Guardar nuevo horario', exact: true }).click();
    expect((await conflictResponse).status()).toBe(409);
    await expect(page.locator('#manage-feedback')).toContainText('la cita anterior se conserva');
    await expect(page.locator('#manage-summary')).toContainText(time(booking.startMinute));
    const originalSchedule = await request.get(
      `${api}/admin/schedule?date=${day.date}&includeCancelled=true`,
    );
    expect(
      (await originalSchedule.json()).bookings.find((entry) => entry.id === booking.id).startMinute,
    ).toBe(booking.startMinute);
    const availability = await request.get(
      `${api}/availability?${new URLSearchParams({ serviceId: day.service.id, professionalId: day.professionalId, date: day.date })}`,
    );
    const replacement = (await availability.json()).slots[0];
    await page.locator('#reschedule-time').fill(time(replacement.startMinute));
    const movedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/bookings/${booking.id}/reschedule`),
    );
    await page.getByRole('button', { name: 'Guardar nuevo horario', exact: true }).click();
    expect((await movedResponse).status()).toBe(200);
    await expect(modal).not.toBeVisible();
    await expect(bookingCard).toContainText(time(replacement.startMinute));
    await bookingCard.getByRole('button', { name: 'Gestionar cita' }).click();
    await page.getByRole('button', { name: 'Cancelar cita', exact: true }).click();
    await expect(page.locator('#keep-booking')).toBeFocused();
    const cancellationResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/bookings/${booking.id}/cancel`),
    );
    await page.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    expect((await cancellationResponse).status()).toBe(200);
    await expect(modal).not.toBeVisible();
    await expect(bookingCard).toContainText('Cancelada');
    await page
      .locator('#block-list article')
      .filter({ hasText: block.label })
      .getByRole('button', { name: 'Quitar bloqueo' })
      .click();
    await page.getByRole('button', { name: 'Quitar este bloqueo', exact: true }).click();
    const unblockResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/blocks/${block.id}/cancel`),
    );
    await page.getByRole('button', { name: 'Confirmar retiro del bloqueo', exact: true }).click();
    expect((await unblockResponse).status()).toBe(200);
    await expect(modal).not.toBeVisible();
    await expect(page.locator('#block-list')).toContainText('Bloqueo retirado');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar respaldo', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^agenda-backup-v1-\d{4}-\d{2}-\d{2}\.json$/);
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(backup.format).toBe('portable-agenda');
    expect(backup.version).toBe(1);
    expect(JSON.stringify(backup.tables)).toContain(booking.id);
    expect(JSON.stringify(backup.tables)).toContain(block.id);
    const finalSchedule = await request.get(
      `${api}/admin/schedule?date=${day.date}&includeCancelled=true`,
    );
    const final = await finalSchedule.json();
    expect(final.bookings.find((entry) => entry.id === booking.id)).toMatchObject({
      status: 'cancelled',
      version: booking.version + 2,
    });
    expect(final.blocks.find((entry) => entry.id === block.id)).toMatchObject({
      status: 'cancelled',
      version: block.version + 1,
    });
    expect(failures).toEqual([]);
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
        cookies: document.cookie,
      })),
    ).toEqual({ local: 0, session: 0, cookies: '' });
  });
}

for (const status of [401, 403, 503]) {
  test(`admin safely hides workspace and ignores private error text on ${status}`, async ({
    page,
    request,
  }) => {
    const catalog = await catalogFor(request);
    await page.route(`**${api}/catalog`, (route) => route.fulfill({ json: catalog }));
    await page.route(`**${api}/admin/schedule?**`, (route) =>
      route.fulfill({
        status,
        json: {
          error: {
            code: status === 503 ? 'CONFIGURATION_REQUIRED' : 'FORBIDDEN',
            message: 'private customer must never be rendered',
          },
        },
      }),
    );
    await page.goto('/admin.html');
    await expect(page.locator('#access-panel')).toBeVisible();
    await expect(page.locator('#admin-workspace')).not.toBeVisible();
    await expect(page.locator('#access-title')).toHaveText(
      status === 503
        ? 'Agenda pendiente de configuración'
        : 'Acceso administrativo pendiente o no autorizado',
    );
    expect(await page.locator('body').innerText()).not.toContain('private customer');
    await expect(page.locator('#booking-list')).toBeEmpty();
    await expect(page.locator('#block-list')).toBeEmpty();
  });
}

test('real committed walk-in with lost response retries the same key and creates one entry', async ({
  page,
  request,
}) => {
  const catalog = await catalogFor(request);
  const day = await findFreeDay(request, catalog, 13);
  await openAdmin(page, day.date);
  const submissions = [];
  let persistedBooking;
  await page.route(`**${api}/admin/walk-ins`, async (route) => {
    submissions.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (submissions.length === 1) {
      const result = await route.fetch();
      expect(result.status()).toBe(201);
      persistedBooking = (await result.json()).booking;
      await route.abort('failed');
    } else await route.continue();
  });
  const name = `Cliente ficticio de reintento ${randomUUID().slice(0, 8)}`;
  await page.locator('#walkin-service').selectOption(day.service.id);
  await page.locator('#walkin-professional').selectOption(day.professionalId);
  await page.locator('#walkin-date').fill(day.date);
  await page.locator('#walkin-time').fill(time(day.slots[0].startMinute));
  await page.locator('#walkin-name').fill(name);
  await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click();
  await expect(page.locator('#walkin-feedback')).toContainText('No se pudo confirmar el resultado');
  await expect(page.locator('#walkin-name')).toHaveValue(name);
  const retryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/admin/walk-ins') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click();
  expect((await retryResponse).status()).toBe(201);
  await expect(page.locator('#booking-list')).toContainText(name);
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  expect(submissions[0].body.configVersion).toBe(catalog.configVersion);
  const response = await request.get(
    `${api}/admin/schedule?date=${day.date}&includeCancelled=true`,
  );
  const matching = (await response.json()).bookings.filter(
    (booking) => booking.customerDisplayName === name,
  );
  expect(matching).toHaveLength(1);
  expect(matching[0].id).toBe(persistedBooking.id);
  await page.route(`**${api}/admin/schedule?**`, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: 'FORBIDDEN', message: 'private failure' } },
    }),
  );
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain(name);
  await expect(page.locator('#walkin-name')).toHaveValue('');
});

test('admin accessibility, native focus and reflow at 320px / 200% text / reduced motion', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const catalog = await catalogFor(request);
  const day = await findFreeDay(request, catalog, 17);
  const name = `Cliente ficticio de accesibilidad ${randomUUID().slice(0, 8)}`;
  await openAdmin(page, day.date);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await createWalkIn(page, day, name);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const opener = page
    .locator('#booking-list article')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Gestionar cita' });
  await opener.click();
  const modal = page.locator('#manage-dialog');
  await expect(page.locator('#manage-title')).toBeFocused();
  await expect(page.locator('#manage-mode')).toContainText('PRUEBA LOCAL');
  const titleBox = await page.locator('#manage-title').boundingBox();
  expect(titleBox.y).toBeGreaterThanOrEqual(0);
  expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(568);
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const dialogAxe = await new AxeBuilder({ page }).analyze();
  expect(dialogAxe.violations).toEqual([]);
  await page.locator('#request-cancel').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#close-manage')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#request-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(opener).toBeFocused();
  const controls = await page
    .locator('#admin-workspace button, #admin-workspace input, #admin-workspace select')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length)
        .map((element) => ({
          height: element.getBoundingClientRect().height,
          width: element.getBoundingClientRect().width,
        })),
    );
  expect(controls.every((control) => control.height >= 44 && control.width >= 44)).toBe(true);
});

test('simulated stale configuration refresh requires review and uses a new request version/key', async ({
  page,
  request,
}) => {
  const catalog = await catalogFor(request);
  const day = await findFreeDay(request, catalog, 19);
  const name = `Cliente ficticio de revisión ${randomUUID().slice(0, 8)}`;
  await openAdmin(page, day.date);
  const booking = await createWalkIn(page, day, name);
  const attempts = [];
  await page.route(`**${api}/admin/bookings/${booking.id}/reschedule`, async (route) => {
    attempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: attempts.length === 1 ? 'CONFIGURATION_CHANGED' : 'SLOT_UNAVAILABLE',
          message: 'controlled UI error',
        },
      },
    });
  });
  await page
    .locator('#booking-list article')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Gestionar cita' })
    .click();
  await page.locator('#reschedule-time').fill(time(day.slots[1].startMinute));
  await page.getByRole('button', { name: 'Guardar nuevo horario', exact: true }).click();
  await expect(page.locator('#refresh-manage')).toBeVisible();
  expect(attempts).toHaveLength(1);
  await page.route(`**${api}/catalog`, (route) =>
    route.fulfill({ json: { ...catalog, configVersion: catalog.configVersion + 1 } }),
  );
  await page
    .getByRole('button', { name: 'Actualizar configuración y revisar', exact: true })
    .click();
  await expect(page.locator('#manage-feedback')).toContainText('Configuración actualizada');
  expect(attempts).toHaveLength(1);
  await expect(page.locator('#reschedule-time')).toHaveValue(time(day.slots[1].startMinute));
  await page.getByRole('button', { name: 'Guardar nuevo horario', exact: true }).click();
  await expect(page.locator('#manage-feedback')).toContainText('Ese horario está ocupado');
  expect(attempts).toHaveLength(2);
  expect(attempts[0].body.configVersion).toBe(catalog.configVersion);
  expect(attempts[1].body.configVersion).toBe(catalog.configVersion + 1);
  expect(attempts[1].key).not.toBe(attempts[0].key);
  expect(attempts[1].body.expectedVersion).toBe(booking.version);
  await expect(page.locator('#manage-summary')).toContainText(time(booking.startMinute));
});
