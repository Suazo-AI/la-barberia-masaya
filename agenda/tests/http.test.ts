import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as nodeRequest } from 'node:http';
import test from 'node:test';
import { AgendaError } from '../core/contracts.ts';
import type {
  AgendaBackup,
  AgendaService,
  BookingReceipt,
  Catalog,
  CreateBookingInput,
  MutationContext,
  ScheduleBlock,
} from '../core/contracts.ts';
import { migrateSqlite, SqliteStore } from '../adapters/sqlite.ts';
import { createAgendaService } from '../core/index.ts';
import { localFixtureConfig } from '../fixtures/local.ts';
import { startAgendaNodeServer } from '../adapters/node-server.ts';
import { createAgendaWorker } from '../adapters/worker.ts';
import { AGENDA_API_PREFIX, createAgendaRouter } from '../http/router.ts';
import { createSqlRateLimiter } from '../http/rate-limit.ts';
import type { AgendaRouterOptions, MutationRateLimiter } from '../http/ports.ts';

const ORIGIN = 'http://127.0.0.1:4319';
const TOKEN = Buffer.alloc(32, 7).toString('base64url');
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');
const INPUT = {
  serviceId: 'cut',
  professionalId: 'a',
  date: '2026-10-05',
  startMinute: 840,
  configVersion: 1,
  managementToken: TOKEN,
};
const RECEIPT: BookingReceipt = {
  mode: 'fixture',
  notification: 'disabled',
  customerManagement: 'token',
  booking: {
    id: 'reservation-1',
    kind: 'booking',
    serviceId: 'cut',
    serviceName: 'Fixture service',
    professionalId: 'a',
    professionalName: 'Fixture professional',
    date: '2026-10-05',
    startMinute: 840,
    endMinute: 870,
    startAt: '2026-10-05T20:00:00.000Z',
    endAt: '2026-10-05T20:30:00.000Z',
    durationMinutes: 30,
    priceMinorUnits: 20000,
    currency: 'NIO',
    status: 'confirmed',
    version: 1,
  },
};
const CATALOG: Catalog = {
  mode: 'fixture',
  configVersion: 1,
  businessName: 'Fixture',
  timeZone: 'America/Managua',
  currency: 'NIO',
  services: [],
  professionals: [],
  dateRange: { min: '2026-10-04', max: '2026-10-25' },
  slotStepMinutes: 15,
  cancellationLeadMinutes: 60,
  notifications: 'disabled',
  customerManagement: 'token',
};
const BLOCK: ScheduleBlock = {
  id: 'block-1',
  professionalId: 'a',
  date: '2026-10-05',
  startMinute: 840,
  endMinute: 870,
  label: 'Fixture block',
  status: 'active',
  version: 1,
};
const ALLOW_RATE: MutationRateLimiter = {
  async consume() {
    return { allowed: true, retryAfterSeconds: 60 };
  },
};

function service(overrides: Partial<AgendaService> = {}): AgendaService {
  return {
    async catalog() {
      return CATALOG;
    },
    async availability(input) {
      return {
        date: input.date,
        timeZone: 'America/Managua',
        mode: 'fixture',
        slots: [],
        reason: 'closed',
      };
    },
    async createBooking() {
      return RECEIPT;
    },
    async authorizeCustomer(id, hash) {
      return id === RECEIPT.booking.id && hash === TOKEN_HASH;
    },
    async getBooking() {
      return RECEIPT;
    },
    async listBookings() {
      return [RECEIPT.booking];
    },
    async cancelBooking() {
      return RECEIPT;
    },
    async rescheduleBooking() {
      return RECEIPT;
    },
    async createWalkIn() {
      return RECEIPT;
    },
    async createBlock() {
      return BLOCK;
    },
    async listBlocks() {
      return [BLOCK];
    },
    async cancelBlock() {
      return BLOCK;
    },
    async exportData() {
      return {
        format: 'portable-agenda',
        version: 1,
        exportedAt: '2026-10-04T00:00:00.000Z',
        config: {} as AgendaBackup['config'],
        tables: [],
      };
    },
    ...overrides,
  };
}

