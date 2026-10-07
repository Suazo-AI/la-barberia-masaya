import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

for (const width of [390, 1440]) {
  test(`selected hybrid footer and genuine v11 comparison ${width}`, async ({ page, context }) => {
    await mkdir('.private-evidence/footer', { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    const external = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url());
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const footer = page.getByRole('contentinfo', { name: 'SEGUÍ EL ESTILO.' });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByText('MASAYA · CAILAGUA', { exact: true })).toBeVisible();
    await expect(footer.getByText('Lo que pasa en la silla, también en tus redes.')).toBeVisible();
    await expect(page.locator('.hero a')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);
    await expect(page.locator('address')).toHaveCount(1);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(footer.locator('.lb-footer-wordmark')).toHaveText('LA BARBERÍA');
    const social = footer.getByRole('navigation', { name: 'Redes sociales de La Barbería' });
    const attempts = [];
    await page.exposeFunction('captureSocialAttempt', (url) => attempts.push(url));
    for (const [name, url] of [
      ['Instagram', 'https://www.instagram.com/labarberia.ni/'],
      ['Facebook', 'https://www.facebook.com/labarberia.ni/'],
    ]) {
      const link = social.getByRole('link', { name });
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      const bounds = await link.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await link.focus();
      await expect(link).toBeFocused();
      expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
      await expect
        .poll(() => link.evaluate((el) => getComputedStyle(el, '::before').transform))
        .toBe('matrix(1, 0, 0.57735, 1, 0, 0)');
      await link.evaluate((element) =>
        element.addEventListener('click', (event) => {
          event.preventDefault();
          window.captureSocialAttempt(element.href);
        }),
      );
      await page.keyboard.press('Enter');
    }
    expect(attempts).toEqual([
      'https://www.instagram.com/labarberia.ni/',
      'https://www.facebook.com/labarberia.ni/',
    ]);
    await page.locator('.lb-footer-eyebrow').click();
    await page.mouse.move(0, 0);
    await footer.screenshot({ path: `.private-evidence/footer/after-${width}.png` });
    await page.screenshot({
      path: `.private-evidence/footer/after-page-${width}.png`,
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await social.getByRole('link', { name: 'Instagram' }).hover();
    await expect
      .poll(() =>
        social
          .getByRole('link', { name: 'Instagram' })
          .evaluate((el) => getComputedStyle(el, '::before').transform),
      )
      .toBe('matrix(1, 0, 0.57735, 1, 0, 0)');
    await social.screenshot({ path: `.private-evidence/footer/editorial-hover-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.FOOTER_BASELINE_URL) {
      const baseline = await context.newPage();
      await baseline.setViewportSize({ width, height: 900 });
      await baseline.goto(process.env.FOOTER_BASELINE_URL);
      await baseline.evaluate(() => document.fonts.ready);
      await baseline
        .locator('.visit-section')
        .screenshot({ path: `.private-evidence/footer/before-${width}.png` });
      await baseline.screenshot({
        path: `.private-evidence/footer/before-page-${width}.png`,
        fullPage: true,
      });
      await baseline.close();
    }
    await writeFile(
      `.private-evidence/footer/metadata-${width}.json`,
      JSON.stringify(
        {
          sourceCommit: process.env.SOURCE_COMMIT || 'local',
          baselineCommit: '9a4f3858be2078ab0ff3b4cb8d31d1beb874f851',
          width,
          axeViolations: axe.violations.length,
          externalRequests: external,
          beforeScope: 'Real v11 location/hours section before footer replacement',
          afterScope: 'Selected combined footer; footer-only change',
        },
        null,
        2,
      ),
    );
  });
}

test('selected footer reflows at 320px with 200% text and keeps native targets', async ({
  page,
}) => {
  await page.route('**/styles.css', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nhtml { font-size: 200%; }` });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  const footer = page.locator('.lb-footer');
  await footer.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const link of await footer.locator('a').all()) {
    const bounds = await link.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir('.private-evidence/footer', { recursive: true });
  await footer.screenshot({ path: '.private-evidence/footer/after-320-enlarged.png' });
});

test('selected footer offers business and social links without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const footer = page.getByRole('contentinfo', { name: 'SEGUÍ EL ESTILO.' });
  await expect(footer.getByRole('link', { name: 'Instagram' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Facebook' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Cómo llegar' })).toBeVisible();
  await expect(footer.locator('.lb-footer-hours-list dt')).toHaveCount(7);
  await expect(footer.getByText('Consultá una cita real con el negocio.')).toBeVisible();
  await context.close();
});
