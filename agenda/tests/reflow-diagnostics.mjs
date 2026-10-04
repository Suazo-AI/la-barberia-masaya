import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

/** Keep the exact page-width invariant, with geometry-only diagnostics on failure. */
export async function expectViewportReflow(page, testInfo) {
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    absenceControls: Array.from(
      document.querySelectorAll(
        '#absence-form input[type="date"], #absence-form input[type="time"]',
      ),
    ).map((input) => {
      const bounds = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return {
        id: input.id,
        value: input.value,
        width: bounds.width,
        contentWidth:
          input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: bounds.height,
        fontSize: parseFloat(style.fontSize),
      };
    }),
    overflowingElements: Array.from(document.body.querySelectorAll('*'))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          id: element.id,
          className: element.getAttribute('class'),
          left: bounds.left,
          right: bounds.right,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        };
      })
      .filter((element) => element.right > window.innerWidth || element.left < 0),
  }));
  if (testInfo) {
    await writeFile(testInfo.outputPath('reflow-layout.json'), JSON.stringify(layout, null, 2));
    await page.screenshot({ path: testInfo.outputPath('reflow-320-200.png'), fullPage: true });
  }
  expect(layout.documentWidth, JSON.stringify(layout, null, 2)).toBeLessThanOrEqual(
    layout.viewportWidth,
  );
}

/** Filled native controls must remain readable, not merely fit the page. */
export async function fillAndCheckAbsenceControls(page, testInfo, values) {
  for (const [id, value] of Object.entries(values)) {
    await page.locator(`#${id}`).fill(value);
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  }
  await page
    .locator('#absence-form')
    .screenshot({ path: testInfo.outputPath('absence-filled-320-200.png') });
  await page
    .locator('#absence-form fieldset')
    .first()
    .screenshot({ path: testInfo.outputPath('absence-start-controls-320-200.png') });
  const controls = await page
    .locator('#absence-form input[type="date"], #absence-form input[type="time"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => {
        const bounds = input.getBoundingClientRect();
        const style = getComputedStyle(input);
        return {
          id: input.id,
          width: bounds.width,
          contentWidth:
            input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          height: bounds.height,
          fontSize: parseFloat(style.fontSize),
        };
      }),
    );
  expect(controls).toHaveLength(4);
  for (const control of controls) {
    expect(
      control.contentWidth,
      `${control.id}: ${JSON.stringify(control)}`,
    ).toBeGreaterThanOrEqual(220);
    expect(control.fontSize, control.id).toBeGreaterThanOrEqual(32);
    expect(control.height, control.id).toBeGreaterThanOrEqual(44);
  }
}