function router(overrides: Partial<AgendaRouterOptions> = {}) {
  return createAgendaRouter({
    service: service(),
    mode: 'fixture',
    allowedOrigins: [ORIGIN],
    adminSubjects: [],
    rateLimiter: ALLOW_RATE,
    ...overrides,
  });
}

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
    origin?: string | null;
  } = {},
): Request {
  const method =
    options.method ??
    (options.body !== undefined || options.rawBody !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = 'retry-key-0001';
    if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  }
  return new Request(`${ORIGIN}${AGENDA_API_PREFIX}${path}`, {
    method,
    headers: { ...headers, ...options.headers },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.rawBody !== undefined ? { body: options.rawBody } : {}),
  });
}

async function code(response: Response): Promise<string> {
  const data = (await response.json()) as { error: { code: string } };
  return data.error.code;
}

test('public creation hashes the private capability, passes a versioned anonymous actor and returns no secret', async () => {
  let received: CreateBookingInput | undefined;
  let mutation: MutationContext | undefined;
  const handle = router({
    service: service({
      async createBooking(input, context) {
        received = input;
        mutation = context;
        return RECEIPT;
      },
    }),
  });
  const result = await handle(
    request('/bookings', { body: { ...INPUT, customer: { email: 'fixture@example.invalid' } } }),
  );
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(received?.managementHash, TOKEN_HASH);
  assert.deepEqual(received?.customer, { email: 'fixture@example.invalid' });
  assert.deepEqual(mutation, {
    idempotencyKey: 'retry-key-0001',
    actor: { kind: 'public' },
    configVersion: 1,
  });
  const serialized = await result.text();
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes(TOKEN_HASH), false);
  assert.deepEqual(JSON.parse(serialized), RECEIPT);
});

test('production and unconfigured activation fail closed before any domain call', async () => {
  let calls = 0;
  const fake = service({
    async catalog() {
      calls += 1;
      return CATALOG;
    },
    async createBooking() {
      calls += 1;
      return RECEIPT;
    },
  });
  for (const mode of ['production', 'unconfigured'] as const) {
    const result = await router({ service: fake, mode })(request('/bookings', { body: INPUT }));
    assert.equal(result.status, 503);
    assert.equal(await code(result), 'CONFIGURATION_REQUIRED');
    const catalog = await router({ service: fake, mode })(request('/catalog'));
    assert.equal(catalog.status, 503);
    assert.equal(await code(catalog), 'CONFIGURATION_REQUIRED');
    const availability = await router({ service: fake, mode })(
      request('/availability?serviceId=cut&date=2026-10-05'),
    );
    assert.equal(availability.status, 503);
  }
  assert.equal(calls, 0);
});

test('mutation origin must match the explicit allowlist and no forged identity bypasses it', async () => {
  let calls = 0;
  const handle = router({
    service: service({
      async createBooking() {
        calls += 1;
        return RECEIPT;
      },
    }),
  });
  for (const origin of [
    null,
    'null',
    'https://example.invalid',
    `${ORIGIN}.evil`,
    `${ORIGIN}, https://evil.invalid`,
  ]) {
    const result = await handle(
      request('/bookings', { body: INPUT, origin, headers: { 'X-User': 'owner' } }),
    );
    assert.equal(result.status, 403);
    assert.equal(await code(result), 'FORBIDDEN');
  }
  assert.equal(calls, 0);
  assert.throws(() => router({ allowedOrigins: ['*'] }));
  assert.throws(() => router({ allowedOrigins: [`${ORIGIN}/path`] }));
});

