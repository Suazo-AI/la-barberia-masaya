import { AgendaError } from './contracts.ts';

export const TIME_ZONE = 'America/Managua' as const;
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const zonedFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function assertDate(value: unknown): asserts value is string {
  if (!validDate(value)) throw new AgendaError('INVALID_INPUT', 400, 'Fecha inválida.');
}

export function localDate(now: Date): string {
  const parts = Object.fromEntries(
    dayFormat.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(date: string, days: number): string {
  assertDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  assertDate(date);
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Resolve local minutes through the declared IANA zone, never the process zone. */
export function toUtcSeconds(date: string, minute: number): number {
  assertDate(date);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440)
    throw new AgendaError('INVALID_INPUT', 400, 'Hora inválida.');
  const desired = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      zonedFormat.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const delta = desired - represented;
    if (delta === 0) return instant / 1000;
    instant += delta;
  }
  throw new AgendaError('INVALID_INPUT', 400, 'La hora no existe en la zona configurada.');
}

export function fromUtcSeconds(seconds: number): { date: string; minute: number } {
  const parts = Object.fromEntries(
    zonedFormat.formatToParts(new Date(seconds * 1000)).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export const isoInstant = (seconds: number): string => new Date(seconds * 1000).toISOString();
