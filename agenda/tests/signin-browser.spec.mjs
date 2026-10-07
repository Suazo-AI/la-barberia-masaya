import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const baselineCommit = '59801861ab926343630ef6b847500ce790abc2d8';
const path = '/api/agenda/v1/identity';
const signin = '/signin-with-chatgpt?return_to=%2Fadmin.html';
const signout = '/signout-with-chatgpt?return_to=%2Fadmin.html';
const identity = (subject) => ({
  authenticated: !!subject,
  ...(subject ? { subject } : {}),
  signInPath: signin,
  signOutPath: signout,
});
const deny = async (page) =>
  page.route('**/api/agenda/v1/admin/session', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'FORBIDDEN' } }),
    }),
  );

for (const width of [390, 1440]) {
  for (const phase of ['before', 'after']) {
    test(`staff sign-in ${phase} at ${width}px`, async ({ page }, testInfo) => {
      const origin =
        phase === 'before' ? process.env.AGENDA_SIGNIN_BASELINE_URL : 'http://127.0.0.1:4186';
      test.skip(!origin, 'Exact pre-sign-in baseline is configured in CI.');
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await deny(page);
      let ownSubject;
      await page.route(`**${path}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify(identity(ownSubject)),
        }),
      );
      let signInNavigations = 0;
      await page.route(`**${signin}`, async (route) => {
        signInNavigations++;
        expect(route.request().isNavigationRequest()).toBe(true);
        expect(route.request().frame()).toBe(page.mainFrame());
        expect(route.request().method()).toBe('GET');
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<p>Top-level sign-in navigation intercepted for this local test.</p>',
        });
      });
      await page.goto(`${origin}/admin.html`);
      await expect(page.locator('#access-title')).toContainText('no autorizado');
      await expect(page.locator('#admin-workspace')).not.toBeVisible();
      expect(signInNavigations).toBe(0);
      if (phase === 'before') await expect(page.locator('#identity-panel')).toHaveCount(0);
      else {
        await expect(page.locator('#identity-panel')).toBeVisible();
        await expect(page.locator('#identity-sign-in')).toHaveAttribute('href', signin);
        await expect(page.locator('#identity-sign-in')).toHaveAttribute('target', '_top');
        await expect(page.locator('#identity-subject')).not.toBeVisible();
        await expect(page.locator('#identity-sign-out')).not.toBeVisible();
        await expect(page.locator('#identity-panel')).toContainText(
          'Iniciar sesión no concede permisos',
        );
      }
      await page.screenshot({
        path: testInfo.outputPath(`${phase}-anonymous-signin-${width}.png`),
        fullPage: true,
      });
      const anonymousAxe = await new AxeBuilder({ page }).analyze();
      expect(anonymousAxe.violations).toEqual([]);
      const evidence = {
        sourceCommit:
          phase === 'before' ? baselineCommit : process.env.SOURCE_COMMIT || 'local-uncommitted',
        baselineCommit,
        phase,
        width,
        capturedAt: new Date().toISOString(),
        origin,
        mode: 'Local UI test: mocked Sites self-identity/session responses. No real sign-in, role grant, business data or hosted dispatcher verification.',
        anonymousIncomplete: anonymousAxe.incomplete,
      };
      if (phase === 'after') {
        await page.locator('#identity-sign-in').click();
        expect(signInNavigations).toBe(1);
        ownSubject = 'synthetic-site-subject-awaiting-explicit-approval';
        await page.goto(`${origin}/admin.html`);
        await expect(page.locator('#identity-subject')).toHaveValue(ownSubject);
        await expect(page.locator('#identity-sign-in')).not.toBeVisible();
        await expect(page.locator('#identity-sign-out')).toHaveAttribute('href', signout);
        await expect(page.locator('#identity-sign-out')).toHaveAttribute('target', '_top');
        await expect(page.locator('#admin-workspace')).not.toBeVisible();
        await expect(page.locator('#identity-panel')).toContainText(
          'no es una aprobación de permisos',
        );
        await page.locator('#identity-subject').focus();
        await expect(page.locator('#identity-subject')).toBeFocused();
        await page.screenshot({
          path: testInfo.outputPath(`after-own-identity-${width}.png`),
          fullPage: true,
        });
        const signedAxe = await new AxeBuilder({ page }).analyze();
        expect(signedAxe.violations).toEqual([]);
        evidence.signedIncomplete = signedAxe.incomplete;
        ownSubject = undefined;
        await page.locator('#reload-agenda').click();
        await expect(page.locator('#identity-subject')).toHaveValue('');
        await expect(page.locator('#identity-sign-in')).toBeVisible();
        await expect(page.locator('#identity-sign-out')).not.toBeVisible();
        expect(signInNavigations).toBe(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await writeFile(
        testInfo.outputPath('signin-metadata.json'),
        JSON.stringify(evidence, null, 2),
      );
    });
  }
}

test('self-identity UI fails closed on invalid paths, treats opaque subjects as text and retains pending-write protection', async ({
  page,
}) => {
  await deny(page);
  let response = {
    ...identity('synthetic-subject'),
    signInPath: 'https://other.example.test/signin',
  };
  await page.route(`**${path}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }),
  );
  await page.goto('/admin.html');
  await expect(page.locator('#access-title')).toContainText('no autorizado');
  await expect(page.locator('#identity-panel')).not.toBeVisible();
  response = identity('<svg/onload=alert(1)>');
  await page.locator('#reload-agenda').click();
  await expect(page.locator('#identity-subject')).toHaveValue(response.subject);
  await expect(page.locator('#identity-panel svg')).toHaveCount(0);
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('agenda:pending:admin', '1'));
  response = identity('another-synthetic-subject');
  await page.reload();
  await expect(page.locator('#identity-subject')).toHaveValue(response.subject);
  expect(await page.evaluate(() => sessionStorage.getItem('agenda:pending:admin'))).toBe('1');
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain(response.subject);
});

