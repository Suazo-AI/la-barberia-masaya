import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import { localFixtureConfig, unconfiguredConfig } from '../fixtures/local.ts';
import {
  AgendaError,
  canonicalStringify,
  createAgendaService,
  hashConfiguration,
  validateAgendaConfig,
} from '../core/index.ts';
import { addDays, fromUtcSeconds, localDate, toUtcSeconds } from '../core/time.ts';
import type {
  Actor,
  AgendaConfig,
  AgendaService,
  MutationContext,
  SqlStatement,
  SqlStore,
} from '../core/contracts.ts';

const fixedNow = () => new Date('2026-10-05T18:00:00Z'); // Monday noon in Managua.
const day = '2026-10-05';
const publicActor: Actor = { kind: 'public' };
const admin: Actor = { kind: 'admin', id: 'fixture-owner' };
const digest = 'a'.repeat(64);
const context = (key: string, actor: Actor = publicActor): MutationContext => ({
  idempotencyKey: key,
  actor,
  configVersion: 1,
});
const input = (startMinute = 780, professionalId?: string) => ({
  serviceId: 'cut',
  date: day,
  startMinute,
  ...(professionalId ? { professionalId } : {}),
});
const errorCode = (code: string) => (error: unknown) =>
  error instanceof AgendaError && error.code === code;

async function fixture(
  t: TestContext,
  config: AgendaConfig = structuredClone(localFixtureConfig),
  now = fixedNow,
) {
  const store = new SqliteStore(':memory:');
  t.after(() => store.close());
  await migrateSqlite(store);
  const agenda = createAgendaService(store, config, { now });
  return { agenda, store, config };
}

async function counts(store: SqliteStore) {
  return {
    entries: (await store.all<{ total: number }>('SELECT count(*) AS total FROM agenda_entries'))[0]
      .total,
    idempotency: (
      await store.all<{ total: number }>('SELECT count(*) AS total FROM agenda_idempotency')
    )[0].total,
    audit: (await store.all<{ total: number }>('SELECT count(*) AS total FROM agenda_audit'))[0]
      .total,
    outbox: (await store.all<{ total: number }>('SELECT count(*) AS total FROM agenda_outbox'))[0]
      .total,
  };
}

test('unconfigured and unverified production fail closed without inserting configuration or bookings', async (t) => {
  for (const config of [
    unconfiguredConfig,
    { ...localFixtureConfig, mode: 'production' as const },
  ]) {
    const { store, agenda } = await fixture(t, config);
    await assert.rejects(agenda.catalog(), errorCode('CONFIGURATION_REQUIRED'));
    await assert.rejects(
      agenda.createBooking(input(), context('closed-0001')),
      errorCode('CONFIGURATION_REQUIRED'),
    );
    assert.deepEqual(await counts(store), { entries: 0, idempotency: 0, audit: 0, outbox: 0 });
    assert.equal((await store.all('SELECT * FROM agenda_configuration')).length, 0);
  }
});

test('configuration validation requires sorted explicit shifts, eligible staff, integer prices and buffers', () => {
  assert.deepEqual(validateAgendaConfig(localFixtureConfig), []);
  const config = structuredClone(localFixtureConfig);
  config.professionals[0].weeklyHours[1] = [
    [780, 900],
    [850, 1140],
  ];
  config.services[0].professionalIds = ['missing'];
  config.services[0].priceMinorUnits = 20.5;
  config.services[0].bufferAfterMinutes = -1;
  assert.equal(validateAgendaConfig(config).length, 4);
});

test('local dates use Managua across UTC midnight and leap/date arithmetic round trips', async (t) => {
  const now = () => new Date('2026-10-06T05:45:00Z');
  const { agenda } = await fixture(t, undefined, now);
  assert.equal((await agenda.catalog()).dateRange.min, '2026-10-05');
  assert.equal(localDate(now()), '2026-10-05');
  assert.equal(toUtcSeconds('2026-10-05', 780), Date.parse('2026-10-05T19:00:00Z') / 1000);
  assert.deepEqual(fromUtcSeconds(toUtcSeconds('2026-10-05', 780)), {
    date: '2026-10-05',
    minute: 780,
  });
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => toUtcSeconds('2026-02-30', 780), errorCode('INVALID_INPUT'));
});

