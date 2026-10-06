import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgendaConfig } from '../core/config.ts';
import type { AgendaConfig } from '../core/contracts.ts';

const maxBytes = 128 * 1024;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Offline, read-only diagnostics. Never imports fixtures, fills defaults or grants access. */
export function inspectSetup(candidate: unknown) {
  const configurationIssues = [...new Set(validateAgendaConfig(candidate as AgendaConfig))];
  const config = isRecord(candidate) ? candidate : {};
  const mode =
    typeof config.mode === 'string' &&
    ['unconfigured', 'fixture', 'production'].includes(config.mode)
      ? config.mode
      : 'invalid';
  const productionConfigurationValid = mode === 'production' && configurationIssues.length === 0;
  const missingInputs: string[] = [];
  for (const key of [
    'slotStepMinutes',
    'minLeadMinutes',
    'maxAdvanceDays',
    'cancellationLeadMinutes',
  ]) {
    if (config[key] === null || config[key] === undefined) missingInputs.push(key);
  }
  const services = Array.isArray(config.services) ? config.services : [];
  const professionals = Array.isArray(config.professionals) ? config.professionals : [];
  services.forEach((service: unknown, index: number) => {
    if (!isRecord(service)) return;
    for (const key of ['bufferBeforeMinutes', 'bufferAfterMinutes']) {
      if (service[key] === null || service[key] === undefined)
        missingInputs.push(`services[${index}].${key}`);
    }
    if (!Array.isArray(service.professionalIds) || service.professionalIds.length === 0)
      missingInputs.push(`services[${index}].professionalIds`);
  });
  professionals.forEach((professional: unknown, index: number) => {
    if (
      isRecord(professional) &&
      (!Array.isArray(professional.weeklyHours) || professional.weeklyHours.length !== 7)
    )
      missingInputs.push(`professionals[${index}].weeklyHours`);
  });
  return {
    reportVersion: 1,
    scope: 'offline-configuration-check-only',
    mode,
    serviceCount: services.length,
    professionalCount: professionals.length,
    configurationIssues,
    missingInputs,
    productionConfigurationValid,
    activationAuthorized: false,
    nextStep: productionConfigurationValid
      ? 'Review the exact configuration and complete the separate activation gates.'
      : 'Complete and review the missing or invalid business inputs; keep bookings closed.',
    separateActivationGates: [
      'Owner review of business facts, provisional display names, shifts, service eligibility and policies.',
      'Verified same-Site owner identity and explicit approval of each owner/barber role mapping.',
      'Exact HTTPS origin, reviewed runtime settings, and hosted anonymous/unapproved/approved identity tests.',
      'Hosted D1 collision/retry tests and an approved private backup destination, recovery owner and restore drill.',
      'Retention, lost-link recovery/revocation, absence handling and public abuse-control decisions.',
      'Exact-build checks, human visual acceptance and explicit release/booking activation authorization.',
    ],
    notices: [
      'This report does not contact a host, inspect a deployed database, verify identity or change any setting.',
      'Syntactically valid values and a verification flag are not independent evidence of owner approval.',
      'An empty weekday means closed; an unknown weekday must remain unresolved, never copied from shop hours.',
      'Notifications remain a separately approved capability; this report does not enable them.',
    ],
  };
}

async function main() {
  const [input, ...extra] = process.argv.slice(2);
  if (!input || extra.length)
    throw new Error('Usage: node agenda/tools/setup-check.ts <private-configuration.json>');
  // Nonblocking open prevents a special file (for example a FIFO) from hanging
  // before fstat can reject it. The same handle is then checked and read.
  const file = await open(resolve(input), constants.O_RDONLY | constants.O_NONBLOCK);
  let contents: Buffer;
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > maxBytes) throw new Error('Invalid input.');
    // Read at most one bounded buffer, even if the file changes after stat.
    contents = Buffer.alloc(maxBytes + 1);
    let bytesRead = 0;
    while (bytesRead < contents.length) {
      const result = await file.read(contents, bytesRead, contents.length - bytesRead, null);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > maxBytes) throw new Error('Invalid input.');
    contents = contents.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
  const report = inspectSetup(JSON.parse(contents.toString('utf8')) as unknown);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.productionConfigurationValid ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never echo a JSON parser excerpt, file contents, path, names or account identifiers.
    console.error(
      'Setup check rejected. Supply one readable JSON file (at most 128 KiB). No configuration was changed.',
    );
    process.exitCode = 1;
  });
}