test('strict body validation rejects injected actors, hashes, bad versions and malformed JSON', async () => {
  let calls = 0;
  const handle = router({
    service: service({
      async createBooking() {
        calls += 1;
        return RECEIPT;
      },
    }),
  });
  for (const body of [
    { ...INPUT, actor: { kind: 'admin', id: 'owner' } },
    { ...INPUT, managementHash: TOKEN_HASH },
    { ...INPUT, configVersion: 0 },
    { ...INPUT, configVersion: '1' },
    { ...INPUT, managementToken: 'short' },
    { ...INPUT, date: '2026-02-30' },
    { ...INPUT, startMinute: 1.5 },
    { ...INPUT, customer: { email: 'not-an-email' } },
    { ...INPUT, customer: {} },
    [],
    null,
  ]) {
    const result = await handle(request('/bookings', { body }));
    assert.equal(result.status, 400);
    assert.equal(await code(result), 'INVALID_INPUT');
  }
  assert.equal((await handle(request('/bookings', { rawBody: '{' }))).status, 400);
  assert.equal(
    (await handle(request('/bookings', { body: INPUT, headers: { 'Content-Type': 'text/plain' } })))
      .status,
    415,
  );
  assert.equal(
    (await handle(request('/bookings', { body: INPUT, headers: { 'Idempotency-Key': 'short' } })))
      .status,
    400,
  );
  assert.equal(calls, 0);
});

test('actual UTF-8 body bytes and bounded query parsing are enforced', async () => {
  const handle = router({ bodyLimitBytes: 512 });
  const tooLarge = await handle(
    request('/bookings', { body: { ...INPUT, customer: { displayName: '剪'.repeat(200) } } }),
  );
  assert.equal(tooLarge.status, 413);
  assert.equal(await code(tooLarge), 'PAYLOAD_TOO_LARGE');
  const declared = await handle(
    request('/bookings', { body: INPUT, headers: { 'Content-Length': '100000' } }),
  );
  assert.equal(declared.status, 413);
  for (const path of [
    '/availability?serviceId=cut&serviceId=beard&date=2026-10-05',
    '/availability?serviceId=cut&date=2026-10-05&actor=admin',
    '/availability?serviceId=cut&date=2026-02-30',
    `/availability?serviceId=${'a'.repeat(2200)}&date=2026-10-05`,
  ])
    assert.equal((await handle(request(path))).status, 400);
  const method = await handle(request('/catalog', { method: 'POST', body: {} }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('Allow'), 'GET');
});

test('customer access verifies the capability against exactly one reservation and never grants admin access', async () => {
  let actor: MutationContext['actor'] | undefined;
  const handle = router({
    service: service({
      async cancelBooking(_id, _version, mutation) {
        actor = mutation.actor;
        return RECEIPT;
      },
    }),
  });
  const headers = { Authorization: `Bearer ${TOKEN}` };
  assert.equal((await handle(request('/bookings/reservation-1', { headers }))).status, 200);
  for (const [path, value] of [
    ['/bookings/reservation-2', `Bearer ${TOKEN}`],
    ['/bookings/reservation-1', 'Bearer wrong'],
    ['/bookings/reservation-1', `Bearer ${TOKEN}, Bearer ${TOKEN}`],
    ['/bookings/reservation-1', ''],
  ]) {
    const result = await handle(request(path, { headers: { Authorization: value } }));
    assert.equal(result.status, 403);
    assert.equal(await code(result), 'FORBIDDEN');
  }
  const cancelled = await handle(
    request('/bookings/reservation-1/cancel', {
      body: { expectedVersion: 1, configVersion: 1 },
      headers,
    }),
  );
  assert.equal(cancelled.status, 200);
  assert.deepEqual(actor, { kind: 'customer', reservationId: 'reservation-1' });
  assert.equal((await handle(request('/admin/schedule?date=2026-10-05', { headers }))).status, 503);
  assert.equal(
    (await handle(request(`/bookings/reservation-1?token=${TOKEN}`, { headers }))).status,
    400,
  );
});

test('admin data and export require the trusted server resolver and exact owner allowlist', async () => {
  let privateCalls = 0;
  const fake = service({
    async listBookings() {
      privateCalls += 1;
      return [RECEIPT.booking];
    },
    async exportData() {
      privateCalls += 1;
      return {
        format: 'portable-agenda',
        version: 1,
        exportedAt: '',
        config: {} as AgendaBackup['config'],
        tables: [],
      };
    },
  });
  const forged = request('/admin/schedule?date=2026-10-05', {
    headers: { 'X-User': 'owner', 'X-Authenticated-User': 'owner', Authorization: 'Bearer owner' },
  });
  assert.equal((await router({ service: fake, adminSubjects: ['owner'] })(forged)).status, 503);
  const denied = router({
    service: fake,
    adminSubjects: ['owner'],
    identityResolver: {
      async resolve() {
        return { subject: 'outsider' };
      },
    },
  });
  assert.equal((await denied(request('/admin/export'))).status, 403);
  assert.equal(privateCalls, 0);
  const allowed = router({
    service: fake,
    adminSubjects: ['owner'],
    identityResolver: {
      async resolve() {
        return { subject: 'owner' };
      },
    },
  });
  const result = await allowed(request('/admin/schedule?date=2026-10-05&includeCancelled=true'));
  assert.equal(result.status, 200);
  const exported = await allowed(request('/admin/export'));
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('Cache-Control'), 'no-store');
  assert.match(exported.headers.get('Content-Disposition') ?? '', /attachment/);
  assert.equal(privateCalls, 2);
});