test('availability deduplicates Any, respects lead/horizon/Tuesday closure/duration and closing buffers', async (t) => {
  const { agenda } = await fixture(t);
  const catalog = await agenda.catalog();
  assert.equal(catalog.configVersion, 1);
  assert.equal(catalog.notifications, 'disabled');
  assert.equal(catalog.dateRange.max, '2026-10-26');
  const cut = await agenda.availability({ serviceId: 'cut', date: day });
  assert.equal(cut.reason, 'available');
  assert.equal(cut.slots[0].startMinute, 780);
  assert.deepEqual(cut.slots[0].professionalIds, ['a', 'b']);
  assert.equal(cut.slots.at(-1)!.startMinute, 1110);
  const combo = await agenda.availability({ serviceId: 'combo', professionalId: 'a', date: day });
  assert.equal(combo.slots.at(-1)!.startMinute, 1080);
  assert.equal(
    (await agenda.availability({ serviceId: 'cut', date: '2026-10-06' })).reason,
    'closed',
  );
  assert.equal(
    (await agenda.availability({ serviceId: 'cut', date: '2026-10-04' })).reason,
    'past',
  );
  await assert.rejects(
    agenda.availability({ serviceId: 'cut', date: '2026-10-27' }),
    errorCode('INVALID_INPUT'),
  );
  await assert.rejects(
    agenda.createBooking({ ...input(), startMinute: 781 }, context('grid-0001')),
    errorCode('INVALID_INPUT'),
  );
});

test('Any assigns one free professional and only two allocations succeed at a shared time', async (t) => {
  const { agenda, store } = await fixture(t);
  const first = await agenda.createBooking(input(), context('any-book-0001'));
  const second = await agenda.createBooking(
    { ...input(), customer: { email: 'fixture@example.invalid' } },
    context('any-book-0002'),
  );
  assert.equal(first.booking.professionalId, 'a');
  assert.equal(second.booking.professionalId, 'b');
  assert.equal(second.booking.customerDisplayName, undefined);
  await assert.rejects(
    agenda.createBooking(input(), context('any-book-0003')),
    errorCode('SLOT_UNAVAILABLE'),
  );
  assert.deepEqual(await counts(store), { entries: 2, idempotency: 2, audit: 2, outbox: 2 });
  const outbox = await store.all<{ status: string; recipient: string | null }>(
    'SELECT status, recipient FROM agenda_outbox ORDER BY recipient',
  );
  assert.ok(outbox.every((event) => event.status === 'disabled'));
  assert.equal(outbox[1].recipient, 'fixture@example.invalid');
});

test('preparation/cleanup buffers protect allocated intervals while adjacent intervals remain valid', async (t) => {
  const { agenda } = await fixture(t);
  await agenda.createBooking(
    { ...input(780, 'a'), serviceId: 'beard' },
    context('buffer-book-0001'),
  );
  await assert.rejects(
    agenda.createBooking(input(795, 'a'), context('buffer-book-0002')),
    errorCode('SLOT_UNAVAILABLE'),
  );
  const adjacent = await agenda.createBooking(input(810, 'a'), context('buffer-book-0003'));
  assert.equal(adjacent.booking.startMinute, 810);
  const other = await agenda.createBooking(input(795, 'b'), context('buffer-book-0004'));
  assert.equal(other.booking.professionalId, 'b');
  const beforeConfig = structuredClone(localFixtureConfig);
  beforeConfig.services[0].bufferBeforeMinutes = 10;
  const before = await fixture(t, beforeConfig);
  assert.equal(
    (await before.agenda.availability({ serviceId: 'cut', professionalId: 'a', date: day }))
      .slots[0].startMinute,
    795,
  );
});

test('idempotency preserves exact original response and changed payload conflicts without extra effects', async (t) => {
  const { agenda, store } = await fixture(t);
  const bookingInput = { ...input(780, 'a'), managementHash: digest };
  const ctx = context('idem-create-0001');
  const first = await agenda.createBooking(bookingInput, ctx);
  assert.deepEqual(await agenda.createBooking(bookingInput, ctx), first);
  await assert.rejects(
    agenda.createBooking({ ...bookingInput, startMinute: 810 }, ctx),
    errorCode('IDEMPOTENCY_CONFLICT'),
  );
  await assert.rejects(
    agenda.createBooking({ ...bookingInput, managementHash: 'b'.repeat(64) }, ctx),
    errorCode('IDEMPOTENCY_CONFLICT'),
  );
  assert.deepEqual(await counts(store), { entries: 1, idempotency: 1, audit: 1, outbox: 1 });
  const response = (
    await store.all<{ response_json: string }>('SELECT response_json FROM agenda_idempotency')
  )[0].response_json;
  assert.ok(!response.includes(digest));
  assert.ok(!response.includes('managementHash'));
});

