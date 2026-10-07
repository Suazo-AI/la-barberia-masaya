import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const key = 'labarberia:demo:v1';
const clock = new Date('2026-10-07T16:00:00Z');
const state = (page) => page.evaluate((name) => JSON.parse(localStorage.getItem(name)), key);
async function open(page, width = 390) {
  await page.clock.install({ time: clock });
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
  await page.goto('/demo.html');
  await expect(page.locator('#demo-slots button').first()).toBeVisible();
}
async function create(page) {
  await page.locator('#demo-slots button').first().click();
  await expect(page.locator('#demo-slots button[aria-pressed="true"]')).toBeFocused();
  await page.locator('#demo-submit').click();
  await expect(page.locator('#demo-feedback')).toContainText('Cita de prueba creada');
  await expect(page.locator('#demo-client-entries article')).toHaveCount(1);
}

for (const width of [390, 1440]) {
  test(`isolated demo books, moves, reloads, administers and cancels ${width}`, async ({
    page,
  }) => {
    const api = [];
    const errors = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') || request.method() !== 'GET') api.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, width);
    await mkdir('.private-evidence/demo', { recursive: true });
    await page.screenshot({ path: `.private-evidence/demo/start-${width}.png`, fullPage: true });
    await create(page);
    const before = (await state(page)).appointments.find((entry) => entry.source === 'client');
    await page.locator('#demo-client-entries').getByRole('button', { name: 'Reprogramar' }).click();
    await expect(page.locator('#demo-edit-dialog')).toBeVisible();
    await page.locator('#demo-edit-slots button').nth(1).click();
    await expect(page.locator('#demo-edit-slots button[aria-pressed="true"]')).toBeFocused();
    await page.locator('#demo-edit-save').click();
    await expect(page.locator('#demo-edit-dialog')).toBeHidden();
    await expect(page.locator('#demo-feedback')).toContainText('reprogramada');
    const moved = (await state(page)).appointments.find((entry) => entry.id === before.id);
    expect(moved.version).toBe(2);
    expect(moved.startMinute).not.toBe(before.startMinute);
    await page.reload();
    await expect(page.locator('#demo-client-entries article')).toHaveCount(1);
    await page.locator('#demo-admin-tab').click();
    await expect(page.locator('#demo-persona-note')).toContainText('Dueño');
    await page.locator('#demo-persona').selectOption('jonathan');
    await expect(page.locator('#demo-persona-note')).toContainText('Jonathan');
    await expect(
      page.locator(`#demo-admin-entries [data-appointment-id="${before.id}"]`),
    ).toBeVisible();
    await page.screenshot({ path: `.private-evidence/demo/admin-${width}.png`, fullPage: true });
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await page.locator('#demo-client-tab').click();
    await page
      .locator('#demo-client-entries')
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    await page.locator('#demo-confirm-action').click();
    await expect(page.locator('#demo-client-entries')).toContainText('Cancelada en la demo');
    expect((await state(page)).appointments.find((entry) => entry.id === before.id).status).toBe(
      'cancelled',
    );
    await page.screenshot({
      path: `.private-evidence/demo/cancelled-${width}.png`,
      fullPage: true,
    });
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
    await writeFile(
      `.private-evidence/demo/metadata-${width}.json`,
      JSON.stringify(
        {
          sourceCommit: process.env.SOURCE_COMMIT || 'local',
          viewport: { width },
          newRoute: true,
          priorVersionHadNoDemo: true,
          bookingMovesAndCancel: true,
          reloadPersistence: true,
          mockPersonas: ['Dueño', 'Jonathan'],
          productionApiRequests: api.length,
          axeViolations: axe.violations.length,
          axeIncomplete: axe.incomplete,
        },
        null,
        2,
      ),
    );
  });
}

