import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
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
      args: process.env.CI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'on',
  },
  webServer: [
    {
      command: 'npm run preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
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
