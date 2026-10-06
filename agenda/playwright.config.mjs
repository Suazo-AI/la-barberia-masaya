import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const fixtureRun = randomUUID();
const fixtureDatabase = (group) =>
  resolve(import.meta.dirname, '../.local-agenda', `${group}-${fixtureRun}.sqlite`);
const fixtureServer = (port, role) => ({
  command: 'node agenda/local-server.ts',
  cwd: '..',
  url: `http://127.0.0.1:${port}/health`,
  env: {
    PORT: String(port),
    AGENDA_MODE: 'fixture',
    AGENDA_NOW: '2026-10-04T15:00:00Z',
    AGENDA_DB: fixtureDatabase(port === 4183 ? 'agenda-browser' : 'staff-browser'),
    AGENDA_FIXTURE_ROLE: role,
  },
  reuseExistingServer: false,
});

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
    : [
        fixtureServer(4183, 'owner'),
        fixtureServer(4184, 'barber'),
        fixtureServer(4186, 'owner'),
        ...(process.env.AGENDA_CLOSEOUT_BASELINE_URL
          ? [
              {
                command: 'node agenda/local-server.ts',
                cwd: '../.private-evidence/closeout-baseline',
                url: process.env.AGENDA_CLOSEOUT_BASELINE_URL,
                env: {
                  PORT: '4187',
                  AGENDA_MODE: 'fixture',
                  AGENDA_NOW: '2026-10-04T15:00:00Z',
                  AGENDA_EPHEMERAL: '1',
                },
                reuseExistingServer: false,
              },
            ]
          : []),
        ...(process.env.AGENDA_BASELINE_URL
          ? [
              {
                command: 'node agenda/local-server.ts',
                cwd: '../.private-evidence/staff-role-baseline',
                url: process.env.AGENDA_BASELINE_URL,
                env: {
                  PORT: '4185',
                  AGENDA_MODE: 'fixture',
                  AGENDA_NOW: '2026-10-04T15:00:00Z',
                  AGENDA_EPHEMERAL: '1',
                },
                reuseExistingServer: false,
              },
            ]
          : []),
      ],
});
