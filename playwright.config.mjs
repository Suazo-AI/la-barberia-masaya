import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  // Agenda runs afterward and owns the default test-results directory.
  outputDir: '.private-evidence/site-test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '.private-evidence/playwright-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-NI',
    timezoneId: 'America/Managua',
    reducedMotion: 'reduce',
    launchOptions: {
      ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'on',
  },
  webServer: [
    ...(process.env.MAIN_BOOKING_BASELINE_URL
      ? [
          {
            command: 'node scripts/preview.mjs',
            cwd: '.private-evidence/main-booking-baseline',
            env: { PORT: '4179' },
            url: process.env.MAIN_BOOKING_BASELINE_URL,
            reuseExistingServer: false,
          },
        ]
      : []),
    ...(process.env.FOOTER_BASELINE_URL
      ? [
          {
            command: 'node scripts/preview.mjs',
            cwd: '.private-evidence/footer-baseline',
            env: { PORT: '4178' },
            url: process.env.FOOTER_BASELINE_URL,
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command: 'npm run preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    ...(process.env.AUTHENTIC_BASELINE_URL
      ? [
          {
            command: 'node scripts/preview.mjs',
            cwd: '.private-evidence/authentic-baseline',
            env: { PORT: '4176' },
            url: process.env.AUTHENTIC_BASELINE_URL,
            reuseExistingServer: false,
          },
        ]
      : []),
    ...(process.env.CATALOG_BASELINE_URL
      ? [
          {
            command: 'node scripts/preview.mjs',
            cwd: '.private-evidence/catalog-baseline',
            env: { PORT: '4177' },
            url: process.env.CATALOG_BASELINE_URL,
            reuseExistingServer: false,
          },
        ]
      : []),
    ...(process.env.UI_BASELINE_URL
      ? [
          {
            command: 'node scripts/preview.mjs',
            cwd: '.baseline-source',
            env: { PORT: '4174' },
            url: process.env.UI_BASELINE_URL,
            reuseExistingServer: false,
          },
        ]
      : []),
  ],
});
