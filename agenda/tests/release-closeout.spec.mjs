import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const baselineCommit = '6efd7bb4fd101949c1deee9af00b7bc601028fb9';
const api = '/api/agenda/v1';
for (const width of [390, 1440]) {
  for (const phase of ['before', 'after']) {
    test(`closeout ${phase}: overlapping move and revoked history ${width}`, async ({
      page,
      request,
    }, testInfo) => {
      const origin =
        phase === 'before' ? process.env.AGENDA_CLOSEOUT_BASELINE_URL : 'http://127.0.0.1:4186';
      test.skip(!origin, 'Exact pre-closeout baseline is configured in CI.');
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const date = width === 390 ? '2026-10-23' : '2026-10-24';
      const token = randomBytes(32).toString('base64url');
      const post = async (path, body, bearer) => {
        const result = await request.post(`${origin}${api}${path}`, {
          headers: {
            Origin: origin,
            'Idempotency-Key': randomUUID(),
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          data: { configVersion: 1, ...body },
        });
        expect(result.ok()).toBe(true);
        return result.json();
      };
      const available = await (
        await request.get(
          `${origin}${api}/availability?serviceId=cut&professionalId=a&date=${date}`,
        )
      ).json();
      const slot = available.slots.find((candidate) =>
        available.slots.some((next) => next.startMinute === candidate.startMinute + 15),
      );
      expect(slot).toBeTruthy();
      let receipt = await post('/bookings', {
        serviceId: 'cut',
        professionalId: 'a',
        date,
        startMinute: slot.startMinute,
        managementToken: token,
      });
      await page.goto(`${origin}/manage.html#id=${receipt.booking.id}&token=${token}`);
      await expect(page.locator('#manage-booking')).toBeVisible();
      expect(new URL(page.url()).hash).toBe('');
      const requests = [];
      page.on('request', (request) =>
        requests.push({ url: request.url(), auth: request.headers().authorization }),
      );
      await page.getByRole('button', { name: 'Reprogramar', exact: true }).click();
      await expect(page.locator('#manage-slots input').first()).toBeVisible();
      const overlapping = page.locator(`#manage-slots input[value="${slot.startMinute + 15}"]`);
      if (phase === 'before') await expect(overlapping).toHaveCount(0);
      else {
        await expect(overlapping).toBeVisible();
        await overlapping.check();
        expect(
          requests.some(
            ({ url, auth }) =>
              url.includes(`/bookings/${receipt.booking.id}/availability?`) &&
              auth === `Bearer ${token}`,
          ),
        ).toBe(true);
      }
      expect(requests.some(({ url }) => url.includes(token))).toBe(false);
      await page.screenshot({
        path: testInfo.outputPath(`${phase}-overlapping-move-${width}.png`),
        fullPage: true,
      });
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
      if (phase === 'after') {
        const moved = page.waitForResponse((response) =>
          response.url().endsWith(`/bookings/${receipt.booking.id}/reschedule`),
        );
        await page.locator('#manage-confirm-move').click();
        receipt = await (await moved).json();
        expect(receipt.booking.startMinute).toBe(slot.startMinute + 15);
        await expect(page.locator('#manage-message')).toContainText('Cambio registrado');
      }
      const absence = await post('/admin/absences', {
        professionalId: 'a',
        startDate: date,
        endDate: date,
        startMinute: receipt.booking.startMinute,
        endMinute: receipt.booking.endMinute,
      });
      expect(absence.affectedBookingIds).toContain(receipt.booking.id);
      await post(`/admin/absences/${absence.id}/revoke`, { expectedVersion: 1 });
      await page.goto(`${origin}/admin.html`);
      await expect(page.locator('#admin-workspace')).toBeVisible();
      await page.locator('#schedule-date').fill(date);
      await page.locator('#schedule-filter').getByRole('button', { name: 'Ver agenda' }).click();
      await expect(page.locator('#absence-list')).toContainText('Ausencia retirada');
      await expect(page.locator('#absence-list .resolution-notice')).toHaveCount(
        phase === 'after' ? 1 : 0,
      );
      await page.locator('#absence-list').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`${phase}-revoked-history-${width}.png`),
        fullPage: true,
      });
      const adminAxe = await new AxeBuilder({ page }).analyze();
      expect(adminAxe.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await writeFile(
        testInfo.outputPath('closeout-metadata.json'),
        JSON.stringify(
          {
            sourceCommit:
              phase === 'before'
                ? baselineCommit
                : process.env.SOURCE_COMMIT || 'local-uncommitted',
            baselineCommit,
            phase,
            width,
            capturedAt: new Date().toISOString(),
            origin,
            mode: 'Isolated local fixture; no actual business data or external notifications',
            requirements: [
              'Own booking is excluded only by its scoped private availability endpoint',
              'Revoked absence keeps a historical affected-appointment notice',
            ],
            axe: { managementIncomplete: axe.incomplete, adminIncomplete: adminAxe.incomplete },
          },
          null,
          2,
        ),
      );
    });
  }
}