test('demo administration blocks conflicts, unblocks, adds a visit and resets only mock data', async ({
  page,
}) => {
  await open(page, 1440);
  await page.evaluate(() => localStorage.setItem('unrelated-preference', 'keep'));
  await page.locator('#demo-admin-tab').click();
  await page.locator('#demo-block-professional').selectOption('demo-carlos');
  await page.locator('#demo-block-start').fill('15:00');
  await page.locator('#demo-block-end').fill('15:30');
  await page.locator('#demo-block-form button[type="submit"]').click();
  await expect(page.locator('#demo-admin-entries [data-block-id]')).toHaveCount(1);
  await page.locator('#demo-walkin-professional').selectOption('demo-carlos');
  await page.locator('#demo-walkin-time').fill('15:00');
  await page.locator('#demo-walkin-form button[type="submit"]').click();
  await expect(page.locator('#demo-feedback')).toHaveAttribute('data-error', 'true');
  expect((await state(page)).appointments.filter((entry) => entry.source === 'admin')).toHaveLength(
    0,
  );
  await page.getByRole('button', { name: 'Quitar bloqueo' }).click();
  await expect(page.locator('#demo-admin-entries [data-block-id]')).toHaveCount(0);
  await page.locator('#demo-walkin-form button[type="submit"]').click();
  await expect(page.locator('#demo-feedback')).toContainText('añadida');
  expect((await state(page)).appointments.filter((entry) => entry.source === 'admin')).toHaveLength(
    1,
  );
  await page.locator('#demo-reset').click();
  await page.locator('#demo-confirm-back').click();
  await expect(page.locator('#demo-reset')).toBeFocused();
  expect((await state(page)).appointments.filter((entry) => entry.source === 'admin')).toHaveLength(
    1,
  );
  await page.locator('#demo-reset').click();
  await page.locator('#demo-confirm-action').click();
  await expect(page.locator('#demo-feedback')).toContainText('reiniciada');
  await expect(page.locator('#demo-reset')).toBeFocused();
  expect((await state(page)).appointments.every((entry) => entry.source === 'seed')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep');
});

test('demo closes stale confirmations when another tab resets and reuses IDs', async ({
  page,
  context,
}) => {
  await open(page);
  await create(page);
  await page
    .locator('#demo-client-entries')
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  const other = await context.newPage();
  await open(other);
  await other.locator('#demo-reset').click();
  await other.locator('#demo-confirm-action').click();
  await expect(page.locator('#demo-confirm-dialog')).toBeHidden();
  await create(other);
  await expect(page.locator('#demo-client-entries article')).toHaveCount(1);
  await page.locator('#demo-confirm-action').evaluate((button) => button.click());
  expect((await state(page)).appointments.find((entry) => entry.source === 'client').status).toBe(
    'confirmed',
  );
  await other.close();
});

test('demo stays usable at 320px and 200% text with keyboard and modal cancellation', async ({
  page,
}) => {
  await page.route('**/demo.css', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nhtml { font-size: 200%; }` });
  });
  await open(page, 320);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
    '32px',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#demo-slots button').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#demo-slots button[aria-pressed="true"]')).toBeFocused();
  await page.locator('#demo-submit').click();
  await expect(page.locator('#demo-client-entries article')).toHaveCount(1);
  await page.locator('#demo-client-entries').getByRole('button', { name: 'Reprogramar' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#demo-edit-dialog')).toBeHidden();
  await expect(
    page.locator('#demo-client-entries').getByRole('button', { name: 'Reprogramar' }),
  ).toBeFocused();
  await page.locator('#demo-admin-tab').click();
  await page.locator('#demo-walkin-time').fill('15:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await mkdir('.private-evidence/demo', { recursive: true });
  await page.screenshot({ path: '.private-evidence/demo/admin-320-enlarged.png', fullPage: true });
});

test('storage-denied demo clearly uses memory and never sends an API request', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    }),
  );
  const api = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) api.push(request.url());
  });
  await open(page);
  await expect(page.locator('#demo-storage-status')).toContainText('no permite guardar');
  await create(page);
  await page.reload();
  await expect(page.locator('#demo-client-entries article')).toHaveCount(0);
  expect(api).toEqual([]);
});
