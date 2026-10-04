import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 320, height: 568 },
]) {
  test(`unconfigured agenda fails closed and returns keyboard focus ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (viewport.width === 320)
      await page.route('**/styles.css', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nhtml { font-size: 200%; }`,
        });
      });
    await page.goto('/');
    const opener = page.getByRole('link', { name: 'Reservar cita', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/configuración/i);
    await expect(dialog.locator('#booking-services input')).toHaveCount(0);
    await expect(dialog.locator('#booking-continue')).toBeDisabled();
    await expect(dialog.locator('#complete-heading')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#booking-services input')).toHaveCount(0);
    await dialog.locator('[data-booking-close]').click();
    await expect(opener).toBeFocused();
    expect(errors).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
}
