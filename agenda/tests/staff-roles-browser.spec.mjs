import { test, expect, request as apiRequest } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectViewportReflow, fillAndCheckAbsenceControls } from './reflow-diagnostics.mjs';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const api = '/api/agenda/v1';
const ownerUrl = process.env.STAFF_OWNER_URL || 'http://127.0.0.1:4186';
const barberUrl = process.env.STAFF_BARBER_URL || 'http://127.0.0.1:4184';
const baselineCommit = 'b3abca5b67ac2de7247c3f2d37801467c525473b';
const time = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const dateAfter = (date, offset) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
let owner;

test.beforeAll(async () => {
  owner = await apiRequest.newContext({
    baseURL: ownerUrl,
    extraHTTPHeaders: { Origin: ownerUrl },
  });
});
test.afterAll(async () => {
  await owner?.dispose();
});

async function post(path, body) {
  const result = await owner.post(`${api}${path}`, {
    data: body,
    headers: { 'Idempotency-Key': randomUUID() },
  });
  expect(result.ok(), `${path}: ${await result.text()}`).toBe(true);
  return result.json();
}

async function freeDay(professionalId, offset = 3) {
  const catalog = await (await owner.get(`${api}/catalog`)).json();
  const service = catalog.services[0];
  for (let index = offset; index <= 20; index++) {
    const date = dateAfter(catalog.dateRange.min, index);
    const result = await owner.get(
      `${api}/availability?${new URLSearchParams({ serviceId: service.id, professionalId, date })}`,
    );
    expect(result.ok()).toBe(true);
    const { slots } = await result.json();
    if (slots.length > 2) return { catalog, service, professionalId, date, slot: slots[0] };
  }
  throw new Error('No free fixture day for the staff UI test.');
}

async function seedBooking(day, name, professionalId = day.professionalId) {
  const receipt = await post('/admin/walk-ins', {
    configVersion: day.catalog.configVersion,
    serviceId: day.service.id,
    professionalId,
    date: day.date,
    startMinute: day.slot.startMinute,
    customer: { displayName: name },
  });
  return receipt.booking;
}

async function open(page, role, date) {
  await page.goto(`${role === 'owner' ? ownerUrl : barberUrl}/admin.html`);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#role-label')).toHaveText(
    role === 'owner' ? 'Acceso de propietario' : 'Acceso de barbero',
  );
  await page.locator('#schedule-date').fill(date);
  await page.getByRole('button', { name: 'Ver agenda', exact: true }).click();
  await expect(page.locator('#agenda-status')).toContainText(`Agenda del ${date} actualizada`);
}

async function fillAbsence(page, day, endDate = day.date) {
  await page.locator('#absence-start-date').fill(day.date);
  await page.locator('#absence-start-time').fill(time(day.slot.startMinute));
  await page.locator('#absence-end-date').fill(endDate);
  await page.locator('#absence-end-time').fill(time(day.slot.startMinute + 60));
  await page.locator('#absence-reason').fill('Ausencia ficticia para prueba');
}

async function reportAbsence(page) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith('/admin/absences') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Guardar ausencia', exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(201);
  return response.json();
}

async function schedule(day) {
  return (await owner.get(`${api}/admin/schedule?date=${day.date}&includeCancelled=true`)).json();
}

async function cancelSeed(day, booking) {
  await post(`/admin/bookings/${booking.id}/cancel`, {
    configVersion: day.catalog.configVersion,
    expectedVersion: booking.version,
  });
}