test('customer capability is reservation scoped and response/export replies never expose its digest', async (t) => {
  const { agenda } = await fixture(t);
  const receipt = await agenda.createBooking(
    { ...input(780, 'a'), managementHash: digest },
    context('capability-0001'),
  );
  const id = receipt.booking.id;
  assert.equal(receipt.customerManagement, 'token');
  assert.equal(await agenda.authorizeCustomer(id, digest), true);
  assert.equal(await agenda.authorizeCustomer(id, 'b'.repeat(64)), false);
  assert.equal(await agenda.authorizeCustomer(id, 'invalid'), false);
  await assert.rejects(agenda.getBooking(id, publicActor), errorCode('FORBIDDEN'));
  await assert.rejects(
    agenda.getBooking(id, { kind: 'customer', reservationId: 'other-booking' }),
    errorCode('FORBIDDEN'),
  );
  await assert.rejects(
    agenda.cancelBooking(id, 1, context('cap-cancel-0001')),
    errorCode('FORBIDDEN'),
  );
  assert.deepEqual(await agenda.getBooking(id, { kind: 'customer', reservationId: id }), receipt);
  const backup = await agenda.exportData(admin);
  for (const name of ['agenda_idempotency', 'agenda_outbox'])
    assert.ok(!JSON.stringify(backup.tables.find((table) => table.name === name)).includes(digest));
});

test('conflicting reschedule rolls back entirely; successful move and cancel use optimistic versions', async (t) => {
  const { agenda, store } = await fixture(t);
  const first = await agenda.createBooking(input(780, 'a'), context('move-create-0001'));
  await agenda.createBooking(input(840, 'a'), context('move-create-0002'));
  const originalCounts = await counts(store);
  await assert.rejects(
    agenda.rescheduleBooking(
      first.booking.id,
      { date: day, startMinute: 840, professionalId: 'a' },
      1,
      context('move-conflict-0001', admin),
    ),
    errorCode('SLOT_UNAVAILABLE'),
  );
  assert.deepEqual(await counts(store), originalCounts);
  assert.deepEqual(await agenda.getBooking(first.booking.id, admin), first);
  const moved = await agenda.rescheduleBooking(
    first.booking.id,
    { date: day, startMinute: 810, professionalId: 'b' },
    1,
    context('move-valid-0001', admin),
  );
  assert.equal(moved.booking.version, 2);
  assert.equal(moved.booking.professionalId, 'b');
  await assert.rejects(
    agenda.cancelBooking(first.booking.id, 1, context('move-stale-0001', admin)),
    errorCode('VERSION_CONFLICT'),
  );
  const cancelled = await agenda.cancelBooking(
    first.booking.id,
    2,
    context('move-cancel-0001', admin),
  );
  assert.equal(cancelled.booking.version, 3);
  assert.equal(cancelled.booking.status, 'cancelled');
  assert.equal((await agenda.listBookings({ date: day }, admin)).length, 1);
  assert.equal((await agenda.listBookings({ date: day, includeCancelled: true }, admin)).length, 2);
});

test('walk-ins and blocks require admin and participate in the same conflict invariant', async (t) => {
  const { agenda, store } = await fixture(t);
  await assert.rejects(
    agenda.createWalkIn(input(), context('walk-public-0001')),
    errorCode('FORBIDDEN'),
  );
  const blockInput = {
    professionalId: 'a',
    date: day,
    startMinute: 780,
    endMinute: 840,
    label: 'Fixture break',
  };
  await assert.rejects(
    agenda.createBlock(blockInput, context('block-public-0001')),
    errorCode('FORBIDDEN'),
  );
  const block = await agenda.createBlock(blockInput, context('block-admin-0001', admin));
  await assert.rejects(
    agenda.createWalkIn(input(795, 'a'), context('walk-block-0001', admin)),
    errorCode('SLOT_UNAVAILABLE'),
  );
  await assert.rejects(
    agenda.createBooking(input(795, 'a'), context('book-block-0001')),
    errorCode('SLOT_UNAVAILABLE'),
  );
  const unblocked = await agenda.cancelBlock(block.id, 1, context('unblock-admin-0001', admin));
  assert.equal(unblocked.version, 2);
  const walkIn = await agenda.createWalkIn(input(795, 'a'), context('walk-admin-0001', admin));
  assert.equal(walkIn.booking.kind, 'walk-in');
  await assert.rejects(
    agenda.createBlock({ ...blockInput, startMinute: 810 }, context('block-conflict-0001', admin)),
    errorCode('SLOT_UNAVAILABLE'),
  );
  assert.equal((await agenda.listBlocks({ date: day }, admin)).length, 0);
  assert.equal((await agenda.listBlocks({ date: day, includeCancelled: true }, admin)).length, 1);
  assert.deepEqual(await counts(store), { entries: 2, idempotency: 3, audit: 3, outbox: 1 });
});

