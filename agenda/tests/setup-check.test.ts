import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { localFixtureConfig } from '../fixtures/local.ts';
import { inspectSetup } from '../tools/setup-check.ts';

const production = () => ({
  ...structuredClone(localFixtureConfig),
  mode: 'production',
  verified: true,
  verifiedAt: '2026-10-06T00:00:00.000Z',
});

test('partial setup identifies missing fields without filling or changing the candidate', () => {
  const candidate = {
    ...production(),
    mode: 'unconfigured',
    verified: false,
    verifiedAt: undefined,
    slotStepMinutes: null,
    minLeadMinutes: null,
    maxAdvanceDays: null,
    cancellationLeadMinutes: null,
    professionals: [
      { id: 'example-a', name: 'Provisional example A', weeklyHours: null },
      { id: 'example-b', name: 'Provisional example B', weeklyHours: null },
      { id: 'example-c', name: 'Provisional example C', weeklyHours: null },
    ],
    services: production().services.map((service) => ({
      ...service,
      professionalIds: [],
      bufferBeforeMinutes: null,
      bufferAfterMinutes: null,
    })),
  };
  const before = structuredClone(candidate);
  const report = inspectSetup(candidate);
  assert.deepEqual(candidate, before);
  assert.equal(report.professionalCount, 3);
  assert.equal(report.serviceCount, 3);
  assert.equal(report.productionConfigurationValid, false);
  assert.equal(report.activationAuthorized, false);
  assert.equal(report.missingInputs.length, 16);
  assert.ok(report.missingInputs.includes('professionals[2].weeklyHours'));
  assert.ok(report.missingInputs.includes('services[1].professionalIds'));
  assert.ok(report.missingInputs.includes('services[0].bufferBeforeMinutes'));
  assert.ok(report.configurationIssues.length > 0);
});

test('structurally valid production setup cannot authorize activation or dismiss external gates', () => {
  const report = inspectSetup(production());
  assert.equal(report.productionConfigurationValid, true);
  assert.deepEqual(report.configurationIssues, []);
  assert.deepEqual(report.missingInputs, []);
  assert.equal(report.activationAuthorized, false);
  assert.equal(report.separateActivationGates.length, 6);
  assert.match(report.notices.join(' '), /not independent evidence of owner approval/);
});

test('fixtures and unconfigured candidates never become production-ready through valid fields', () => {
  for (const mode of ['fixture', 'unconfigured']) {
    const report = inspectSetup({ ...production(), mode });
    assert.deepEqual(report.configurationIssues, []);
    assert.equal(report.productionConfigurationValid, false);
    assert.equal(report.activationAuthorized, false);
  }
});

test('reports use the runtime validator for invalid fields, IDs, shifts, eligibility and verification', () => {
  const candidate = production();
  candidate.verified = false;
  candidate.services[0].professionalIds = ['unknown'];
  candidate.services[1].durationMinutes = 0;
  candidate.professionals[0].weeklyHours[0] = [[100, 90]];
  const report = inspectSetup(candidate);
  assert.equal(report.productionConfigurationValid, false);
  assert.match(report.configurationIssues.join(' '), /explicitly verified/);
  assert.match(report.configurationIssues.join(' '), /eligible professionals/);
  assert.match(report.configurationIssues.join(' '), /5–480/);
  assert.match(report.configurationIssues.join(' '), /non-overlapping/);
});

test('malformed JSON values and collections produce safe diagnostics rather than crashing', () => {
  for (const candidate of [
    null,
    [],
    7,
    'secret',
    {},
    { mode: {}, services: [null], professionals: [0] },
    { mode: { toString: null, valueOf: null } },
  ]) {
    const report = inspectSetup(candidate);
    assert.equal(report.productionConfigurationValid, false);
    assert.ok(report.configurationIssues.length > 0);
    assert.equal(report.activationAuthorized, false);
  }
});

test('reports never echo configuration values, unsupported keys or account data', () => {
  const candidate = {
    ...production(),
    businessName: 'PRIVATE_BUSINESS_VALUE',
    unexpected_private_subject: 'PRIVATE_SUBJECT_VALUE',
  };
  candidate.professionals[0].name = 'PRIVATE_STAFF_VALUE';
  candidate.services[0].description = 'PRIVATE_DESCRIPTION_VALUE';
  const serialized = JSON.stringify(inspectSetup(candidate));
  assert.doesNotMatch(serialized, /PRIVATE_|unexpected_private_subject|local-fixture/);
  assert.match(serialized, /unsupported fields/);
});

test('CLI is read-only, uses machine-readable exit codes and redacts parsing failures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agenda-setup-check-'));
  try {
    const input = join(dir, 'candidate.json');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['agenda/tools/setup-check.ts', ...args], { encoding: 'utf8' });
    for (const [candidate, expected] of [
      [production(), 0],
      [localFixtureConfig, 2],
    ] as const) {
      const contents = JSON.stringify(candidate);
      await writeFile(input, contents);
      const result = run(input);
      assert.equal(result.status, expected, result.stderr);
      assert.equal(JSON.parse(result.stdout).activationAuthorized, false);
      assert.equal(await readFile(input, 'utf8'), contents);
      assert.deepEqual(await readdir(dir), ['candidate.json']);
    }
    for (const contents of ['{"PRIVATE_VALUE_DO_NOT_ECHO": invalid}', ' '.repeat(128 * 1024 + 1)]) {
      await writeFile(input, contents);
      const result = run(input);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.doesNotMatch(result.stderr, /PRIVATE_VALUE|candidate\.json/);
      assert.equal(await readFile(input, 'utf8'), contents);
    }
    for (const args of [[], [input, input], [join(dir, 'missing.json')]]) {
      const result = run(...args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI rejects special files without blocking before its regular-file check', async (context) => {
  if (process.platform === 'win32') return context.skip('POSIX FIFO regression.');
  const dir = await mkdtemp(join(tmpdir(), 'agenda-setup-fifo-'));
  try {
    const fifo = join(dir, 'input.fifo');
    const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8', timeout: 3000 });
    assert.equal(created.status, 0, created.stderr);
    for (const input of [fifo, dir]) {
      const result = spawnSync(process.execPath, ['agenda/tools/setup-check.ts', input], {
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.doesNotMatch(result.stderr, /input\.fifo|agenda-setup-fifo/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
