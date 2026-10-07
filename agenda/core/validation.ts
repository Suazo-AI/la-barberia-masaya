import { AgendaError } from './contracts.ts';
import type { Actor, MutationContext } from './contracts.ts';

export const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
export const digestPattern = /^[a-f0-9]{64}$/;

export function assertObject(
  value: unknown,
  allowedKeys: string[],
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowedKeys.includes(key))
  ) {
    throw new AgendaError('INVALID_INPUT', 400, 'Datos inválidos.');
  }
}

export function assertId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !identifierPattern.test(value))
    throw new AgendaError('INVALID_INPUT', 400, 'Identificador inválido.');
}

export function assertMinute(value: unknown, allowEnd = false): asserts value is number {
  if (
    !Number.isInteger(value) ||
    typeof value !== 'number' ||
    value < 0 ||
    value > (allowEnd ? 1440 : 1439)
  ) {
    throw new AgendaError('INVALID_INPUT', 400, 'Hora inválida.');
  }
}

export function assertVersion(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new AgendaError('INVALID_INPUT', 400, 'Versión inválida.');
  }
}

export function cleanText(value: unknown, max: number, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new AgendaError('INVALID_INPUT', 400, 'Texto inválido.');
  }
  return value.trim();
}

export function assertActor(actor: Actor): void {
  if (actor === null || typeof actor !== 'object')
    throw new AgendaError('FORBIDDEN', 403, 'Acceso no autorizado.');
  if (actor.kind === 'public') return;
  if (
    (actor.kind === 'admin' ||
      (actor.kind === 'barber' &&
        typeof actor.professionalId === 'string' &&
        identifierPattern.test(actor.professionalId))) &&
    typeof actor.id === 'string' &&
    /^[^\s,\u0000-\u001f\u007f]{1,256}$/.test(actor.id)
  )
    return;
  if (
    actor.kind === 'customer' &&
    typeof actor.reservationId === 'string' &&
    identifierPattern.test(actor.reservationId)
  )
    return;
  throw new AgendaError('FORBIDDEN', 403, 'Acceso no autorizado.');
}

export function assertContext(context: MutationContext): void {
  if (
    !context ||
    typeof context !== 'object' ||
    typeof context.idempotencyKey !== 'string' ||
    !/^[a-zA-Z0-9._:-]{8,128}$/.test(context.idempotencyKey)
  ) {
    throw new AgendaError('INVALID_INPUT', 400, 'Clave de idempotencia inválida.');
  }
  assertActor(context.actor);
  assertVersion(context.configVersion);
}

export function assertAdmin(actor: Actor): void {
  assertActor(actor);
  if (actor.kind !== 'admin')
    throw new AgendaError('FORBIDDEN', 403, 'Se requiere un administrador autorizado.');
}

/** Staff identity and professional mapping come only from a trusted host adapter. */
export function assertStaff(
  actor: Actor,
): asserts actor is Extract<Actor, { kind: 'admin' | 'barber' }> {
  assertActor(actor);
  if (actor.kind !== 'admin' && actor.kind !== 'barber')
    throw new AgendaError('FORBIDDEN', 403, 'Se requiere acceso autorizado a la agenda.');
}

export function assertProfessionalScope(professionalId: string, actor: Actor): void {
  assertStaff(actor);
  if (actor.kind === 'barber' && actor.professionalId !== professionalId)
    throw new AgendaError('FORBIDDEN', 403, 'Acceso no autorizado a esta agenda.');
}

/** Actors are supplied by a trusted HTTP identity/capability adapter, never headers. */
export function assertManagement(id: string, actor: Actor): void {
  assertActor(actor);
  if (actor.kind === 'admin' || (actor.kind === 'customer' && actor.reservationId === id)) return;
  throw new AgendaError('FORBIDDEN', 403, 'Acceso no autorizado a la reserva.');
}

export function actorScope(actor: Actor): string {
  return actor.kind === 'public'
    ? 'public'
    : actor.kind === 'admin'
      ? `admin:${actor.id}`
      : actor.kind === 'barber'
        ? `barber:${actor.id}:${actor.professionalId}`
        : `customer:${actor.reservationId}`;
}