test('customer cancellation deadline is enforced while administrator can resolve the booking', async (t) => {
  let clock = fixedNow();
  const { agenda } = await fixture(t, undefined, () => clock);
  const created = await agenda.createBooking(
    { ...input(780, 'a'), managementHash: digest },
    context('policy-create-0001'),
  );
  clock = new Date('2026-10-05T18:30:00Z');
  await assert.rejects(
    agenda.cancelBooking(
      created.booking.id,
      1,
      context('policy-client-0001', { kind: 'customer', reservationId: created.booking.id }),
    ),
    errorCode('POLICY_RESTRICTION'),
  );
  assert.equal(
    (await agenda.cancelBooking(created.booking.id, 1, context('policy-admin-0001', admin))).booking
      .status,
    'cancelled',
  );
});

test('lost update after the advisory read rolls back idempotency, outbox and audit through SQL changes guard', async (t) => {
  const { agenda: winnerAgenda, store, config } = await fixture(t);
  const created = await winnerAgenda.createBooking(input(780, 'a'), context('race-created-0001'));
  let raced = false;
  const interleaved: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: async (statements: SqlStatement[]) => {
      if (
        !raced &&
        statements.some((statement) => statement.sql.startsWith('UPDATE agenda_entries'))
      ) {
        raced = true;
        await winnerAgenda.cancelBooking(created.booking.id, 1, context('race-winner-0001', admin));
      }
      return store.batch(statements);
    },
  };
  const loser = createAgendaService(interleaved, config, { now: fixedNow });
  await assert.rejects(
    loser.rescheduleBooking(
      created.booking.id,
      { date: day, startMinute: 840, professionalId: 'b' },
      1,
      context('race-loser-0001', admin),
    ),
    errorCode('VERSION_CONFLICT'),
  );
  assert.deepEqual(await counts(store), { entries: 1, idempotency: 2, audit: 2, outbox: 2 });
  assert.equal(
    (await winnerAgenda.getBooking(created.booking.id, admin)).booking.status,
    'cancelled',
  );
  assert.equal(
    (await store.all('SELECT * FROM agenda_idempotency WHERE key = ?', ['race-loser-0001'])).length,
    0,
  );
});

test('stale catalog and stale active server configuration cannot mutate existing allocations', async (t) => {
  const { agenda, store, config } = await fixture(t);
  await agenda.catalog();
  await assert.rejects(
    agenda.createBooking(input(), { ...context('cfg-client-0001'), configVersion: 2 }),
    errorCode('CONFIGURATION_CHANGED'),
  );
  const changed = { ...config, version: 2 };
  await store.run('UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ?', [
    2,
    await hashConfiguration(changed),
    canonicalStringify(changed),
  ]);
  await assert.rejects(
    agenda.createBooking(input(), context('cfg-server-0001')),
    errorCode('CONFIGURATION_CHANGED'),
  );
  const fresh = createAgendaService(store, changed, { now: fixedNow });
  assert.equal((await fresh.catalog()).configVersion, 2);
  assert.deepEqual(await counts(store), { entries: 0, idempotency: 0, audit: 0, outbox: 0 });
});

test('booking replay remains successful if another writer commits between initial replay and occupancy reads', async (t) => {
  const { agenda: winner, store, config } = await fixture(t);
  const ctx = context('replay-interleave-0001');
  const bookingInput = input(780, 'a');
  let triggered = false;
  const interleaved: SqlStore = {
    all: async <T>(sql: string, params?: Parameters<SqlStore['all']>[1]): Promise<T[]> => {
      if (!triggered && sql.includes("status = 'confirmed' AND allocated_start_utc")) {
        triggered = true;
        await winner.createBooking(bookingInput, ctx);
      }
      return store.all<T>(sql, params);
    },
    run: (sql, params) => store.run(sql, params),
    batch: (statements) => store.batch(statements),
  };
  const replaying = createAgendaService(interleaved, config, { now: fixedNow });
  const replay = await replaying.createBooking(bookingInput, ctx);
  assert.deepEqual(replay, await winner.createBooking(bookingInput, ctx));
  assert.deepEqual(await counts(store), { entries: 1, idempotency: 1, audit: 1, outbox: 1 });
});

