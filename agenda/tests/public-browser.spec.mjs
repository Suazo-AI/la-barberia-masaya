import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const api = '**/api/agenda/v1';

async function open(page) {
  await page.goto('/');
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#booking-services input')).toHaveCount(3);
}

async function schedule(page, date = '2026-10-09') {
  await page.locator('#booking-services input[value="cut"]').check();
  await page.locator('#booking-continue').click();
  expect(date >= (await page.locator('#booking-date').getAttribute('min'))).toBe(true);
  expect(date <= (await page.locator('#booking-date').getAttribute('max'))).toBe(true);
  await page.locator('#booking-date').fill(date);
  await page.locator('#booking-date').dispatchEvent('change');
  await expect(page.locator('#booking-slots input').first()).toBeVisible();
}

async function review(page, date) {
  await schedule(page, date);
  await page.locator('#booking-slots input').first().check();
  await page.locator('#booking-continue').click();
  await expect(page.locator('#review-heading')).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`persistent booking and private cancellation/reschedule at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const leakedRequests = [];
    page.on('request', (request) => {
      if (/token=|managementToken=|Bearer%20/i.test(request.url()))
        leakedRequests.push(request.url());
    });
    await open(page);
    await review(page, width === 390 ? '2026-10-09' : '2026-10-10');
    await expect(page.locator('#booking-customer-name')).toBeDisabled();
    await expect(page.locator('#booking-customer-email')).toHaveValue('');
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/agenda/v1/bookings') &&
        response.request().method() === 'POST',
    );
    await page.locator('#booking-continue').click();
    const response = await created;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    await expect(page.locator('#complete-heading')).toHaveText('Reserva de prueba registrada.');
    await expect(page.locator('.booking-complete-message')).toContainText(
      'No es una cita del negocio',
    );
    await expect(page.locator('#booking-receipt')).toContainText(receipt.booking.professionalName);
    const management = await page.locator('#booking-manage-link').getAttribute('href');
    const capability = new URLSearchParams(new URL(management).hash.slice(1));
    expect(capability.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const mutationBody = response.request().postDataJSON();
    expect(mutationBody.customer).toBeUndefined();
    expect(mutationBody.configVersion).toBe(1);
    expect(mutationBody.managementToken).toBe(capability.get('token'));
    await page.locator('#booking-manage-link').click();
    await expect(page.locator('#manage-booking')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('#manage-receipt')).toContainText(receipt.booking.id);
    await page.locator('#manage-move').click();
    await page.locator('#manage-date').fill(width === 390 ? '2026-10-11' : '2026-10-12');
    await page.locator('#manage-date').dispatchEvent('change');
    await expect(page.locator('#manage-slots input').first()).toBeVisible();
    await page.locator('#manage-slots input').first().check();
    const moved = page.waitForResponse((result) =>
      result.url().endsWith(`/bookings/${receipt.booking.id}/reschedule`),
    );
    await page.locator('#manage-confirm-move').click();
    const movedResponse = await moved;
    expect(movedResponse.status()).toBe(200);
    expect(movedResponse.request().headers().authorization).toBe(
      `Bearer ${capability.get('token')}`,
    );
    expect(movedResponse.request().postDataJSON().expectedVersion).toBe(receipt.booking.version);
    await expect(page.locator('#manage-message')).toContainText('Cambio registrado');
    await page.locator('#manage-cancel').click();
    await page.locator('#manage-keep').click();
    await expect(page.locator('#manage-confirm-dialog')).not.toBeVisible();
    await expect(page.locator('#manage-receipt')).toContainText('Confirmada');
    await page.locator('#manage-cancel').click();
    await page.locator('#manage-confirm-cancel').click();
    await expect(page.locator('#manage-heading')).toHaveText('Reserva cancelada');
    await expect(page.locator('#manage-actions')).not.toBeVisible();
    expect(leakedRequests).toEqual([]);
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    expect(await page.context().cookies()).toEqual([]);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
  });
}

test('unconfigured catalog fails closed and can be retried', async ({ page }) => {
  let failing = true;
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST') writes += 1;
  });
  await page.route(`${api}/catalog`, (route) =>
    failing
      ? route.fulfill({ status: 503, json: { error: { code: 'CONFIGURATION_REQUIRED' } } })
      : route.continue(),
  );
  await page.goto('/');
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#service-heading')).toHaveText('Agenda pendiente de configuración');
  await expect(page.locator('#booking-services input')).toHaveCount(0);
  await expect(page.locator('#booking-continue')).not.toBeVisible();
  await expect(page.locator('#booking-message')).toContainText(
    'Todavía no acepta reservas del negocio',
  );
  failing = false;
  await page.locator('#booking-retry').click();
  await expect(page.locator('#booking-services input')).toHaveCount(3);
  expect(writes).toBe(0);
});

test('stale availability and closed days never retain a selected slot', async ({ page }) => {
  await open(page);
  await page.route(`${api}/availability?**`, async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date');
    if (!['2026-10-09', '2026-10-10'].includes(date)) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, date === '2026-10-09' ? 250 : 10));
    await route.fulfill({
      json: {
        date,
        mode: 'fixture',
        timeZone: 'America/Managua',
        reason: 'available',
        slots: [
          {
            startMinute: date === '2026-10-09' ? 660 : 780,
            endMinute: date === '2026-10-09' ? 690 : 810,
            professionalIds: ['a'],
          },
        ],
      },
    });
  });
  await page.locator('#booking-services input[value="cut"]').check();
  await page.locator('#booking-continue').click();
  await page.locator('#booking-date').fill('2026-10-09');
  await page.locator('#booking-date').dispatchEvent('change');
  await page.locator('#booking-date').fill('2026-10-10');
  await page.locator('#booking-date').dispatchEvent('change');
  await expect(page.locator('#booking-slots input')).toHaveCount(1);
  await expect(page.locator('#booking-slots input')).toHaveValue('780');
  await page.locator('#booking-slots input').check();
  await page.locator('#booking-date').fill('2026-10-06');
  await page.locator('#booking-date').dispatchEvent('change');
  await expect(page.locator('#booking-empty')).toBeVisible();
  await expect(page.locator('#booking-empty-message')).toContainText('No hay atención configurada');
  await expect(page.locator('#booking-slots input')).toHaveCount(0);
  await expect(page.locator('#booking-continue')).toBeDisabled();
});

test('an uncertain create retries the exact committed request across close and reopen', async ({
  page,
}) => {
  const requests = [];
  let disconnect = true;
  let original;
  await page.route(`${api}/bookings`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (disconnect) {
      disconnect = false;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      original = await response.json();
      return route.abort('connectionfailed');
    }
    return route.continue();
  });
  await open(page);
  await review(page, '2026-10-15');
  await page.locator('#booking-continue').click();
  await expect(page.locator('#booking-message')).toContainText(
    'No se pudo verificar si la reserva quedó guardada',
  );
  await expect(page.locator('#complete-heading')).not.toBeVisible();
  await expect(page.locator('#booking-reset')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#review-heading')).toBeVisible();
  const replay = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agenda/v1/bookings') && response.request().method() === 'POST',
  );
  await page.locator('#booking-retry').click();
  const replayed = await replay;
  expect(replayed.status()).toBe(201);
  expect(await replayed.json()).toEqual(original);
  await expect(page.locator('#complete-heading')).toHaveText('Reserva de prueba registrada.');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test('configuration conflict requires a new review before any new request', async ({ page }) => {
  let changed = false;
  let writes = 0;
  await page.route(`${api}/catalog`, async (route) => {
    if (!changed) return route.continue();
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.configVersion = 2;
    catalog.services[0].priceMinorUnits = 35000;
    return route.fulfill({ response, json: catalog });
  });
  await page.route(`${api}/bookings`, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    changed = true;
    writes += 1;
    return route.fulfill({ status: 409, json: { error: { code: 'CONFIGURATION_CHANGED' } } });
  });
  await open(page);
  await review(page, '2026-10-16');
  await page.locator('#booking-continue').click();
  await expect(page.locator('#service-heading')).toBeVisible();
  await expect(page.locator('#booking-services')).toContainText('350.00');
  await expect(page.locator('#booking-continue')).toBeDisabled();
  await expect(page.locator('#complete-heading')).not.toBeVisible();
  expect(writes).toBe(1);
});

test('keyboard, focus, profile selection and accessible reflow at 320px/200%', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/styles.css', async (route) => {
    const response = await route.fetch();
    return route.fulfill({ response, body: `${await response.text()}\nhtml { font-size:200%; }` });
  });
  await page.goto('/');
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#booking-services input')).toHaveCount(3);
  await schedule(page, '2026-10-17');
  await page.locator('#booking-slots input').first().check();
  await page.locator('[data-portfolio-open="a"]').click();
  await expect(page.locator('#booking-portfolio-empty')).toBeVisible();
  await expect(page.locator('#portfolio-heading')).toBeFocused();
  const box = await page.locator('#portfolio-heading').boundingBox();
  const dialog = await page.locator('#booking-dialog').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(dialog.y);
  expect(box.y + box.height).toBeLessThanOrEqual(dialog.y + dialog.height);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-portfolio-open="a"]')).toBeFocused();
  await expect(page.locator('#booking-slots input:checked')).toHaveCount(1);
  await page.locator('[data-portfolio-open="a"]').click();
  await page.locator('#booking-portfolio-select').click();
  await expect(page.locator('#booking-barbers input[value="a"]')).toBeChecked();
  await expect(page.locator('#booking-continue')).toBeDisabled();
  await expect(page.locator('#booking-slots input:checked')).toHaveCount(0);
  await expect(page.locator('#booking-slots input').first()).toBeVisible();
  await page.locator('#booking-reset').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-booking-close]')).toBeFocused();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-booking-open]')).toBeFocused();
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#booking-services input:checked')).toHaveCount(0);
});

test('customer page denies missing capabilities without requesting private booking data', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/agenda/v1/bookings/')) requests.push(request.url());
  });
  await page.goto('/manage.html');
  await expect(page.locator('#manage-message')).toContainText('Este enlace no permite acceder');
  await expect(page.locator('#manage-booking')).not.toBeVisible();
  expect(requests).toEqual([]);
});

test('changing service discards the old slot and requests the new duration', async ({ page }) => {
  await open(page);
  await schedule(page, '2026-10-18');
  await page.locator('#booking-slots input').first().check();
  await page.locator('#booking-continue').click();
  await page.locator('[data-step="1"]').click();
  await page.locator('#booking-services input[value="combo"]').check();
  const refreshed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/availability') && url.searchParams.get('serviceId') === 'combo';
  });
  await page.locator('[data-step="2"]').click();
  const availability = await (await refreshed).json();
  expect(availability.slots[0].endMinute - availability.slots[0].startMinute).toBe(50);
  await expect(page.locator('#booking-slots input').first()).toBeVisible();
  await expect(page.locator('#booking-slots input:checked')).toHaveCount(0);
  await expect(page.locator('#booking-continue')).toBeDisabled();
  await expect(page.locator('#booking-summary')).toContainText('50 min');
  await expect(page.locator('[data-step="3"]')).toBeDisabled();
});

test('private cancellation retries one committed request and reflows at 320px/200%', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await review(page, '2026-10-21');
  await page.locator('#booking-continue').click();
  await expect(page.locator('#complete-heading')).toBeVisible();
  await page.route('**/styles.css', async (route) => {
    const response = await route.fetch();
    return route.fulfill({ response, body: `${await response.text()}\nhtml { font-size:200%; }` });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#booking-manage-link').click();
  await expect(page.locator('#manage-booking')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(new URL(page.url()).hash).toBe('');
  const attempts = [];
  let disconnect = true;
  let original;
  await page.route(`${api}/bookings/*/cancel`, async (route) => {
    attempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
      authorization: route.request().headers().authorization,
    });
    if (disconnect) {
      disconnect = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      original = await response.json();
      return route.abort('connectionfailed');
    }
    return route.continue();
  });
  await page.locator('#manage-cancel').click();
  await expect(page.locator('#manage-confirm-heading')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#manage-cancel')).toBeFocused();
  await page.locator('#manage-cancel').click();
  await page.locator('#manage-confirm-cancel').click();
  await expect(page.locator('#manage-message')).toContainText('No se pudo verificar el resultado');
  await expect(page.locator('#manage-cancel')).toBeDisabled();
  await expect(page.locator('#manage-heading')).toHaveText('Mi reserva');
  const replay = page.waitForResponse(
    (response) => response.url().endsWith('/cancel') && response.request().method() === 'POST',
  );
  await page.locator('#manage-retry').click();
  const result = await replay;
  expect(result.status()).toBe(200);
  expect(await result.json()).toEqual(original);
  await expect(page.locator('#manage-heading')).toHaveText('Reserva cancelada');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0].body).toEqual({ expectedVersion: 1, configVersion: 1 });
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
});

test('a rejected retry cannot erase an uncertain Any-professional creation', async ({ page }) => {
  const attempts = [];
  const rejected = [
    { status: 429, code: 'RATE_LIMITED' },
    { status: 409, code: 'CONFIGURATION_CHANGED' },
    { status: 503, code: 'CONFIGURATION_REQUIRED' },
    { status: 403, code: 'FORBIDDEN' },
  ];
  let original;
  await page.route(`${api}/bookings`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (attempts.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      original = await response.json();
      return route.abort('connectionfailed');
    }
    const refusal = rejected[attempts.length - 2];
    if (refusal)
      return route.fulfill({ status: refusal.status, json: { error: { code: refusal.code } } });
    return route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await review(page, '2026-10-24');
  await page.locator('#booking-continue').click();
  await expect(page.locator('#booking-message')).toContainText(
    'No se pudo verificar si la reserva quedó guardada',
  );
  for (const refusal of rejected) {
    const response = page.waitForResponse(
      (result) =>
        result.url().endsWith('/api/agenda/v1/bookings') && result.status() === refusal.status,
    );
    await page.locator('#booking-retry').click();
    await response;
    await expect(page.locator('#booking-message')).toContainText(
      'No se pudo verificar si la reserva quedó guardada',
    );
    await expect(page.locator('#booking-reset')).toBeDisabled();
    await expect(page.locator('#booking-back')).toBeDisabled();
    await expect(page.locator('[data-step="1"]')).toBeDisabled();
    await expect(page.locator('#booking-continue')).not.toBeVisible();
    await expect(page.locator('#complete-heading')).not.toBeVisible();
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#review-heading')).toBeVisible();
  await expect(page.locator('#booking-reset')).toBeDisabled();
  const replay = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/agenda/v1/bookings') && response.request().method() === 'POST',
  );
  await page.locator('#booking-retry').click();
  const response = await replay;
  expect(response.status()).toBe(201);
  expect(await response.json()).toEqual(original);
  await expect(page.locator('#complete-heading')).toHaveText('Reserva de prueba registrada.');
  expect(attempts).toHaveLength(rejected.length + 2);
  expect(attempts[0].body.professionalId).toBeUndefined();
  for (const attempt of attempts) expect(attempt).toEqual(attempts[0]);
  const listing = await page.request.get('/api/agenda/v1/admin/schedule?date=2026-10-24');
  expect(listing.status()).toBe(200);
  const bookings = (await listing.json()).bookings.filter(
    (booking) =>
      booking.kind === 'booking' &&
      booking.startMinute === original.booking.startMinute &&
      booking.serviceId === original.booking.serviceId,
  );
  expect(bookings).toHaveLength(1);
  expect(bookings[0].id).toBe(original.booking.id);
});

for (const action of ['cancel', 'reschedule']) {
  test(`a rejected retry preserves the earlier uncertain private ${action}`, async ({ page }) => {
    await open(page);
    await review(page, action === 'cancel' ? '2026-10-19' : '2026-10-22');
    await page.locator('#booking-continue').click();
    await expect(page.locator('#complete-heading')).toBeVisible();
    const link = new URL(await page.locator('#booking-manage-link').getAttribute('href'));
    const capability = new URLSearchParams(link.hash.slice(1));
    await page.locator('#booking-manage-link').click();
    await expect(page.locator('#manage-booking')).toBeVisible();
    const attempts = [];
    const rejected = [
      { status: 429, code: 'RATE_LIMITED' },
      { status: 409, code: 'CONFIGURATION_CHANGED' },
      { status: 403, code: 'FORBIDDEN' },
    ];
    let original;
    await page.route(`${api}/bookings/*/${action}`, async (route) => {
      attempts.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataJSON(),
        authorization: route.request().headers().authorization,
      });
      if (attempts.length === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        original = await response.json();
        return route.abort('connectionfailed');
      }
      const refusal = rejected[attempts.length - 2];
      if (refusal)
        return route.fulfill({ status: refusal.status, json: { error: { code: refusal.code } } });
      return route.continue();
    });
    if (action === 'cancel') {
      await page.locator('#manage-cancel').click();
      await page.locator('#manage-confirm-cancel').click();
    } else {
      await page.locator('#manage-move').click();
      await expect(page.locator('#manage-slots input').first()).toBeVisible();
      await page.locator('#manage-slots input').first().check();
      await page.locator('#manage-confirm-move').click();
    }
    await expect(page.locator('#manage-message')).toContainText(
      'No se pudo verificar el resultado',
    );
    for (const refusal of rejected) {
      const response = page.waitForResponse(
        (result) =>
          new URL(result.url()).pathname.endsWith(`/${action}`) &&
          result.status() === refusal.status,
      );
      await page.locator('#manage-retry').click();
      await response;
      await expect(page.locator('#manage-message')).toContainText(
        'No se pudo verificar el resultado',
      );
      await expect(page.locator('#manage-cancel')).toBeDisabled();
      await expect(page.locator('#manage-move')).toBeDisabled();
      await expect(page.locator('#manage-confirm-move')).toBeDisabled();
      await expect(page.locator('#manage-date')).toBeDisabled();
      await expect(page.locator('#manage-heading')).toHaveText('Mi reserva');
    }
    const replay = page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname.endsWith(`/${action}`) &&
        result.request().method() === 'POST',
    );
    await page.locator('#manage-retry').click();
    const response = await replay;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(original);
    await expect(page.locator('#manage-message')).toContainText(
      action === 'cancel' ? 'Cancelación registrada' : 'Cambio registrado',
    );
    expect(attempts).toHaveLength(rejected.length + 2);
    for (const attempt of attempts) expect(attempt).toEqual(attempts[0]);
    const current = await page.request.get(`/api/agenda/v1/bookings/${capability.get('id')}`, {
      headers: { Authorization: `Bearer ${capability.get('token')}` },
    });
    expect(current.status()).toBe(200);
    const saved = await current.json();
    expect(saved.booking).toEqual(original.booking);
    expect(saved.booking.version).toBe(2);
  });
}

for (const interruption of ['lost response', 'in-flight response']) {
  test(`real document reload after ${interruption} blocks a second Any-professional create`, async ({
    page,
    request,
  }) => {
    let original;
    let writes = 0;
    let release;
    let committed;
    const responseHeld = new Promise((resolve) => (release = resolve));
    const didCommit = new Promise((resolve) => (committed = resolve));
    await page.route(`${api}/bookings`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      writes += 1;
      expect(route.request().postDataJSON().professionalId).toBeUndefined();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      original = await response.json();
      committed();
      if (interruption === 'in-flight response') await responseHeld;
      await route.abort('connectionfailed');
    });
    await open(page);
    await review(page, interruption === 'lost response' ? '2026-10-05' : '2026-10-08');
    await page.locator('#booking-continue').click();
    await didCommit;
    if (interruption === 'lost response')
      await expect(page.locator('#booking-message')).toContainText(
        'No se pudo verificar si la reserva quedó guardada',
      );
    else await expect(page.locator('#booking-dialog')).toHaveAttribute('aria-busy', 'true');
    expect(
      await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    ).toEqual({ local: {}, session: { 'agenda:pending:create': '1' } });
    const before = await (
      await request.get(`/api/agenda/v1/admin/schedule?date=${original.booking.date}`)
    ).json();
    // This is an actual new document, not the dialog close or catalog refresh.
    await page.reload();
    release();
    await page.locator('[data-booking-open]').click();
    await expect(page.locator('#service-heading')).toHaveText('Solicitud pendiente de verificar');
    await expect(page.locator('#booking-message')).toContainText('Pedí a un administrador');
    await expect(page.locator('#booking-services input')).toHaveCount(0);
    await expect(page.locator('#booking-continue')).not.toBeVisible();
    await expect(page.locator('#booking-retry')).not.toBeVisible();
    await expect(page.locator('#complete-heading')).not.toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('[data-booking-open]').click();
    await expect(page.locator('#booking-message')).toContainText(
      'solicitud pendiente de verificar',
    );
    expect(writes).toBe(1);
    const after = await (
      await request.get(`/api/agenda/v1/admin/schedule?date=${original.booking.date}`)
    ).json();
    expect(after.bookings).toEqual(before.bookings);
    expect(after.bookings.filter(({ id }) => id === original.booking.id)).toHaveLength(1);
    expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
      'agenda:pending:create': '1',
    });
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
  });
}

test('real private-page reload loses the capability safely and keeps mutations blocked on retained-link read', async ({
  page,
  request,
}) => {
  await open(page);
  await review(page, '2026-10-14');
  await page.locator('#booking-continue').click();
  await expect(page.locator('#complete-heading')).toBeVisible();
  const link = await page.locator('#booking-manage-link').getAttribute('href');
  const capability = new URLSearchParams(new URL(link).hash.slice(1));
  await page.locator('#booking-manage-link').click();
  await expect(page.locator('#manage-booking')).toBeVisible();
  const writes = [];
  await page.route(`${api}/bookings/*/reschedule`, async (route) => {
    writes.push(route.request().postDataJSON());
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    return route.abort('connectionfailed');
  });
  await page.locator('#manage-move').click();
  await expect(page.locator('#manage-slots input').first()).toBeVisible();
  await page.locator('#manage-slots input').first().check();
  await page.locator('#manage-confirm-move').click();
  await expect(page.locator('#manage-message')).toContainText('No se pudo verificar el resultado');
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
    'agenda:pending:manage': '1',
  });
  const reads = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/api/agenda/v1/bookings/'))
      reads.push(req.url());
  });
  await page.reload();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#manage-message')).toContainText('reabrilo para consultar el estado');
  await expect(page.locator('#manage-booking')).not.toBeVisible();
  expect(reads).toEqual([]);
  // The user supplies the original private link again. Its fragment is consumed
  // and scrubbed; a successful current read alone cannot settle an older write.
  await page.goto(link);
  await expect(page.locator('#manage-booking')).toBeVisible();
  await expect(page.locator('#manage-message')).toContainText('Pedí a un administrador');
  await expect(page.locator('#manage-cancel')).toBeDisabled();
  await expect(page.locator('#manage-move')).toBeDisabled();
  expect(new URL(page.url()).hash).toBe('');
  expect(new URL(page.url()).search).toBe('');
  await page.locator('#manage-retry').click();
  await expect(page.locator('#manage-cancel')).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
    'agenda:pending:manage': '1',
  });
  const current = await request.get(`/api/agenda/v1/bookings/${capability.get('id')}`, {
    headers: { Authorization: `Bearer ${capability.get('token')}` },
  });
  expect(current.status()).toBe(200);
  expect((await current.json()).booking).toMatchObject({
    version: 2,
    date: writes[0].date,
    startMinute: writes[0].startMinute,
  });
});

test('unavailable session storage fails closed before public creation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('Blocked in regression test', 'SecurityError');
      },
    });
  });
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST') writes += 1;
  });
  await page.goto('/');
  await page.locator('[data-booking-open]').click();
  await expect(page.locator('#booking-message')).toContainText(
    'El navegador no permite conservar la protección',
  );
  await expect(page.locator('#booking-services input')).toHaveCount(0);
  await expect(page.locator('#booking-continue')).not.toBeVisible();
  expect(writes).toBe(0);
});

for (const flow of ['create', 'private cancel']) {
  test(`temporary storage write failure preserves the uncertain ${flow} retry and exact request`, async ({
    page,
  }) => {
    await open(page);
    await review(page, flow === 'create' ? '2026-10-16' : '2026-10-23');
    if (flow === 'private cancel') {
      await page.locator('#booking-continue').click();
      await expect(page.locator('#complete-heading')).toBeVisible();
      await page.locator('#booking-manage-link').click();
      await expect(page.locator('#manage-booking')).toBeVisible();
    }
    const attempts = [];
    let original;
    const path = flow === 'create' ? '/bookings' : '/bookings/*/cancel';
    await page.route(`${api}${path}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataJSON(),
        authorization: route.request().headers().authorization,
      });
      if (attempts.length !== 1) return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(flow === 'create' ? 201 : 200);
      original = await response.json();
      return route.abort('connectionfailed');
    });
    const message = page.locator(flow === 'create' ? '#booking-message' : '#manage-message');
    const retry = page.locator(flow === 'create' ? '#booking-retry' : '#manage-retry');
    if (flow === 'create') await page.locator('#booking-continue').click();
    else {
      await page.locator('#manage-cancel').click();
      await page.locator('#manage-confirm-cancel').click();
    }
    await expect(message).toContainText('No se pudo verificar');
    await expect(retry).toBeVisible();
    // A transient quota/security failure must not discard the existing request
    // or hide its only retry control. Reads of the existing marker still work.
    await page.evaluate(() => {
      window.restoreAgendaStorageForTest = () => {
        Storage.prototype.setItem = originalSetItem;
        delete window.restoreAgendaStorageForTest;
      };
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('agenda:pending:'))
          throw new DOMException('Temporary storage denial', 'QuotaExceededError');
        return originalSetItem.call(this, key, value);
      };
    });
    await retry.click();
    await expect(message).toContainText('El navegador no permite conservar la protección');
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    expect(attempts).toHaveLength(1);
    await expect(
      page.locator(flow === 'create' ? '#booking-reset' : '#manage-cancel'),
    ).toBeDisabled();
    expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
      [`agenda:pending:${flow === 'create' ? 'create' : 'manage'}`]: '1',
    });
    await page.evaluate(() => window.restoreAgendaStorageForTest());
    const replay = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(flow === 'create' ? '/bookings' : '/cancel'),
    );
    await retry.click();
    const response = await replay;
    expect(response.status()).toBe(flow === 'create' ? 201 : 200);
    expect(await response.json()).toEqual(original);
    await expect(
      page.locator(flow === 'create' ? '#complete-heading' : '#manage-heading'),
    ).toHaveText(flow === 'create' ? 'Reserva de prueba registrada.' : 'Reserva cancelada');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({});
  });
}
