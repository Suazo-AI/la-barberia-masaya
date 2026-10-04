import { AgendaError } from '../core/contracts.ts';
import type {
  Actor,
  CreateBlockInput,
  CreateBookingInput,
  ListQuery,
  MutationContext,
  RescheduleInput,
} from '../core/contracts.ts';
import { adminActor } from './ports.ts';
import type {
  AgendaHandler,
  AgendaRequestContext,
  AgendaRouterOptions,
  RateScope,
} from './ports.ts';

export const AGENDA_API_PREFIX = '/api/agenda/v1';
const DEFAULT_BODY_LIMIT = 8192;
const MAX_URL_LENGTH = 2048;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const CAPABILITY = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const ERROR_MESSAGES: Record<string, string> = {
  CONFIGURATION_REQUIRED: 'The booking system has not been configured.',
  CONFIGURATION_CHANGED: 'The booking configuration requires administrator review.',
  INVALID_INPUT: 'The request is invalid.',
  NOT_FOUND: 'The requested resource was not found.',
  FORBIDDEN: 'This request is not authorized.',
  SLOT_UNAVAILABLE: 'The requested time is no longer available.',
  VERSION_CONFLICT: 'The reservation changed. Reload it before trying again.',
  POLICY_RESTRICTION: 'This change is outside the configured reservation policy.',
  IDEMPOTENCY_CONFLICT: 'This retry key was already used for a different request.',
  STORAGE_UNAVAILABLE: 'The booking system is temporarily unavailable.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'Use application/json for this request.',
  METHOD_NOT_ALLOWED: 'This method is not allowed.',
};

function fail(code: string, status: number): never {
  throw new AgendaError(
    code,
    status,
    ERROR_MESSAGES[code] ?? 'The request could not be completed.',
  );
}

function response(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Vary', 'Origin');
  return new Response(JSON.stringify(data), { status, headers });
}

export function agendaUnavailableResponse(): Response {
  return response(
    { error: { code: 'CONFIGURATION_REQUIRED', message: ERROR_MESSAGES.CONFIGURATION_REQUIRED } },
    503,
  );
}

function allowedMethod(path: string): 'GET' | 'POST' | undefined {
  if (['/catalog', '/availability', '/admin/schedule', '/admin/export'].includes(path))
    return 'GET';
  if (['/bookings', '/admin/walk-ins', '/admin/blocks'].includes(path)) return 'POST';
  if (/^\/bookings\/[^/]+$/.test(path)) return 'GET';
  if (/^\/bookings\/[^/]+\/(cancel|reschedule)$/.test(path)) return 'POST';
  if (/^\/admin\/bookings\/[^/]+\/(cancel|reschedule)$/.test(path)) return 'POST';
  if (/^\/admin\/blocks\/[^/]+\/cancel$/.test(path)) return 'POST';
  return undefined;
}

function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Allowed origins must be exact HTTP(S) origins.');
  }
  return url.origin;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('INVALID_INPUT', 400);
  return value;
}

function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('INVALID_INPUT', 400);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail('INVALID_INPUT', 400);
  }
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail('INVALID_INPUT', 400);
  }
  return value;
}

function object(value: unknown, allowedKeys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', 400);
  }
  const result = value as Record<string, unknown>;
  if (allowedKeys && Object.keys(result).some((key) => !allowedKeys.includes(key))) {
    fail('INVALID_INPUT', 400);
  }
  return result;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') fail('INVALID_INPUT', 400);
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    fail('INVALID_INPUT', 400);
  }
  return result;
}

function query(url: URL, allowedKeys: readonly string[]): URLSearchParams {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      fail('INVALID_INPUT', 400);
    }
  }
  return url.searchParams;
}