test('Any retries another professional when the database rejects a newly raced occupied interval', async (t) => {
  const { agenda: winner, store, config } = await fixture(t);
  let triggered = false;
  const interleaved: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: async (statements) => {
      if (
        !triggered &&
        statements.some((statement) => statement.sql.startsWith('INSERT INTO agenda_entries'))
      ) {
        triggered = true;
        await winner.createBooking(input(780, 'a'), context('any-race-winner-0001'));
      }
      return store.batch(statements);
    },
  };
  const agenda = createAgendaService(interleaved, config, { now: fixedNow });
  const created = await agenda.createBooking(input(780), context('any-race-loser-0001'));
  assert.equal(created.booking.professionalId, 'b');
  assert.deepEqual(await counts(store), { entries: 2, idempotency: 2, audit: 2, outbox: 2 });
});

test('configuration change between validation and commit fails the in-transaction guard without secondary effects', async (t) => {
  const { store, config } = await fixture(t);
  const updatedConfig = { ...config, version: 2 };
  let triggered = false;
  const interleaved: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: async (statements) => {
      if (
        !triggered &&
        statements.some((statement) => statement.sql.startsWith('INSERT INTO agenda_entries'))
      ) {
        triggered = true;
        await store.run(
          'UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ?',
          [2, await hashConfiguration(updatedConfig), canonicalStringify(updatedConfig)],
        );
      }
      return store.batch(statements);
    },
  };
  const agenda = createAgendaService(interleaved, config, { now: fixedNow });
  await assert.rejects(
    agenda.createBooking(input(), context('cfg-interleave-0001')),
    errorCode('CONFIGURATION_CHANGED'),
  );
  assert.deepEqual(await counts(store), { entries: 0, idempotency: 0, audit: 0, outbox: 0 });
  assert.equal(
    (await store.all<{ version: number }>('SELECT version FROM agenda_configuration'))[0].version,
    2,
  );
});

test('repeated catalog and availability reads do not write after initial configuration', async (t) => {
  const { store, config } = await fixture(t);
  let batches = 0;
  const counted: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: (statements) => {
      batches += 1;
      return store.batch(statements);
    },
  };
  const agenda = createAgendaService(counted, config, { now: fixedNow });
  await agenda.catalog();
  assert.equal(batches, 1);
  await agenda.catalog();
  await agenda.availability({ serviceId: 'cut', date: day });
  assert.equal(batches, 1);
});