test('rate rejection and unknown domain failures reveal no raw SQL, token or customer detail', async () => {
  let calls = 0;
  const fake = service({
    async createBooking() {
      calls += 1;
      throw new Error(`SQL detail ${TOKEN} private@example.invalid`);
    },
  });
  const limited = await router({
    service: fake,
    rateLimiter: {
      async consume() {
        return { allowed: false, retryAfterSeconds: 12 };
      },
    },
  })(request('/bookings', { body: INPUT }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '12');
  assert.equal(calls, 0);
  const noGuard = await router({ service: fake, rateLimiter: undefined })(
    request('/bookings', { body: INPUT }),
  );
  assert.equal(noGuard.status, 503);
  assert.equal(calls, 0);
  const failure = await router({ service: fake })(request('/bookings', { body: INPUT }));
  assert.equal(failure.status, 503);
  const serialized = await failure.text();
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes('private@'), false);
  assert.equal(serialized.includes('SQL detail'), false);
  assert.equal(JSON.parse(serialized).error.code, 'STORAGE_UNAVAILABLE');
  const changed = await router({
    service: service({
      async createBooking() {
        throw new AgendaError('CONFIGURATION_CHANGED', 409, 'internal pricing details');
      },
    }),
  })(request('/bookings', { body: INPUT }));
  assert.equal(changed.status, 409);
  assert.equal(await code(changed), 'CONFIGURATION_CHANGED');
});

test('SQL global rate buckets remain capped, scoped and expire without client identifiers', async () => {
  const store = new SqliteStore(':memory:');
  try {
    await store.run(
      'CREATE TABLE agenda_rate_limits (scope TEXT, bucket INTEGER, count INTEGER, PRIMARY KEY(scope,bucket))',
    );
    let instant = new Date('2026-10-04T12:00:01Z');
    const limiter = createSqlRateLimiter(store, {
      now: () => instant,
      limits: { 'public-booking': 2 },
    });
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => limiter.consume('public-booking')),
    );
    assert.equal(attempts.filter((result) => result.allowed).length, 2);
    assert.equal(attempts[7].retryAfterSeconds, 59);
    assert.equal((await limiter.consume('customer-management')).allowed, true);
    const rows = await store.all<{ scope: string; count: number }>(
      'SELECT scope, count FROM agenda_rate_limits',
    );
    assert.equal(rows.find((row) => row.scope === 'public-booking')?.count, 2);
    instant = new Date('2026-10-04T12:01:01Z');
    assert.equal((await limiter.consume('public-booking')).allowed, true);
    instant = new Date('2026-10-06T12:00:01Z');
    assert.equal((await limiter.consume('public-booking')).allowed, true);
    assert.equal((await store.all('SELECT * FROM agenda_rate_limits')).length, 1);
  } finally {
    store.close();
  }
});