function listQuery(url: URL): ListQuery {
  const params = query(url, ['date', 'professionalId', 'includeCancelled']);
  const cancelled = params.get('includeCancelled');
  if (cancelled !== null && cancelled !== 'true' && cancelled !== 'false') {
    fail('INVALID_INPUT', 400);
  }
  return {
    date: date(params.get('date')),
    ...(params.has('professionalId')
      ? { professionalId: identifier(params.get('professionalId')) }
      : {}),
    includeCancelled: cancelled === 'true',
  };
}

function bookingInput(body: Record<string, unknown>): CreateBookingInput {
  const result: CreateBookingInput = {
    serviceId: identifier(body.serviceId),
    date: date(body.date),
    startMinute: integer(body.startMinute, 0, 1439),
  };
  if (body.professionalId !== undefined) result.professionalId = identifier(body.professionalId);
  if (body.customer !== undefined) {
    const customer = object(body.customer, ['displayName', 'email']);
    if (customer.displayName === undefined && customer.email === undefined) {
      fail('INVALID_INPUT', 400);
    }
    result.customer = {};
    if (customer.displayName !== undefined) {
      result.customer.displayName = text(customer.displayName, 120);
    }
    if (customer.email !== undefined) {
      const email = text(customer.email, 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('INVALID_INPUT', 400);
      result.customer.email = email;
    }
  }
  return result;
}

function rescheduleInput(body: Record<string, unknown>): RescheduleInput {
  return {
    date: date(body.date),
    startMinute: integer(body.startMinute, 0, 1439),
    professionalId: identifier(body.professionalId),
  };
}

function expectedVersion(body: Record<string, unknown>): number {
  return integer(body.expectedVersion, 1, 2_147_483_647);
}

async function capabilityHash(token: unknown): Promise<string> {
  if (typeof token !== 'string' || !CAPABILITY.test(token)) fail('FORBIDDEN', 403);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function jsonBody(request: Request, limit: number): Promise<Record<string, unknown>> {
  const type = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') fail('UNSUPPORTED_MEDIA_TYPE', 415);
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) fail('INVALID_INPUT', 400);
    if (Number(contentLength) > limit) fail('PAYLOAD_TOO_LARGE', 413);
  }
  if (!request.body) fail('INVALID_INPUT', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        fail('PAYLOAD_TOO_LARGE', 413);
      }
      chunks.push(next.value);
    }
    const combined = new Uint8Array(bytes);
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.byteLength;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(combined);
    return object(JSON.parse(decoded));
  } catch (error) {
    if (error instanceof AgendaError) throw error;
    fail('INVALID_INPUT', 400);
  } finally {
    reader.releaseLock();
  }
}