for (const operation of ['create', 'walk-in', 'move', 'cancel', 'block', 'unblock'] as const) {
  test(`idempotent ${operation} replays its original response after a valid configuration migration and deadline`, async (t) => {
    let clock = fixedNow();
    const { agenda, store, config } = await fixture(t, undefined, () => clock);
    const mutationContext = context(
      `migration-${operation}-0001`,
      operation === 'create' ? publicActor : admin,
    );
    let execute: (service: AgendaService, ctx: MutationContext) => Promise<unknown>;
    let changedPayload: (service: AgendaService, ctx: MutationContext) => Promise<unknown>;
    if (operation === 'create' || operation === 'walk-in') {
      const bookingInput = { ...input(780, 'a'), managementHash: digest };
      execute = (service, ctx) =>
        operation === 'create'
          ? service.createBooking(bookingInput, ctx)
          : service.createWalkIn(bookingInput, ctx);
      changedPayload = (service, ctx) =>
        operation === 'create'
          ? service.createBooking({ ...bookingInput, startMinute: 795 }, ctx)
          : service.createWalkIn({ ...bookingInput, startMinute: 795 }, ctx);
    } else if (operation === 'block' || operation === 'unblock') {
      const blockInput = {
        professionalId: 'a',
        date: day,
        startMinute: 780,
        endMinute: 810,
        label: 'Fixture migration',
      };
      if (operation === 'block') {
        execute = (service, ctx) => service.createBlock(blockInput, ctx);
        changedPayload = (service, ctx) =>
          service.createBlock({ ...blockInput, label: 'Different request' }, ctx);
      } else {
        const block = await agenda.createBlock(
          blockInput,
          context('migration-seed-block-0001', admin),
        );
        execute = (service, ctx) => service.cancelBlock(block.id, 1, ctx);
        changedPayload = (service, ctx) => service.cancelBlock(block.id, 2, ctx);
      }
    } else {
      const created = await agenda.createBooking(
        { ...input(780, 'a'), managementHash: digest },
        context('migration-seed-booking-0001'),
      );
      const customer: Actor = { kind: 'customer', reservationId: created.booking.id };
      mutationContext.actor = customer;
      if (operation === 'cancel') {
        execute = (service, ctx) => service.cancelBooking(created.booking.id, 1, ctx);
        changedPayload = (service, ctx) => service.cancelBooking(created.booking.id, 2, ctx);
      } else {
        const move = { date: day, startMinute: 810, professionalId: 'b' };
        execute = (service, ctx) => service.rescheduleBooking(created.booking.id, move, 1, ctx);
        changedPayload = (service, ctx) =>
          service.rescheduleBooking(created.booking.id, { ...move, startMinute: 825 }, 1, ctx);
      }
    }
    const original = await execute(agenda, mutationContext);
    if (operation === 'move') {
      const booking = (original as { booking: { id: string; version: number } }).booking;
      await agenda.cancelBooking(
        booking.id,
        booking.version,
        context('migration-later-cancel-0001', admin),
      );
    }
    const before = await counts(store);
    const versionTwo = structuredClone(config);
    versionTwo.version = 2;
    versionTwo.services[0].durationMinutes = 45;
    versionTwo.services[0].priceMinorUnits = 27500;
    versionTwo.professionals[0].name = 'Updated fixture name';
    versionTwo.cancellationLeadMinutes = 120;
    const update = await store.run(
      'UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ? WHERE business_id = ?',
      [2, await hashConfiguration(versionTwo), canonicalStringify(versionTwo), config.businessId],
    );
    assert.equal(update.changes, 1);
    clock = new Date('2026-10-08T18:00:00Z');
    const migrated = createAgendaService(store, versionTwo, { now: () => clock });
    assert.equal((await migrated.catalog()).configVersion, 2);
    assert.deepEqual(await execute(migrated, mutationContext), original);
    await assert.rejects(
      execute(migrated, {
        ...mutationContext,
        actor: { kind: 'customer', reservationId: 'not-the-owner' },
      }),
      errorCode('FORBIDDEN'),
    );
    await assert.rejects(
      changedPayload(migrated, mutationContext),
      errorCode('IDEMPOTENCY_CONFLICT'),
    );
    await assert.rejects(
      execute(migrated, { ...mutationContext, configVersion: 2 }),
      errorCode('IDEMPOTENCY_CONFLICT'),
    );
    await assert.rejects(
      execute(migrated, { ...mutationContext, idempotencyKey: `migration-${operation}-new-key` }),
      errorCode('CONFIGURATION_CHANGED'),
    );
    assert.deepEqual(await counts(store), before);
  });
}

test('another business cannot initialize over an existing calendar or read/replay its private data', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const bookingInput = {
    ...input(780, 'a'),
    customer: { displayName: 'Private fixture' },
    managementHash: digest,
  };
  const ctx = context('business-original-0001');
  const receipt = await agenda.createBooking(bookingInput, ctx);
  const secondConfig = {
    ...config,
    businessId: 'different-business',
    businessName: 'Different fixture business',
  };
  const second = createAgendaService(store, secondConfig, { now: fixedNow });
  const before = await counts(store);
  for (const request of [
    () => second.catalog(),
    () => second.listBookings({ date: day }, admin),
    () => second.getBooking(receipt.booking.id, admin),
    () => second.authorizeCustomer(receipt.booking.id, digest),
    () => second.createBooking(bookingInput, ctx),
    () => second.exportData(admin),
  ])
    await assert.rejects(request(), errorCode('CONFIGURATION_CHANGED'));
  assert.deepEqual(await counts(store), before);
  assert.deepEqual(
    (await store.all<{ business_id: string }>('SELECT business_id FROM agenda_configuration')).map(
      (row) => row.business_id,
    ),
    [config.businessId],
  );
});