test('identity navigation scrubs private state, rejects late mutation replies and revalidates Back/lifecycle restores', async ({
  page,
  request,
}) => {
  const origin = 'http://127.0.0.1:4186';
  let subject = 'synthetic-first-account';
  await page.route(`**${path}`, (route) => route.fulfill({ json: identity(subject) }));
  const date = '2026-10-25';
  const availability = await (
    await request.get(
      `${origin}/api/agenda/v1/availability?serviceId=cut&professionalId=a&date=${date}`,
    )
  ).json();
  const slot = availability.slots[0];
  expect(slot).toBeTruthy();
  await page.goto(`${origin}/admin.html`);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#identity-sign-out')).toBeVisible();
  let releaseReply;
  let reportCommitted;
  const committed = new Promise((resolve) => {
    reportCommitted = resolve;
  });
  const release = new Promise((resolve) => {
    releaseReply = resolve;
  });
  await page.route('**/api/agenda/v1/admin/walk-ins', async (route) => {
    const result = await route.fetch();
    expect(result.status()).toBe(201);
    reportCommitted();
    await release;
    try {
      await route.fulfill({ response: result });
    } catch (error) {
      if (!/closed|handled|aborted|disposed/i.test(error.message)) throw error;
    }
  });
  await page.locator('#walkin-service').selectOption('cut');
  await page.locator('#walkin-professional').selectOption('a');
  await page.locator('#walkin-date').fill(date);
  await page.locator('#walkin-time').fill(
    `${Math.floor(slot.startMinute / 60)
      .toString()
      .padStart(2, '0')}:${(slot.startMinute % 60).toString().padStart(2, '0')}`,
  );
  await page.locator('#walkin-name').fill('Synthetic pending identity-switch record');
  await page
    .locator('#walkin-form')
    .getByRole('button', { name: 'Registrar entrada', exact: true })
    .click();
  await committed;
  expect(await page.evaluate(() => sessionStorage.getItem('agenda:pending:admin'))).toBe('1');
  // Explicit lifecycle simulation tests the bfcache hooks; it does not assert
  // that the current CI browser admitted this document into actual bfcache.
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  await expect(page.locator('#walkin-name')).toHaveValue('');
  await expect(page.locator('#identity-subject')).toHaveValue('');
  await expect(page.locator('#booking-list')).toBeEmpty();
  subject = 'synthetic-second-account';
  await deny(page);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.locator('#identity-subject')).toHaveValue(subject);
  releaseReply();
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  await expect(page.locator('#retry-operation')).not.toBeVisible();
  await expect(page.locator('#pending-operation')).toContainText('se perdió el intento');
  expect(await page.evaluate(() => sessionStorage.getItem('agenda:pending:admin'))).toBe('1');
  const navigationSnapshots = [];
  await page.exposeFunction('recordIdentityNavigation', (snapshot) =>
    navigationSnapshots.push(snapshot),
  );
  await page.locator('#identity-sign-out').evaluate((link) => {
    // Registered after the app's synchronous scrub listener. Capture the old
    // document here; DOM reads inside an intercepted navigation can deadlock.
    link.addEventListener('click', () =>
      window.recordIdentityNavigation({
        subject: document.getElementById('identity-subject').value,
        workspaceHidden: document.getElementById('admin-workspace').hidden,
        pending: sessionStorage.getItem('agenda:pending:admin'),
      }),
    );
  });
  await page.route(`**${signout}`, async (route) => {
    expect(route.request().isNavigationRequest()).toBe(true);
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<p>Sign-out navigation intercepted for this local test.</p>',
    });
  });
  await page.locator('#identity-sign-out').click();
  await expect
    .poll(() => navigationSnapshots)
    .toEqual([{ subject: '', workspaceHidden: true, pending: '1' }]);
  await page.goBack();
  await expect(page.locator('#access-title')).toContainText('no autorizado');
  await expect(page.locator('#admin-workspace')).not.toBeVisible();
  await expect(page.locator('#booking-list')).toBeEmpty();
  expect(await page.evaluate(() => sessionStorage.getItem('agenda:pending:admin'))).toBe('1');
});
