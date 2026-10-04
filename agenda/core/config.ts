import { AgendaError } from './contracts.ts';
import type { AgendaConfig } from './contracts.ts';

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const onlyKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

/** Describes missing/invalid configuration without turning fixtures into defaults. */
export function validateAgendaConfig(config: AgendaConfig): string[] {
  const issues: string[] = [];
  if (!record(config)) return ['Configuration must be an object.'];
  if (
    !onlyKeys(config, [
      'mode',
      'businessId',
      'businessName',
      'timeZone',
      'currency',
      'verified',
      'verifiedAt',
      'version',
      'services',
      'professionals',
      'slotStepMinutes',
      'minLeadMinutes',
      'maxAdvanceDays',
      'cancellationLeadMinutes',
    ])
  ) {
    issues.push('Configuration contains unsupported fields.');
  }
  if (!['unconfigured', 'fixture', 'production'].includes(config.mode))
    issues.push('Invalid agenda mode.');
  if (typeof config.businessId !== 'string' || !identifier.test(config.businessId))
    issues.push('Business ID is required.');
  if (!text(config.businessName, 120)) issues.push('Business name is required.');
  if (config.timeZone !== 'America/Managua') issues.push('Time zone must be America/Managua.');
  if (config.currency !== 'NIO') issues.push('Currency must be NIO.');
  if (typeof config.verified !== 'boolean') issues.push('Verification flag is required.');
  if (!integer(config.version, 1, 2147483647))
    issues.push('Configuration version must be a positive integer.');
  if (
    config.mode === 'production' &&
    (config.verified !== true ||
      typeof config.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(config.verifiedAt)))
  ) {
    issues.push(
      'Production requires explicitly verified business configuration and verification date.',
    );
  }
  if (!integer(config.slotStepMinutes, 5, 60) || 60 % config.slotStepMinutes !== 0)
    issues.push('Slot step must evenly divide one hour (5–60 minutes).');
  if (!integer(config.minLeadMinutes, 0, 10080))
    issues.push('Minimum lead must be 0–10080 minutes.');
  if (!integer(config.maxAdvanceDays, 1, 366)) issues.push('Booking horizon must be 1–366 days.');
  if (!integer(config.cancellationLeadMinutes, 0, 10080))
    issues.push('Cancellation lead must be 0–10080 minutes.');
  if (
    !Array.isArray(config.professionals) ||
    config.professionals.length < 1 ||
    config.professionals.length > 50
  ) {
    issues.push('Configure 1–50 professionals.');
  }
  const professionalIds = new Set<string>();
  for (const professional of Array.isArray(config.professionals) ? config.professionals : []) {
    if (!record(professional)) {
      issues.push('Invalid professional.');
      continue;
    }
    if (!onlyKeys(professional, ['id', 'name', 'weeklyHours', 'photoUrl']))
      issues.push('Professional contains unsupported fields.');
    if (
      typeof professional.id !== 'string' ||
      !identifier.test(professional.id) ||
      professionalIds.has(professional.id)
    ) {
      issues.push('Professional IDs must be valid and unique.');
    } else professionalIds.add(professional.id);
    if (!text(professional.name, 120)) issues.push('Every professional needs a name.');
    if (
      professional.photoUrl !== undefined &&
      (typeof professional.photoUrl !== 'string' ||
        professional.photoUrl.length > 1000 ||
        !/^(?:https:\/\/|\/(?!\/))/.test(professional.photoUrl))
    ) {
      issues.push('Professional photo URL must be HTTPS or a local absolute path.');
    }
    if (!Array.isArray(professional.weeklyHours) || professional.weeklyHours.length !== 7) {
      issues.push('Every professional needs seven explicitly configured weekdays.');
      continue;
    }
    for (const day of professional.weeklyHours) {
      if (!Array.isArray(day) || day.length > 12) {
        issues.push('Invalid weekday intervals.');
        continue;
      }
      let previousEnd = -1;
      for (const interval of day) {
        if (
          !Array.isArray(interval) ||
          interval.length !== 2 ||
          !integer(interval[0], 0, 1439) ||
          !integer(interval[1], 1, 1440) ||
          interval[1] <= interval[0] ||
          interval[0] < previousEnd
        ) {
          issues.push('Hours must be sorted, non-overlapping minute intervals within each day.');
        } else previousEnd = interval[1];
      }
    }
  }
  if (!Array.isArray(config.services) || config.services.length < 1 || config.services.length > 50)
    issues.push('Configure 1–50 services.');
  const serviceIds = new Set<string>();
  for (const service of Array.isArray(config.services) ? config.services : []) {
    if (!record(service)) {
      issues.push('Invalid service.');
      continue;
    }
    if (
      !onlyKeys(service, [
        'id',
        'name',
        'description',
        'durationMinutes',
        'priceMinorUnits',
        'professionalIds',
        'bufferBeforeMinutes',
        'bufferAfterMinutes',
      ])
    )
      issues.push('Service contains unsupported fields.');
    if (
      typeof service.id !== 'string' ||
      !identifier.test(service.id) ||
      serviceIds.has(service.id)
    )
      issues.push('Service IDs must be valid and unique.');
    else serviceIds.add(service.id);
    if (
      !text(service.name, 120) ||
      typeof service.description !== 'string' ||
      service.description.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(service.description)
    )
      issues.push('Invalid service name/description.');
    if (!integer(service.durationMinutes, 5, 480))
      issues.push('Service duration must be 5–480 minutes.');
    if (
      !integer(service.bufferBeforeMinutes, 0, 120) ||
      !integer(service.bufferAfterMinutes, 0, 120)
    )
      issues.push('Service buffers must be 0–120 minutes.');
    if (!integer(service.priceMinorUnits, 0, 10000000))
      issues.push('Service price must be an integer number of NIO minor units.');
    if (
      !Array.isArray(service.professionalIds) ||
      service.professionalIds.length < 1 ||
      service.professionalIds.length > 50 ||
      new Set(service.professionalIds).size !== service.professionalIds.length ||
      service.professionalIds.some((id) => typeof id !== 'string' || !professionalIds.has(id))
    ) {
      issues.push('Each service needs distinct configured eligible professionals.');
    }
  }
  return issues;
}

export function assertConfigured(
  config: AgendaConfig,
): asserts config is AgendaConfig & { mode: 'fixture' | 'production' } {
  if (config.mode === 'unconfigured' || validateAgendaConfig(config).length > 0) {
    throw new AgendaError(
      'CONFIGURATION_REQUIRED',
      503,
      'La agenda necesita configuración verificada antes de aceptar reservas.',
    );
  }
}
