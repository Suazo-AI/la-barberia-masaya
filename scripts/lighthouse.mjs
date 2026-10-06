import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { createHash } from 'node:crypto';

// Use Ubuntu's existing Chrome AppArmor allowance; never change host security policy.
// Version is pinned from the exact GitHub runner image manifest, and drift fails closed.
const chromePath = '/opt/google/chrome/chrome';
const expectedChromeVersion = '154.0.8037.57';
const policyPath = '/etc/apparmor.d/chrome';
await mkdir('.private-evidence/lighthouse', { recursive: true });
const preflight = {
  observedAt: new Date().toISOString(),
  sourceCommit: process.env.SOURCE_COMMIT || 'local-unattributed',
  platform: process.platform,
  node: process.version,
  imageVersion: process.env.ImageVersion || null,
  expectedChromeVersion,
  files: [],
  passed: false,
};
let chromeVersion;
let appArmorPolicy;
try {
  for (const path of [chromePath, policyPath]) {
    const info = await stat(path);
    preflight.files.push({
      path,
      uid: info.uid,
      mode: (info.mode & 0o7777).toString(8),
      isFile: info.isFile(),
    });
    if (!info.isFile() || info.uid !== 0 || info.mode & 0o022)
      throw new Error(`Expected root-owned, non-writable official Chrome file: ${path}`);
  }
  chromeVersion = execFileSync(chromePath, ['--version'], { encoding: 'utf8' }).trim();
  if (chromeVersion !== `Google Chrome ${expectedChromeVersion}`)
    throw new Error(`Pinned Chrome version mismatch: ${chromeVersion}`);
  appArmorPolicy = await readFile(policyPath, 'utf8');
  if (!appArmorPolicy.includes(chromePath) || !/\buserns\s*,/.test(appArmorPolicy))
    throw new Error('Existing official Chrome AppArmor userns allowance is unavailable.');
  preflight.passed = true;
} catch (error) {
  preflight.error = error.message;
  throw error;
} finally {
  await writeFile(
    '.private-evidence/lighthouse/preflight.json',
    JSON.stringify(preflight, null, 2),
  );
}
const url = 'http://127.0.0.1:4174/';
const server = spawn(process.execPath, ['scripts/preview.mjs'], {
  env: { ...process.env, PORT: '4174', HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let startup = '';
server.stdout.on('data', (chunk) => {
  startup += chunk.toString();
});
const runs = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error('Our Lighthouse preview server exited before verification.');
    try {
      if (startup.includes(`Private local preview: ${url.slice(0, -1)}`) && (await fetch(url)).ok) {
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
        chromePath,
        // Keep normal Lighthouse measurement flags but omit launcher's automatic
        // --disable-setuid-sandbox; the installed Chrome uses its existing AppArmor policy.
        ignoreDefaultFlags: true,
        chromeFlags: [
          ...chromeLauncher.Launcher.defaultFlags(),
          '--headless',
          '--disable-dev-shm-usage',
        ],
        userDataDir: profile,
        // A fixed debugging port could attach to an unrelated existing browser.
        port: 0,
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
  if (
    !runs.every((run) => ['lcpMs', 'cls', 'performance'].every((key) => Number.isFinite(run[key])))
  )
    throw new Error('Lighthouse returned a missing or non-finite required metric.');
  const median = (key) => [...runs].map((run) => run[key]).sort((a, b) => a - b)[1];
  const summary = {
    observedAt: new Date().toISOString(),
    sourceCommit: process.env.SOURCE_COMMIT || 'local-unattributed',
    url,
    node: process.version,
    coldProfilePerRun: true,
    sandbox: {
      browserPath: chromePath,
      browserVersion: chromeVersion,
      appArmorPolicy: policyPath,
      policySha256: createHash('sha256').update(appArmorPolicy).digest('hex'),
      imageVersion: process.env.ImageVersion || null,
      sandboxDisablingFlags: [],
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