async function evidence(page, testInfo, name, details) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  await writeFile(
    testInfo.outputPath('staff-roles-metadata.json'),
    JSON.stringify(
      {
        sourceCommit: process.env.SOURCE_COMMIT || 'local-uncommitted',
        baselineCommit,
        capturedAt: new Date().toISOString(),
        url: page.url(),
        viewport: page.viewportSize(),
        mode: 'local fixture; no external notifications',
        ...details,
      },
      null,
      2,
    ),
  );
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`real pre-role baseline ${viewport.width}`, async ({ page }, testInfo) => {
    test.skip(!process.env.AGENDA_BASELINE_URL, 'Pinned pre-increment server is configured in CI.');
    await page.setViewportSize(viewport);
    await page.goto(`${process.env.AGENDA_BASELINE_URL}/admin.html`);
    await expect(page.locator('#admin-workspace')).toBeVisible();
    await expect(page.locator('#absence-form')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Registrar entrada', exact: true }),
    ).toBeVisible();
    await evidence(page, testInfo, `before-admin-${viewport.width}`, {
      sourceCommit: baselineCommit,
      requirement:
        'Real pre-increment common administrator UI; no separate barber-role UI existed at this commit.',
    });
    await page.locator('#block-title').scrollIntoViewIfNeeded();
  });

  for (const role of ['owner', 'barber']) {
    test(`real ${role} absence reports preserve bookings and support revocation ${viewport.width}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const day = await freeDay(role === 'owner' ? 'b' : 'a', viewport.width === 390 ? 8 : 3);
      const name = `Cita ficticia propia ${randomUUID().slice(0, 8)}`;
      const booking = await seedBooking(day, name);
      const foreign =
        role === 'barber'
          ? await seedBooking(day, `Cita ficticia ajena ${randomUUID().slice(0, 8)}`, 'b')
          : null;
      await open(page, role, day.date);
      await expect(page.locator('#booking-list')).toContainText(name);
      if (role === 'barber') {
        await expect(page.locator('#booking-list')).not.toContainText(foreign.customerDisplayName);
        await expect(page.locator('#schedule-professional')).toBeDisabled();
        await expect(page.locator('#schedule-professional option')).toHaveCount(1);
        await expect(page.locator('#absence-professional')).toBeDisabled();
        await expect(page.locator('#absence-professional')).toHaveValue('a');
        await expect(page.locator('#walkin-form')).not.toBeVisible();
        await expect(page.locator('#block-form')).not.toBeVisible();
        await expect(page.locator('#export-agenda')).not.toBeVisible();
        await expect(page.locator('#export-agenda')).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Gestionar cita' })).toHaveCount(0);
        let ownerWrites = 0;
        page.on('request', (request) => {
          if (/\/(walk-ins|blocks|export)(?:\?|$)/.test(request.url())) ownerWrites++;
        });
        await page
          .locator('#walkin-form')
          .evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
        await page
          .locator('#export-agenda')
          .evaluate((button) => button.dispatchEvent(new MouseEvent('click')));
        expect(ownerWrites).toBe(0);
      } else {
        await expect(page.locator('#walkin-form')).toBeVisible();
        await expect(page.locator('#export-agenda')).toBeEnabled();
        await page.locator('#absence-professional').selectOption(day.professionalId);
      }
      await page.getByRole('link', { name: 'Reportar ausencia', exact: true }).click();
      await fillAbsence(page, day, dateAfter(day.date, 1));
      const absence = await reportAbsence(page);
      expect(absence).toMatchObject({
        professionalId: day.professionalId,
        status: 'active',
        resolution: 'requires-resolution',
        affectedBookingIds: [booking.id],
      });
      await expect(page.locator('#absence-list')).toContainText(
        'coincidían al reportar y se señalaron para revisión del propietario',
      );
      await expect(page.locator('#booking-list')).toContainText('la cita sigue confirmada');
      expect(await page.locator('body').innerText()).not.toContain(booking.id);
      expect((await schedule(day)).bookings.find((entry) => entry.id === booking.id)).toEqual(
        booking,
      );
      const availability = await (
        await owner.get(
          `${api}/availability?${new URLSearchParams({ serviceId: day.service.id, professionalId: day.professionalId, date: day.date })}`,
        )
      ).json();
      expect(availability.slots.some((slot) => slot.startMinute > day.slot.startMinute)).toBe(
        false,
      );
      await page.locator('#schedule-title').scrollIntoViewIfNeeded();
      await evidence(page, testInfo, `after-${role}-${viewport.width}`, {
        role,
        requirement:
          'Role-aware own/all agenda, multi-day absence, preserved existing appointment, owner resolution warning, mobile reflow.',
      });
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const opener = page
        .locator('#absence-list')
        .getByRole('button', { name: 'Retirar ausencia' });
      await opener.click();
      await expect(page.locator('#manage-title')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
      await opener.click();
      await page.getByRole('button', { name: 'Retirar esta ausencia', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Mantener ausencia', exact: true }),
      ).toBeFocused();
      await expect(page.locator('#cancel-question')).toContainText(
        'tu cuenta y tu perfil se conservan',
      );
      await page.screenshot({
        path: testInfo.outputPath(`revoke-${role}-${viewport.width}.png`),
        fullPage: true,
      });
      const revokedResponse = page.waitForResponse((response) =>
        response.url().endsWith(`/absences/${absence.id}/revoke`),
      );
      await page.getByRole('button', { name: 'Confirmar retiro de ausencia', exact: true }).click();
      expect((await revokedResponse).status()).toBe(200);
      await expect(page.locator('#manage-dialog')).not.toBeVisible();
      await expect(page.locator('#absence-list')).toContainText('Ausencia retirada');
      await expect(page.locator('#absence-list')).toContainText(
        'coincidían al reportar y se señalaron para revisión del propietario',
      );
      await page.locator('#absence-list').scrollIntoViewIfNeeded();
      await evidence(page, testInfo, `revoked-history-${role}-${viewport.width}`, {
        role,
        requirement:
          'Revoking an absence retains its historical affected-appointment notice without claiming current unresolved status.',
      });
      expect((await schedule(day)).bookings.find((entry) => entry.id === booking.id)).toEqual(
        booking,
      );
      await cancelSeed(day, booking);
      if (foreign) await cancelSeed(day, foreign);
      expect(errors).toEqual([]);
    });
  }
}

test('barber uncertain absence creation and revocation replay the same key and body once', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const day = await freeDay('a', 12);
  await open(page, 'barber', day.date);
  await fillAbsence(page, day);
  const attempts = [];
  let saved;
  await page.route(`**${api}/admin/absences`, async (route) => {
    attempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (attempts.length === 1) {
      const result = await route.fetch();
      expect(result.status()).toBe(201);
      saved = await result.json();
      await route.abort('connectionfailed');
    } else if (attempts.length === 2) {
      await route.fulfill({ status: 200, json: { invalid: 'not an absence receipt' } });
    } else await route.continue();
  });
  // A tampered disabled select cannot override the server-scoped session mapping.
  await page.locator('#absence-professional').evaluate((select) => {
    select.add(new Option('Other fixture professional', 'b'));
    select.value = 'b';
  });
  await page.getByRole('button', { name: 'Guardar ausencia', exact: true }).click();
  await expect(page.locator('#absence-feedback')).toContainText(
    'No se pudo confirmar el resultado',
  );
  expect(attempts[0].body.professionalId).toBe('a');
  await expect(page.locator('#absence-start-time')).toBeDisabled();
  await expect(page.locator('#absence-professional')).toHaveValue('a');
  await page.locator('#absence-start-time').evaluate((input) => {
    input.value = '23:30';
  });
  await page
    .locator('#absence-form')
    .evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
  expect(attempts).toHaveLength(1);
  await page.locator('#retry-operation').click();
  await expect(page.locator('#retry-operation')).toBeEnabled();
  await expect(page.locator('#absence-start-time')).toHaveValue(time(day.slot.startMinute));
  await evidence(page, testInfo, 'barber-uncertain-absence-mobile', {
    role: 'barber',
    requirement:
      'Lost committed response and malformed replay preserve exact pending action, prevent repeat submission, restore fields and authoritative professional scope.',
  });
  await page.locator('#retry-operation').click();
  await expect(page.locator('#pending-operation')).not.toBeVisible();
  expect(attempts).toHaveLength(3);
  expect(attempts.every((attempt) => JSON.stringify(attempt) === JSON.stringify(attempts[0]))).toBe(
    true,
  );
  expect((await schedule(day)).absences.filter((entry) => entry.id === saved.id)).toHaveLength(1);
  const revokeAttempts = [];
  await page.route(`**${api}/admin/absences/${saved.id}/revoke`, async (route) => {
    revokeAttempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (revokeAttempts.length === 1) {
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      await route.abort('connectionfailed');
    } else await route.continue();
  });
  await page.locator('#absence-list').getByRole('button', { name: 'Retirar ausencia' }).click();
  await page.getByRole('button', { name: 'Retirar esta ausencia', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar retiro de ausencia', exact: true }).click();
  await expect(page.locator('#manage-feedback')).toContainText('No se pudo confirmar el resultado');
  await page.locator('#close-manage').click();
  await expect(page.locator('#absence-start-time')).toBeDisabled();
  await page.locator('#reload-agenda').click();
  await expect(page.locator('#retry-operation')).toBeEnabled();
  await page.locator('#retry-operation').click();
  await expect(page.locator('#pending-operation')).not.toBeVisible();
  expect(revokeAttempts).toHaveLength(2);
  expect(revokeAttempts[1]).toEqual(revokeAttempts[0]);
  expect((await schedule(day)).absences.find((entry) => entry.id === saved.id)).toMatchObject({
    status: 'revoked',
    version: 2,
  });
  await expect(page.locator('#absence-professional')).toBeDisabled();
});

test('barber reload after a lost committed absence response blocks new writes without storing details', async ({
  page,
}) => {
  const day = await freeDay('a', 16);
  await open(page, 'barber', day.date);
  await fillAbsence(page, day);
  let writes = 0;
  let saved;
  await page.route(`**${api}/admin/absences`, async (route) => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    saved = await response.json();
    await route.abort('connectionfailed');
  });
  await page.getByRole('button', { name: 'Guardar ausencia', exact: true }).click();
  await expect(page.locator('#absence-feedback')).toContainText(
    'No se pudo confirmar el resultado',
  );
  await page.reload();
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#absence-start-time')).toBeDisabled();
  await expect(page.locator('#retry-operation')).not.toBeVisible();
  await page
    .locator('#absence-form')
    .evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
  expect(writes).toBe(1);
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
    'agenda:pending:admin': '1',
  });
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
  await post(`/admin/absences/${saved.id}/revoke`, {
    configVersion: day.catalog.configVersion,
    expectedVersion: saved.version,
  });
});

test('barber session remains scoped at 320px, 200% text and reduced motion; unknown roles fail closed', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const day = await freeDay('a', 4);
  await open(page, 'barber', day.date);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await fillAndCheckAbsenceControls(page, testInfo, {
    'absence-start-date': day.date,
    'absence-start-time': time(day.slot.startMinute),
    'absence-end-date': dateAfter(day.date, 1),
    'absence-end-time': time(day.slot.startMinute + 60),
  });
  await expectViewportReflow(page, testInfo);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('#absence-start-date').focus();
  await page.keyboard.press('Tab');
  // Native date input may have internal segments; focus remains within the absence form.
  expect(
    await page.locator('#absence-form').evaluate((form) => form.contains(document.activeElement)),
  ).toBe(true);
  const staff = await apiRequest.newContext({ baseURL: barberUrl });
  expect((await staff.get(`${api}/admin/export`)).status()).toBe(403);
  await staff.dispose();
  await page.route(`**${api}/admin/session`, (route) =>
    route.fulfill({
      json: { role: 'unknown', capabilities: { manageShop: true, reportAbsence: true } },
    }),
  );
  await page.locator('#reload-agenda').click();
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  await expect(page.locator('#access-title')).toHaveText(
    'Acceso administrativo pendiente o no autorizado',
  );
  await expect(page.locator('#absence-list')).toBeEmpty();
});
