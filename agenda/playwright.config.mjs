import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '.private-evidence/agenda-browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4183',
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
  webServer: process.env.AGENDA_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'node agenda/local-server.ts',
        cwd: '..',
        url: 'http://127.0.0.1:4183/health',
        env: {
          PORT: '4183',
          AGENDA_MODE: 'fixture',
          AGENDA_NOW: '2026-10-04T15:00:00Z',
          AGENDA_EPHEMERAL: '1',
        },
        reuseExistingServer: false,
      },
});
