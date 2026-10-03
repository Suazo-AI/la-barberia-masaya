import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from '@playwright/test';

// Use the preinstalled official sandbox helper, never change host security policy or permissions.
const sandboxHelper = '/opt/google/chrome/chrome-sandbox';
const sandboxStat = await stat(sandboxHelper);
if (
  !sandboxStat.isFile() ||
  sandboxStat.uid !== 0 ||
  !(sandboxStat.mode & 0o4000) ||
  sandboxStat.mode & 0o022
) {
  throw new Error(
    'The existing official Chrome sandbox helper is missing or not securely configured. No security settings were changed.',
  );
}
const url = 'http://127.0.0.1:4174/';
const server = spawn(process.execPath, ['scripts/preview.mjs'], {
  env: { ...process.env, PORT: '4174', HOST: '127.0.0.1' },
  stdio: 'inherit',
});
const runs = [];
await mkdir('.private-evidence/lighthouse', { recursive: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for our server only. */
    }
    await delay(100);
  }
  if (!ready) throw new Error('Lighthouse local build server did not become ready.');
  for (let run = 1; run <= 3; run++) {
    // Fresh temporary profile per run; no credentials, external pages, or host security changes.
    const profile = await mkdtemp(join(tmpdir(), 'barber-lighthouse-'));
    let chrome;
    try {
      chrome = await chromeLauncher.launch({
        chromePath: chromium.executablePath(),
        // Keep normal Lighthouse measurement flags but omit launcher's automatic
        // --disable-setuid-sandbox, allowing Chrome's existing sandbox to operate.
        ignoreDefaultFlags: true,
        chromeFlags: [
          ...chromeLauncher.Launcher.defaultFlags(),
          '--headless',
          '--disable-dev-shm-usage',
        ],
        envVars: { ...process.env, CHROME_DEVEL_SANDBOX: sandboxHelper },
        userDataDir: profile,
        port: 9222,
        logLevel: 'verbose',
      });
    } catch (error) {
      const stderr = await readFile(join(profile, 'chrome-err.log'), 'utf8').catch(
        () => 'No browser stderr available',
      );
      await writeFile(
        `.private-evidence/lighthouse/launch-error-${run}.json`,
        JSON.stringify(
          { message: error.message, stderr, sourceCommit: process.env.SOURCE_COMMIT },
          null,
          2,
        ),
      );
      console.error(stderr);
      await rm(profile, { recursive: true, force: true });
      throw error;
    }
    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'warn',
        onlyCategories: ['performance'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttlingMethod: 'simulate',
        throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 },
      });
      if (!result?.lhr || result.lhr.runtimeError)
        throw new Error(JSON.stringify(result?.lhr?.runtimeError || 'No Lighthouse result'));
      await writeFile(
        `.private-evidence/lighthouse/run-${run}.json`,
        JSON.stringify(result.lhr, null, 2),
      );
      runs.push({
        run,
        lighthouseVersion: result.lhr.lighthouseVersion,
        browserUserAgent: result.lhr.environment.hostUserAgent,
        settings: result.lhr.configSettings,
        lcpMs: result.lhr.audits['largest-contentful-paint'].numericValue,
        cls: result.lhr.audits['cumulative-layout-shift'].numericValue,
        performance: result.lhr.categories.performance.score * 100,
      });
    } finally {
      await chrome.kill();
      await rm(profile, { recursive: true, force: true });
    }
  }
  const median = (key) => [...runs].map((run) => run[key]).sort((a, b) => a - b)[1];
  const summary = {
    observedAt: new Date().toISOString(),
    sourceCommit: process.env.SOURCE_COMMIT || 'local-unattributed',
    url,
    node: process.version,
    coldProfilePerRun: true,
    sandbox: {
      helper: sandboxHelper,
      ownerUid: sandboxStat.uid,
      mode: (sandboxStat.mode & 0o7777).toString(8),
      hostPolicyChanged: false,
    },
    runs,
    median: { lcpMs: median('lcpMs'), cls: median('cls'), performance: median('performance') },
    thresholds: { lcpMs: 2500, cls: 0.1, performance: 90 },
    note: 'Synthetic mobile lab measurements on the local production build, not a field-speed guarantee.',
  };
  await writeFile('.private-evidence/lighthouse/summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.median, null, 2));
  if (summary.median.lcpMs > 2500 || summary.median.cls > 0.1 || summary.median.performance < 90)
    throw new Error('Lighthouse R-12 median thresholds were not met; inspect the saved reports.');
} finally {
  server.kill('SIGTERM');
}