test('fixture-to-production mode change requires explicit stored configuration and preserves original replay mode', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const bookingInput = { ...input(780, 'a'), managementHash: digest };
  const ctx = context('mode-transition-0001');
  const original = await agenda.createBooking(bookingInput, ctx);
  const production: AgendaConfig = {
    ...config,
    mode: 'production',
    verified: true,
    verifiedAt: fixedNow().toISOString(),
    version: 2,
  };
  const productionService = createAgendaService(store, production, { now: fixedNow });
  await assert.rejects(productionService.catalog(), errorCode('CONFIGURATION_CHANGED'));
  await assert.rejects(
    productionService.createBooking(bookingInput, ctx),
    errorCode('CONFIGURATION_CHANGED'),
  );
  assert.equal(
    (await store.all<{ version: number }>('SELECT version FROM agenda_configuration'))[0].version,
    1,
  );
  await store.run(
    'UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ? WHERE business_id = ?',
    [2, await hashConfiguration(production), canonicalStringify(production), config.businessId],
  );
  assert.equal((await productionService.catalog()).mode, 'production');
  assert.deepEqual(await productionService.createBooking(bookingInput, ctx), original);
  assert.equal(original.mode, 'fixture');
  assert.deepEqual(await counts(store), { entries: 1, idempotency: 1, audit: 1, outbox: 1 });
});

test('missing configuration with existing private data fails closed without reconstructing ownership', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const bookingInput = {
    ...input(780, 'a'),
    customer: { displayName: 'Private orphaned fixture' },
    managementHash: digest,
  };
  const receipt = await agenda.createBooking(bookingInput, context('orphan-original-0001'));
  await store.run('DELETE FROM agenda_configuration');
  const before = await counts(store);
  for (const businessId of [config.businessId, 'different-business']) {
    const orphaned = createAgendaService(store, { ...config, businessId }, { now: fixedNow });
    for (const request of [
      () => orphaned.catalog(),
      () => orphaned.listBookings({ date: day }, admin),
      () => orphaned.getBooking(receipt.booking.id, admin),
      () => orphaned.authorizeCustomer(receipt.booking.id, digest),
      () => orphaned.createBooking(input(840, 'b'), context('orphan-attempt-0001')),
      () => orphaned.cancelBooking(receipt.booking.id, 1, context('orphan-cancel-0001', admin)),
      () => orphaned.exportData(admin),
    ])
      await assert.rejects(request(), errorCode('CONFIGURATION_CHANGED'));
  }
  assert.deepEqual(await counts(store), before);
  assert.equal((await store.all('SELECT * FROM agenda_configuration')).length, 0);
});

test('a legitimate empty calendar can configure on its first POST after a rate-limit bucket is written', async (t) => {
  const { agenda, store, config } = await fixture(t);
  await store.run('INSERT INTO agenda_rate_limits(scope, bucket, count) VALUES(?, ?, ?)', [
    'fixture-first-post',
    1,
    1,
  ]);
  await store.run('INSERT INTO agenda_write_guard(id, affected) VALUES(1, 1)');
  const created = await agenda.createBooking(input(), context('first-post-0001'));
  assert.equal(created.booking.status, 'confirmed');
  assert.deepEqual(
    (await store.all<{ business_id: string }>('SELECT business_id FROM agenda_configuration')).map(
      (row) => row.business_id,
    ),
    [config.businessId],
  );
  assert.deepEqual(await counts(store), { entries: 1, idempotency: 1, audit: 1, outbox: 1 });
  assert.equal(
    (await store.all<{ count: number }>('SELECT count FROM agenda_rate_limits'))[0].count,
    1,
  );
});

test('private reschedule availability excludes only its own allocation and preserves other conflicts', async (t) => {
  const { agenda, store } = await fixture(t);
  const original = await agenda.createBooking(
    { ...input(780, 'a'), managementHash: digest },
    context('move-slots-original'),
  );
  const actor: Actor = { kind: 'customer', reservationId: original.booking.id };
  const query = { date: day, professionalId: 'a' };
  const publicSlots = await agenda.availability({ ...query, serviceId: 'cut' });
  assert.equal(
    publicSlots.slots.some((slot) => slot.startMinute === 795),
    false,
  );
  const before = await counts(store);
  const ownSlots = await agenda.rescheduleAvailability(original.booking.id, query, actor);
  assert.ok(ownSlots.slots.some((slot) => slot.startMinute === 795 && slot.endMinute === 825));
  assert.deepEqual(
    await counts(store),
    before,
    'Availability must not mutate the reservation or events',
  );
  await agenda.createBooking(input(825, 'a'), context('move-slots-other'));
  const occupied = await agenda.rescheduleAvailability(original.booking.id, query, actor);
  assert.ok(occupied.slots.some((slot) => slot.startMinute === 795));
  assert.equal(
    occupied.slots.some((slot) => slot.startMinute === 810),
    false,
  );
  const moved = await agenda.rescheduleBooking(
    original.booking.id,
    { ...query, startMinute: 795 },
    1,
    context('move-slots-confirm', actor),
  );
  assert.equal(moved.booking.startMinute, 795);
  assert.equal(moved.booking.priceMinorUnits, original.booking.priceMinorUnits);
});