test('loopback Node bridge serves the real HTTP contract and rejects a spoofed Host', async () => {
  const running = await startAgendaNodeServer({
    service: service(),
    mode: 'fixture',
    fixtureAdmin: true,
    rateLimiter: ALLOW_RATE,
    bodyLimitBytes: 512,
  });
  try {
    const result = await fetch(`${running.origin}${AGENDA_API_PREFIX}/bookings`, {
      method: 'POST',
      headers: {
        Origin: running.origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'bridge-retry-01',
      },
      body: JSON.stringify(INPUT),
    });
    assert.equal(result.status, 201);
    const oversizedOptions: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: {
        Origin: running.origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'bridge-oversize-01',
      },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({ ...INPUT, customer: { displayName: '剪'.repeat(200) } }),
            ),
          );
          controller.close();
        },
      }),
      duplex: 'half',
    };
    const oversized = await fetch(
      `${running.origin}${AGENDA_API_PREFIX}/bookings`,
      oversizedOptions,
    );
    assert.equal(oversized.status, 413);
    assert.equal(
      (await fetch(`${running.origin}${AGENDA_API_PREFIX}/admin/schedule?date=2026-10-05`)).status,
      200,
    );
    const spoofed = await new Promise<number | undefined>((resolve, reject) => {
      const operation = nodeRequest(
        `${running.origin}${AGENDA_API_PREFIX}/admin/export`,
        { headers: { Host: 'attacker.invalid' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      operation.on('error', reject);
      operation.end();
    });
    assert.equal(spoofed, 403);
  } finally {
    await running.close();
  }
  await assert.rejects(
    startAgendaNodeServer({ service: service(), mode: 'production', fixtureAdmin: true }),
    /outside fixture/,
  );
});

test('Worker adapter never activates fixtures and keeps production creation closed without host identity', async () => {
  let initialized = 0;
  const worker = createAgendaWorker<{ mode: 'fixture' | 'unconfigured' | 'production' }>({
    mode: (environment) => environment.mode,
    async createService() {
      initialized += 1;
      return service();
    },
    allowedOrigins: () => [ORIGIN],
    adminSubjects: () => [],
    createRateLimiter: () => ALLOW_RATE,
  });
  for (const mode of ['fixture', 'unconfigured'] as const) {
    assert.equal((await worker.fetch(request('/catalog'), { mode })).status, 503);
  }
  assert.equal(initialized, 0);
  const environment = { mode: 'production' as const };
  assert.equal(
    (await worker.fetch(request('/bookings', { body: INPUT }), environment)).status,
    503,
  );
  assert.equal((await worker.fetch(request('/catalog'), environment)).status, 503);
  assert.equal(initialized, 0);
});

