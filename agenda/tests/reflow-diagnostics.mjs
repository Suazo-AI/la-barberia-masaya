import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

/** Keep the exact page-width invariant, with geometry-only diagnostics on failure. */
export async function expectViewportReflow(page, testInfo) {
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
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