test('private reschedule availability uses the original duration and buffers after configuration migration', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const original = await agenda.createBooking(input(780, 'a'), context('snapshot-slots-original'));
  const changed = structuredClone(config);
  changed.version = 2;
  changed.services[0].durationMinutes = 60;
  changed.services[0].bufferAfterMinutes = 30;
  await store.run('UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ?', [
    2,
    await hashConfiguration(changed),
    canonicalStringify(changed),
  ]);
  const current = createAgendaService(store, changed, { now: fixedNow });
  const query = { date: day, professionalId: 'a' };
  const slots = await current.rescheduleAvailability(original.booking.id, query, admin);
  assert.ok(slots.slots.some((slot) => slot.startMinute === 1110 && slot.endMinute === 1140));
  assert.equal(
    (await current.availability({ ...query, serviceId: 'cut' })).slots.some(
      (slot) => slot.startMinute === 1110,
    ),
    false,
  );
  const moved = await current.rescheduleBooking(
    original.booking.id,
    { ...query, startMinute: 1110 },
    1,
    { ...context('snapshot-slots-confirm', admin), configVersion: 2 },
  );
  assert.equal(moved.booking.durationMinutes, original.booking.durationMinutes);
  assert.equal(moved.booking.priceMinorUnits, original.booking.priceMinorUnits);
});

test('private reschedule availability rejects foreign/public/barber actors and respects cancellations and policy', async (t) => {
  const { agenda } = await fixture(t);
  const original = await agenda.createBooking(input(780, 'a'), context('protected-slots-original'));
  const query = { date: day, professionalId: 'a' };
  for (const actor of [
    publicActor,
    { kind: 'customer', reservationId: 'someone-else' },
    { kind: 'barber', id: 'barber-a', professionalId: 'a' },
  ] as Actor[]) {
    await assert.rejects(
      agenda.rescheduleAvailability(original.booking.id, query, actor),
      errorCode('FORBIDDEN'),
    );
  }
  await agenda.cancelBooking(original.booking.id, 1, context('protected-slots-cancel', admin));
  await assert.rejects(
    agenda.rescheduleAvailability(original.booking.id, query, admin),
    errorCode('VERSION_CONFLICT'),
  );
  const late = await fixture(t, undefined, () => new Date('2026-10-05T18:15:00Z'));
  const booking = await late.agenda.createBooking(
    input(780, 'a'),
    context('deadline-slots-original'),
  );
  await assert.rejects(
    late.agenda.rescheduleAvailability(booking.booking.id, query, {
      kind: 'customer',
      reservationId: booking.booking.id,
    }),
    errorCode('POLICY_RESTRICTION'),
  );
  assert.ok(
    (await late.agenda.rescheduleAvailability(booking.booking.id, query, admin)).slots.length > 0,
  );
});

test('private reschedule availability honors absences and refuses arbitrary ignore IDs', async (t) => {
  const { agenda } = await fixture(t);
  const original = await agenda.createBooking(input(780, 'a'), context('absence-slots-original'));
  await agenda.createAbsence(
    { professionalId: 'a', startDate: day, startMinute: 810, endDate: day, endMinute: 870 },
    context('absence-slots-report', admin),
  );
  const slots = await agenda.rescheduleAvailability(
    original.booking.id,
    { date: day, professionalId: 'a' },
    admin,
  );
  assert.equal(
    slots.slots.some((slot) => slot.startMinute === 795),
    false,
  );
  assert.ok(slots.slots.some((slot) => slot.startMinute === 780));
  await assert.rejects(
    agenda.rescheduleAvailability(
      original.booking.id,
      { date: day, ignoreId: 'another-booking' } as never,
      admin,
    ),
    errorCode('INVALID_INPUT'),
  );
  await assert.rejects(
    agenda.availability({ date: day, serviceId: 'cut', ignoreId: original.booking.id } as never),
    errorCode('INVALID_INPUT'),
  );
});