test('real SQLite HTTP flow persists retries, owner-authorized changes and admin allocations atomically', async () => {
  const store = new SqliteStore(':memory:');
  const now = () => new Date('2026-10-04T15:00:00.000Z');
  await migrateSqlite(store);
  const domain = await createAgendaService(store, structuredClone(localFixtureConfig), { now });
  const running = await startAgendaNodeServer({
    service: domain,
    mode: 'fixture',
    fixtureAdmin: true,
    rateLimiter: createSqlRateLimiter(store, { now }),
  });
  let retry = 0;
  async function send(
    path: string,
    body?: unknown,
    token?: string,
    key?: string,
  ): Promise<Response> {
    return fetch(`${running.origin}${AGENDA_API_PREFIX}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined
          ? {}
          : {
              Origin: running.origin,
              'Content-Type': 'application/json',
              'Idempotency-Key': key ?? `integration-key-${++retry}`,
            }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  try {
    const catalog = await send('/catalog');
    assert.equal(catalog.status, 200);
    assert.equal(((await catalog.json()) as Catalog).configVersion, 1);
    const created = await send('/bookings', INPUT, undefined, 'same-create-key');
    assert.equal(created.status, 201);
    const original = (await created.json()) as BookingReceipt;
    const replay = await send('/bookings', INPUT, undefined, 'same-create-key');
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), original);
    assert.equal((await send(`/bookings/${original.booking.id}`)).status, 403);
    const owned = await send(`/bookings/${original.booking.id}`, undefined, TOKEN);
    assert.equal(owned.status, 200);
    const ownedText = await owned.text();
    assert.equal(ownedText.includes(TOKEN), false);
    assert.equal(ownedText.includes(TOKEN_HASH), false);
    const walkIn = await send('/admin/walk-ins', {
      serviceId: 'cut',
      professionalId: 'a',
      date: INPUT.date,
      startMinute: 900,
      configVersion: 1,
    });
    assert.equal(walkIn.status, 201);
    assert.equal(((await walkIn.json()) as BookingReceipt).booking.kind, 'walk-in');
    const blocked = await send('/admin/blocks', {
      professionalId: 'a',
      date: INPUT.date,
      startMinute: 930,
      endMinute: 960,
      label: 'Fixture interval',
      configVersion: 1,
    });
    assert.equal(blocked.status, 201);
    const block = (await blocked.json()) as ScheduleBlock;
    const conflict = await send(
      `/bookings/${original.booking.id}/reschedule`,
      {
        date: INPUT.date,
        startMinute: 930,
        professionalId: 'a',
        expectedVersion: 1,
        configVersion: 1,
      },
      TOKEN,
    );
    assert.equal(conflict.status, 409);
    assert.equal(await code(conflict), 'SLOT_UNAVAILABLE');
    const unchanged = (await (
      await send(`/bookings/${original.booking.id}`, undefined, TOKEN)
    ).json()) as BookingReceipt;
    assert.equal(unchanged.booking.startMinute, INPUT.startMinute);
    assert.equal(unchanged.booking.version, 1);
    const moved = await send(
      `/bookings/${original.booking.id}/reschedule`,
      {
        date: INPUT.date,
        startMinute: 960,
        professionalId: 'a',
        expectedVersion: 1,
        configVersion: 1,
      },
      TOKEN,
    );
    assert.equal(moved.status, 200);
    assert.equal(((await moved.json()) as BookingReceipt).booking.version, 2);
    const cancellation = { expectedVersion: 2, configVersion: 1 };
    const cancelled = await send(
      `/bookings/${original.booking.id}/cancel`,
      cancellation,
      TOKEN,
      'same-cancel-key',
    );
    assert.equal(cancelled.status, 200);
    const cancelledReceipt = (await cancelled.json()) as BookingReceipt;
    assert.equal(cancelledReceipt.booking.status, 'cancelled');
    assert.deepEqual(
      await (
        await send(
          `/bookings/${original.booking.id}/cancel`,
          cancellation,
          TOKEN,
          'same-cancel-key',
        )
      ).json(),
      cancelledReceipt,
    );
    assert.equal(
      (await send(`/admin/blocks/${block.id}/cancel`, { expectedVersion: 1, configVersion: 1 }))
        .status,
      200,
    );
    const schedule = await send(`/admin/schedule?date=${INPUT.date}&includeCancelled=true`);
    const listings = (await schedule.json()) as { bookings: unknown[]; blocks: unknown[] };
    assert.equal(listings.bookings.length, 2);
    assert.equal(listings.blocks.length, 1);
    const exported = await send('/admin/export');
    assert.equal(exported.status, 200);
    const backup = (await exported.json()) as AgendaBackup;
    assert.equal(backup.format, 'portable-agenda');
    assert.equal(backup.version, 1);
    assert.equal(JSON.stringify(backup).includes(TOKEN), false);
  } finally {
    await running.close();
    store.close();
  }
});