export function createAgendaRouter(options: AgendaRouterOptions): AgendaHandler {
  const { service, mode, identityResolver, rateLimiter } = options;
  const origins = new Set(options.allowedOrigins.map(canonicalOrigin));
  const subjects = new Set(options.adminSubjects.filter((subject) => subject.length > 0));
  const bodyLimit = options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT;
  if (!Number.isInteger(bodyLimit) || bodyLimit < 512 || bodyLimit > 65_536) {
    throw new Error('Body limit must be between 512 and 65536 bytes.');
  }

  function checkOrigin(request: Request, required: boolean): void {
    const origin = request.headers.get('Origin');
    if (origin === null && !required) return;
    if (origin === null || !origins.has(origin)) fail('FORBIDDEN', 403);
  }

  function productionReady(): void {
    if (
      mode === 'unconfigured' ||
      (mode === 'production' && (!identityResolver || subjects.size === 0))
    ) {
      fail('CONFIGURATION_REQUIRED', 503);
    }
  }

  async function consume(scope: RateScope): Promise<void> {
    if (!rateLimiter) fail('CONFIGURATION_REQUIRED', 503);
    const result = await rateLimiter.consume(scope);
    if (!result.allowed) {
      const error = new AgendaError('RATE_LIMITED', 429, ERROR_MESSAGES.RATE_LIMITED);
      Object.assign(error, { retryAfterSeconds: result.retryAfterSeconds });
      throw error;
    }
  }

  async function admin(request: Request, context: AgendaRequestContext): Promise<Actor> {
    if (!identityResolver || subjects.size === 0) fail('CONFIGURATION_REQUIRED', 503);
    checkOrigin(request, false);
    const identity = await identityResolver.resolve(request, context);
    if (!identity || !subjects.has(identity.subject)) fail('FORBIDDEN', 403);
    return adminActor(identity.subject);
  }

  async function customer(request: Request, id: string): Promise<Actor> {
    productionReady();
    await consume('customer-management');
    const authorization = request.headers.get('Authorization');
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/i);
    if (!match) fail('FORBIDDEN', 403);
    const hash = await capabilityHash(match[1]);
    if (!(await service.authorizeCustomer(id, hash))) fail('FORBIDDEN', 403);
    return { kind: 'customer', reservationId: id };
  }

  function mutationContext(
    request: Request,
    actor: Actor,
    body: Record<string, unknown>,
  ): MutationContext {
    checkOrigin(request, true);
    const key = request.headers.get('Idempotency-Key');
    if (key === null || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(key)) {
      fail('INVALID_INPUT', 400);
    }
    return {
      idempotencyKey: key,
      actor,
      configVersion: integer(body.configVersion, 1, 2_147_483_647),
    };
  }

  return async (request, context = { runtime: 'test' }) => {
    try {
      if (request.url.length > MAX_URL_LENGTH) fail('INVALID_INPUT', 400);
      const url = new URL(request.url);
      if (!url.pathname.startsWith(`${AGENDA_API_PREFIX}/`)) fail('NOT_FOUND', 404);
      const path = url.pathname.slice(AGENDA_API_PREFIX.length);
      const method = request.method.toUpperCase();
      const allowed = allowedMethod(path);
      if (!allowed) fail('NOT_FOUND', 404);
      if (method !== allowed) {
        return response(
          { error: { code: 'METHOD_NOT_ALLOWED', message: ERROR_MESSAGES.METHOD_NOT_ALLOWED } },
          405,
          { Allow: allowed },
        );
      }
      productionReady();

      if (path === '/catalog' && method === 'GET') {
        query(url, []);
        return response(await service.catalog());
      }
      if (path === '/availability' && method === 'GET') {
        const params = query(url, ['serviceId', 'professionalId', 'date']);
        return response(
          await service.availability({
            serviceId: identifier(params.get('serviceId')),
            date: date(params.get('date')),
            ...(params.has('professionalId')
              ? { professionalId: identifier(params.get('professionalId')) }
              : {}),
          }),
        );
      }
      if (path === '/bookings' && method === 'POST') {
        query(url, []);
        productionReady();
        checkOrigin(request, true);
        await consume('public-booking');
        const body = object(await jsonBody(request, bodyLimit), [
          'serviceId',
          'professionalId',
          'date',
          'startMinute',
          'customer',
          'managementToken',
          'configVersion',
        ]);
        const mutation = mutationContext(request, { kind: 'public' }, body);
        const input = bookingInput(body);
        if (typeof body.managementToken !== 'string' || !CAPABILITY.test(body.managementToken)) {
          fail('INVALID_INPUT', 400);
        }
        input.managementHash = await capabilityHash(body.managementToken);
        return response(await service.createBooking(input, mutation), 201);
      }

      const customerRoute = path.match(/^\/bookings\/([^/]+)(?:\/(cancel|reschedule))?$/);
      if (customerRoute) {
        query(url, []);
        const id = identifier(customerRoute[1]);
        const action = customerRoute[2];
        if ((!action && method !== 'GET') || (action && method !== 'POST')) {
          fail('METHOD_NOT_ALLOWED', 405);
        }
        if (action) checkOrigin(request, true);
        const actor = await customer(request, id);
        if (!action) return response(await service.getBooking(id, actor));
        const body = object(
          await jsonBody(request, bodyLimit),
          action === 'cancel'
            ? ['expectedVersion', 'configVersion']
            : ['expectedVersion', 'date', 'startMinute', 'professionalId', 'configVersion'],
        );
        const mutation = mutationContext(request, actor, body);
        return response(
          action === 'cancel'
            ? await service.cancelBooking(id, expectedVersion(body), mutation)
            : await service.rescheduleBooking(
                id,
                rescheduleInput(body),
                expectedVersion(body),
                mutation,
              ),
        );
      }

      if (path.startsWith('/admin/')) {
        productionReady();
        const actor = await admin(request, context);
        if (path === '/admin/schedule' && method === 'GET') {
          const filter = listQuery(url);
          const [bookings, blocks] = await Promise.all([
            service.listBookings(filter),
            service.listBlocks(filter),
          ]);
          return response({ bookings, blocks });
        }
        if (path === '/admin/export' && method === 'GET') {
          query(url, []);
          await consume('admin-mutation');
          const backup = await service.exportData();
          return response(backup, 200, {
            'Content-Disposition': 'attachment; filename="agenda-backup-v1.json"',
          });
        }
        if (method === 'POST') {
          query(url, []);
          checkOrigin(request, true);
          await consume('admin-mutation');
          const rawBody = await jsonBody(request, bodyLimit);
          const mutation = mutationContext(request, actor, rawBody);
          if (path === '/admin/walk-ins') {
            const body = object(rawBody, [
              'serviceId',
              'professionalId',
              'date',
              'startMinute',
              'customer',
              'configVersion',
            ]);
            return response(await service.createWalkIn(bookingInput(body), mutation), 201);
          }
          if (path === '/admin/blocks') {
            const body = object(rawBody, [
              'professionalId',
              'date',
              'startMinute',
              'endMinute',
              'label',
              'configVersion',
            ]);
            const input: CreateBlockInput = {
              professionalId: identifier(body.professionalId),
              date: date(body.date),
              startMinute: integer(body.startMinute, 0, 1439),
              endMinute: integer(body.endMinute, 1, 1440),
              label: text(body.label, 120),
            };
            if (input.endMinute <= input.startMinute) fail('INVALID_INPUT', 400);
            return response(await service.createBlock(input, mutation), 201);
          }
          const operation = path.match(
            /^\/admin\/(bookings|blocks)\/([^/]+)\/(cancel|reschedule)$/,
          );
          if (operation) {
            const [, kind, rawId, action] = operation;
            const id = identifier(rawId);
            if (kind === 'blocks' && action !== 'cancel') fail('NOT_FOUND', 404);
            const body = object(
              rawBody,
              action === 'cancel'
                ? ['expectedVersion', 'configVersion']
                : ['expectedVersion', 'date', 'startMinute', 'professionalId', 'configVersion'],
            );
            const version = expectedVersion(body);
            if (kind === 'blocks') {
              return response(await service.cancelBlock(id, version, mutation));
            }
            return response(
              action === 'cancel'
                ? await service.cancelBooking(id, version, mutation)
                : await service.rescheduleBooking(id, rescheduleInput(body), version, mutation),
            );
          }
        }
      }
      fail('NOT_FOUND', 404);
    } catch (error) {
      const known = error instanceof AgendaError && ERROR_MESSAGES[error.code] !== undefined;
      const code = known ? error.code : 'STORAGE_UNAVAILABLE';
      const status = known ? error.status : 503;
      const extra: Record<string, string> = {};
      if (code === 'RATE_LIMITED') {
        const seconds = (error as AgendaError & { retryAfterSeconds?: number }).retryAfterSeconds;
        extra['Retry-After'] = String(Math.max(1, Math.min(seconds ?? 60, 3600)));
      }
      return response({ error: { code, message: ERROR_MESSAGES[code] } }, status, extra);
    }
  };
}
