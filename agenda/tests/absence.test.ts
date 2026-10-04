import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import { localFixtureConfig } from '../fixtures/local.ts';
import {
  AgendaError,
  canonicalStringify,
  createAgendaService,
  hashConfiguration,
} from '../core/index.ts';
import type {
  Actor,
  AgendaConfig,
  CreateAbsenceInput,
  MutationContext,
  ScheduleAbsence,
  SqlStore,
} from '../core/contracts.ts';
import { toUtcSeconds } from '../core/time.ts';

const now = () => new Date('2026-10-05T18:00:00Z');
const day = '2026-10-05';
const admin: Actor = { kind: 'admin', id: 'fixture-owner' };
const barberA: Actor = { kind: 'barber', id: 'fixture-barber-a', professionalId: 'a' };
const barberB: Actor = { kind: 'barber', id: 'fixture-barber-b', professionalId: 'b' };
const context = (key: string, actor: Actor = barberA): MutationContext => ({
  actor,
  configVersion: 1,
  idempotencyKey: key,
});
const absenceInput = (overrides: Partial<CreateAbsenceInput> = {}): CreateAbsenceInput => ({
  professionalId: 'a',
  startDate: day,
  startMinute: 780,
  endDate: day,
  endMinute: 840,
  ...overrides,
});
const bookingInput = (startMinute = 780, professionalId = 'a') => ({
  serviceId: 'cut',
  date: day,
  startMinute,
  professionalId,
});
const errorCode = (code: string) => (error: unknown) =>
  error instanceof AgendaError && error.code === code;
async function fixture(
  t: TestContext,
  config: AgendaConfig = structuredClone(localFixtureConfig),
  path = ':memory:',
) {
  const store = new SqliteStore(path);
  t.after(() => store.close());
  await migrateSqlite(store);
  const agenda = createAgendaService(store, config, { now });
  return { agenda, store, config };
}
async function counts(store: SqlStore) {
  const names = [
    'agenda_entries',
    'agenda_absences',
    'agenda_absence_audit',
    'agenda_idempotency',
    'agenda_audit',
    'agenda_outbox',
  ];
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        (await store.all<{ n: number }>(`SELECT count(*) n FROM ${name}`))[0].n,
      ]),
    ),
  );
}

test('all private domain reads and absence mutations reject missing/public/customer actors', async (t) => {
  const { agenda, store } = await fixture(t);
  for (const actor of [
    undefined,
    null,
    { kind: 'public' },
    { kind: 'customer', reservationId: 'some-booking' },
  ] as Actor[]) {
    for (const read of [
      () => agenda.listBookings({ date: day }, actor),
      () => agenda.listBlocks({ date: day }, actor),
      () => agenda.listAbsences({ date: day }, actor),
      () => agenda.exportData(actor),
      () => agenda.createAbsence(absenceInput(), { ...context('unauthorized-absence'), actor }),
      () => agenda.revokeAbsence('any-absence', 1, { ...context('unauthorized-revoke'), actor }),
    ])
      await assert.rejects(read(), errorCode('FORBIDDEN'));
  }
  assert.equal((await store.all('SELECT * FROM agenda_configuration')).length, 0);
});

test('barbers read only their own schedule and cannot mutate bookings, blocks, or export', async (t) => {
  const { agenda } = await fixture(t);
  const a = await agenda.createBooking(
    bookingInput(),
    context('read-seed-booking-a', { kind: 'public' }),
  );
  await agenda.createBooking(
    bookingInput(780, 'b'),
    context('read-seed-booking-b', { kind: 'public' }),
  );
  await agenda.createBlock(
    { professionalId: 'a', date: day, startMinute: 840, endMinute: 900, label: 'Fixture block' },
    context('read-seed-block-a', admin),
  );
  await agenda.createBlock(
    { professionalId: 'b', date: day, startMinute: 840, endMinute: 900, label: 'Fixture block' },
    context('read-seed-block-b', admin),
  );
  assert.equal((await agenda.listBookings({ date: day }, admin)).length, 2);
  assert.deepEqual(
    (await agenda.listBookings({ date: day }, barberA)).map((row) => row.id),
    [a.booking.id],
  );
  assert.deepEqual(
    (await agenda.listBlocks({ date: day }, barberB)).map((row) => row.professionalId),
    ['b'],
  );
  assert.equal((await agenda.getBooking(a.booking.id, barberA)).booking.id, a.booking.id);
  await assert.rejects(agenda.getBooking(a.booking.id, barberB), errorCode('FORBIDDEN'));
  for (const request of [
    () => agenda.listBookings({ date: day, professionalId: 'b' }, barberA),
    () => agenda.listBlocks({ date: day, professionalId: 'a' }, barberB),
    () => agenda.listAbsences({ date: day, professionalId: 'b' }, barberA),
    () => agenda.exportData(barberA),
    () => agenda.createBooking(bookingInput(930), context('barber-create-denied')),
    () => agenda.createWalkIn(bookingInput(930), context('barber-walkin-denied')),
    () => agenda.cancelBooking(a.booking.id, 1, context('barber-cancel-denied')),
    () =>
      agenda.rescheduleBooking(
        a.booking.id,
        { date: day, startMinute: 930, professionalId: 'a' },
        1,
        context('barber-move-denied'),
      ),
    () =>
      agenda.createBlock(
        { professionalId: 'a', date: day, startMinute: 930, endMinute: 960, label: 'Forbidden' },
        context('barber-block-denied'),
      ),
  ])
    await assert.rejects(request(), errorCode('FORBIDDEN'));
});

test('absence snapshots confirmed bookings and walk-ins with buffers without changing appointments or notifications', async (t) => {
  const { agenda, store } = await fixture(t);
  const first = await agenda.createBooking(
    { ...bookingInput(), serviceId: 'beard' },
    context('snapshot-booking-01', { kind: 'public' }),
  );
  const second = await agenda.createWalkIn(bookingInput(840), context('snapshot-walkin-01', admin));
  await agenda.createBooking(
    bookingInput(780, 'b'),
    context('snapshot-other-01', { kind: 'public' }),
  );
  const cancelled = await agenda.createBooking(
    bookingInput(900),
    context('snapshot-cancel-01', { kind: 'public' }),
  );
  await agenda.cancelBooking(cancelled.booking.id, 1, context('snapshot-cancel-02', admin));
  const before = await counts(store);
  const absence = await agenda.createAbsence(
    absenceInput({ startMinute: 800, endMinute: 960, reason: '  No disponible  ' }),
    context('snapshot-absence-01'),
  );
  assert.deepEqual(absence.affectedBookingIds, [first.booking.id, second.booking.id].sort());
  assert.equal(absence.reason, 'No disponible');
  assert.equal(absence.resolution, 'requires-resolution');
  assert.equal(absence.timeZone, 'America/Managua');
  assert.equal((await agenda.getBooking(first.booking.id, admin)).booking.status, 'confirmed');
  assert.equal((await agenda.getBooking(second.booking.id, admin)).booking.version, 1);
  const after = await counts(store);
  assert.equal(after.agenda_outbox, before.agenda_outbox);
  assert.equal(after.agenda_audit, before.agenda_audit);
  assert.equal(after.agenda_entries, before.agenda_entries);
  assert.equal(after.agenda_absence_audit, 1);
  const [audit] = await store.all<{
    actor_kind: string;
    actor_id: string;
    professional_id: string;
  }>('SELECT * FROM agenda_absence_audit');
  assert.equal(audit.actor_kind, 'barber');
  assert.equal(audit.actor_id, 'fixture-barber-a');
  assert.equal(audit.professional_id, 'a');
  await agenda.rescheduleBooking(
    first.booking.id,
    { date: day, startMinute: 960, professionalId: 'a' },
    1,
    context('snapshot-resolved-01', admin),
  );
  assert.deepEqual(
    (await agenda.listAbsences({ date: day }, admin))[0].affectedBookingIds,
    absence.affectedBookingIds,
  );
  assert.equal(
    (await agenda.listAbsences({ date: day }, admin))[0].resolution,
    'requires-resolution',
  );
});

test('active absences block availability, booking, walk-in and reschedule, including buffers and allow adjacency', async (t) => {
  const { agenda } = await fixture(t);
  const existing = await agenda.createBooking(
    bookingInput(960),
    context('blocking-existing-01', { kind: 'public' }),
  );
  await agenda.createAbsence(
    absenceInput({ startMinute: 810, endMinute: 870 }),
    context('blocking-absence-01'),
  );
  const availability = await agenda.availability({
    serviceId: 'cut',
    professionalId: 'a',
    date: day,
  });
  assert.ok(availability.slots.some((slot) => slot.startMinute === 780));
  assert.ok(availability.slots.some((slot) => slot.startMinute === 870));
  assert.ok(!availability.slots.some((slot) => slot.startMinute > 780 && slot.startMinute < 870));
  for (const request of [
    () =>
      agenda.createBooking(bookingInput(810), context('blocking-new-booking', { kind: 'public' })),
    () => agenda.createWalkIn(bookingInput(810), context('blocking-new-walkin', admin)),
    () =>
      agenda.rescheduleBooking(
        existing.booking.id,
        { date: day, startMinute: 810, professionalId: 'a' },
        1,
        context('blocking-move', admin),
      ),
    () =>
      agenda.createBooking(
        { ...bookingInput(795), serviceId: 'beard' },
        context('blocking-buffer', { kind: 'public' }),
      ),
  ])
    await assert.rejects(request(), errorCode('SLOT_UNAVAILABLE'));
  assert.equal(
    (await agenda.createBooking(bookingInput(780), context('adjacent-before', { kind: 'public' })))
      .booking.status,
    'confirmed',
  );
  assert.equal(
    (await agenda.createBooking(bookingInput(870), context('adjacent-after', { kind: 'public' })))
      .booking.status,
    'confirmed',
  );
  assert.equal(
    (
      await agenda.createBooking(
        { serviceId: 'cut', date: day, startMinute: 810 },
        context('any-professional-absence', { kind: 'public' }),
      )
    ).booking.professionalId,
    'b',
  );
  assert.equal((await agenda.getBooking(existing.booking.id, admin)).booking.startMinute, 960);
});

test('owner can report for any barber; own-only report/revoke checks run before idempotent replay', async (t) => {
  const { agenda } = await fixture(t);
  await assert.rejects(
    agenda.createAbsence(absenceInput({ professionalId: 'b' }), context('scope-create-denied')),
    errorCode('FORBIDDEN'),
  );
  const a = await agenda.createAbsence(absenceInput(), context('scope-create-owner', admin));
  const b = await agenda.createAbsence(
    absenceInput({ professionalId: 'b' }),
    context('scope-create-b', admin),
  );
  assert.deepEqual(
    (await agenda.listAbsences({ date: day }, barberA)).map((row) => row.id),
    [a.id],
  );
  assert.equal((await agenda.listAbsences({ date: day }, admin)).length, 2);
  await assert.rejects(
    agenda.revokeAbsence(b.id, 1, context('scope-revoke-denied')),
    errorCode('FORBIDDEN'),
  );
  await assert.rejects(
    agenda.revokeAbsence(a.id, 1, context('scope-revoke-denied-b', barberB)),
    errorCode('FORBIDDEN'),
  );
  assert.equal(
    (await agenda.revokeAbsence(a.id, 1, context('scope-revoke-own'))).status,
    'revoked',
  );
  assert.equal(
    (await agenda.revokeAbsence(b.id, 1, context('scope-revoke-owner', admin))).status,
    'revoked',
  );
});

test('overlapping absences coexist and revoking one preserves the other and existing blocks', async (t) => {
  const { agenda } = await fixture(t);
  const first = await agenda.createAbsence(absenceInput(), context('union-first-absence'));
  const second = await agenda.createAbsence(
    absenceInput({ startMinute: 810, endMinute: 900 }),
    context('union-second-absence'),
  );
  await agenda.createBlock(
    { professionalId: 'a', date: day, startMinute: 900, endMinute: 930, label: 'Keep blocked' },
    context('union-owner-block', admin),
  );
  await agenda.revokeAbsence(first.id, 1, context('union-revoke-first'));
  assert.equal(
    (await agenda.createBooking(bookingInput(780), context('union-released', { kind: 'public' })))
      .booking.status,
    'confirmed',
  );
  await assert.rejects(
    agenda.createBooking(bookingInput(810), context('union-still-absent', { kind: 'public' })),
    errorCode('SLOT_UNAVAILABLE'),
  );
  await agenda.revokeAbsence(second.id, 1, context('union-revoke-second'));
  await assert.rejects(
    agenda.createBooking(bookingInput(900), context('union-still-blocked', { kind: 'public' })),
    errorCode('SLOT_UNAVAILABLE'),
  );
  assert.equal((await agenda.listAbsences({ date: day }, barberA)).length, 0);
  assert.equal(
    (await agenda.listAbsences({ date: day, includeCancelled: true }, barberA)).length,
    2,
  );
});

test('Managua overnight and multi-day absences list by intersection and store UTC seconds', async (t) => {
  const { agenda, store } = await fixture(t);
  const overnight = await agenda.createAbsence(
    absenceInput({ startMinute: 1380, endDate: '2026-10-06', endMinute: 60 }),
    context('overnight-absence'),
  );
  assert.equal((await agenda.listAbsences({ date: '2026-10-06' }, barberA))[0].id, overnight.id);
  assert.equal((await agenda.listAbsences({ date: '2026-10-07' }, barberA)).length, 0);
  const days = await agenda.createAbsence(
    absenceInput({
      startDate: '2026-10-07',
      startMinute: 0,
      endDate: '2026-10-09',
      endMinute: 1440,
    }),
    context('multi-day-absence'),
  );
  assert.equal(days.endDate, '2026-10-10');
  assert.equal(days.endMinute, 0);
  assert.equal((await agenda.listAbsences({ date: '2026-10-09' }, barberA))[0].id, days.id);
  assert.equal((await agenda.listAbsences({ date: '2026-10-10' }, barberA)).length, 0);
  const [row] = await store.all<{ start_utc: number; end_utc: number }>(
    'SELECT start_utc, end_utc FROM agenda_absences WHERE id = ?',
    [overnight.id],
  );
  assert.equal(row.start_utc, toUtcSeconds(day, 1380));
  assert.equal(row.end_utc, toUtcSeconds('2026-10-06', 60));
});

for (const [name, overrides] of Object.entries({
  reversed: { endMinute: 700 },
  'zero length': { endMinute: 780 },
  'before today': { startDate: '2026-10-04' },
  'past interval': { startMinute: 0, endMinute: 1 },
  'beyond horizon': { endDate: '2026-10-27', endMinute: 1 },
  'invalid date': { endDate: '2026-02-30' },
  'fraction minute': { startMinute: 780.5 },
  'invalid reason': { reason: '\nprivate' },
  'long reason': { reason: 'a'.repeat(121) },
  'unknown professional': { professionalId: 'missing' },
}))
  test(`absence input rejects ${name} without secondary effects`, async (t) => {
    const { agenda, store } = await fixture(t);
    await agenda.catalog();
    const before = await counts(store);
    await assert.rejects(
      agenda.createAbsence(
        absenceInput(overrides),
        context(`invalid-input-${name.replaceAll(' ', '-')}`, admin),
      ),
      errorCode('INVALID_INPUT'),
    );
    assert.deepEqual(await counts(store), before);
  });

test('same absence key replays report snapshot after revoke and rejects changed payload', async (t) => {
  const { agenda, store } = await fixture(t);
  const input = absenceInput();
  const ctx = context('idempotent-absence');
  const first = await agenda.createAbsence(input, ctx);
  assert.deepEqual(await agenda.createAbsence(input, ctx), first);
  await assert.rejects(
    agenda.createAbsence({ ...input, endMinute: 900 }, ctx),
    errorCode('IDEMPOTENCY_CONFLICT'),
  );
  const revoked = await agenda.revokeAbsence(first.id, 1, context('idempotent-revoke'));
  assert.deepEqual(await agenda.revokeAbsence(first.id, 1, context('idempotent-revoke')), revoked);
  assert.deepEqual(await agenda.createAbsence(input, ctx), first);
  await assert.rejects(
    agenda.revokeAbsence(first.id, 1, context('stale-revoke-new-key')),
    errorCode('VERSION_CONFLICT'),
  );
  assert.deepEqual(await counts(store), {
    agenda_entries: 0,
    agenda_absences: 1,
    agenda_absence_audit: 2,
    agenda_idempotency: 2,
    agenda_audit: 0,
    agenda_outbox: 0,
  });
});

test('absence config changes and optimistic revocation races roll back every losing effect', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const first = await agenda.createAbsence(absenceInput(), context('race-revoke-seed'));
  let raced = false;
  const interleaved: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: async (statements) => {
      if (!raced && statements.some((row) => row.sql.startsWith('UPDATE agenda_absences'))) {
        raced = true;
        await agenda.revokeAbsence(first.id, 1, context('race-revoke-winner'));
      }
      return store.batch(statements);
    },
  };
  const loser = createAgendaService(interleaved, config, { now });
  await assert.rejects(
    loser.revokeAbsence(first.id, 1, context('race-revoke-loser')),
    errorCode('VERSION_CONFLICT'),
  );
  assert.equal(
    (await store.all('SELECT * FROM agenda_idempotency WHERE key = ?', ['race-revoke-loser']))
      .length,
    0,
  );
  assert.equal((await store.all('SELECT * FROM agenda_absence_audit')).length, 2);
  await assert.rejects(
    agenda.createAbsence(absenceInput(), { ...context('stale-config-absence'), configVersion: 2 }),
    errorCode('CONFIGURATION_CHANGED'),
  );
  const changed = { ...config, version: 2 };
  const interleavedConfig: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: async (statements) => {
      if (statements.some((row) => row.sql.startsWith('INSERT INTO agenda_absences'))) {
        await store.run(
          'UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ?',
          [2, await hashConfiguration(changed), canonicalStringify(changed)],
        );
      }
      return store.batch(statements);
    },
  };
  const stale = createAgendaService(interleavedConfig, config, { now });
  const before = await counts(store);
  await assert.rejects(
    stale.createAbsence(absenceInput(), context('config-race-absence')),
    errorCode('CONFIGURATION_CHANGED'),
  );
  assert.deepEqual(await counts(store), before);
  const migrated = createAgendaService(store, changed, {
    now: () => new Date('2026-11-01T18:00:00Z'),
  });
  assert.deepEqual(
    await migrated.createAbsence(absenceInput(), context('race-revoke-seed')),
    first,
  );
});

test('database absence guard closes advisory booking and reschedule races with buffer intervals', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const existing = await agenda.createBooking(
    bookingInput(960),
    context('db-race-original', { kind: 'public' }),
  );
  for (const operation of ['create', 'move'] as const) {
    let raced = false;
    const interleaved: SqlStore = {
      all: (sql, params) => store.all(sql, params),
      run: (sql, params) => store.run(sql, params),
      batch: async (statements) => {
        if (
          !raced &&
          statements.some((row) =>
            row.sql.startsWith(
              operation === 'create' ? 'INSERT INTO agenda_entries' : 'UPDATE agenda_entries',
            ),
          )
        ) {
          raced = true;
          await agenda.createAbsence(
            absenceInput({ startMinute: 800, endMinute: 810 }),
            context(`db-race-absence-${operation}`),
          );
        }
        return store.batch(statements);
      },
    };
    const candidate = createAgendaService(interleaved, config, { now });
    if (operation === 'create')
      await assert.rejects(
        candidate.createBooking(
          { ...bookingInput(), serviceId: 'beard' },
          context('db-race-create', { kind: 'public' }),
        ),
        errorCode('SLOT_UNAVAILABLE'),
      );
    else {
      for (const absence of await agenda.listAbsences({ date: day }, admin))
        await agenda.revokeAbsence(absence.id, 1, context(`db-race-revoke-${absence.id}`, admin));
      await assert.rejects(
        candidate.rescheduleBooking(
          existing.booking.id,
          { date: day, startMinute: 780, professionalId: 'a' },
          1,
          context('db-race-move', admin),
        ),
        errorCode('SLOT_UNAVAILABLE'),
      );
    }
  }
  assert.equal((await agenda.getBooking(existing.booking.id, admin)).booking.startMinute, 960);
  assert.equal((await store.all('SELECT * FROM agenda_entries')).length, 1);
});

interface RaceResult {
  ok: boolean;
  code?: string;
  bookingId?: string;
  absence?: ScheduleAbsence;
}
async function race(
  databasePath: string,
  operations: Array<'booking' | 'absence' | 'same-absence'>,
): Promise<RaceResult[]> {
  const gate = new SharedArrayBuffer(4);
  let ready = 0;
  return Promise.all(
    operations.map(
      (operation, index) =>
        new Promise<RaceResult>((resolve, reject) => {
          const worker = new Worker(new URL('./absence-concurrency-worker.ts', import.meta.url), {
            workerData: { databasePath, gate, operation, index },
          });
          worker.on('error', reject);
          worker.on('message', (message) => {
            if (message.ready) {
              ready += 1;
              if (ready === operations.length) {
                Atomics.store(new Int32Array(gate), 0, 1);
                Atomics.notify(new Int32Array(gate), 0);
              }
            } else if (message.done) resolve(message);
          });
          worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker exited ${code}`));
          });
        }),
    ),
  );
}

test('separate connections racing identical absence keys commit exactly one report/audit/snapshot', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'agenda-absence-keys-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'agenda.sqlite');
  const { agenda, store } = await fixture(t, undefined, databasePath);
  await agenda.catalog();
  const results = await race(databasePath, [
    'same-absence',
    'same-absence',
    'same-absence',
    'same-absence',
  ]);
  assert.ok(results.every((result) => result.ok));
  assert.equal(new Set(results.map((result) => result.absence?.id)).size, 1);
  assert.equal((await store.all('SELECT * FROM agenda_absences')).length, 1);
  assert.equal((await store.all('SELECT * FROM agenda_absence_audit')).length, 1);
  assert.equal((await store.all('SELECT * FROM agenda_idempotency')).length, 1);
  assert.equal((await store.all('SELECT * FROM agenda_outbox')).length, 0);
});

test('separate connections racing booking and absence either capture the booking or reject it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'agenda-absence-booking-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (let index = 0; index < 6; index += 1) {
    const databasePath = join(directory, `agenda-${index}.sqlite`);
    const { agenda, store } = await fixture(t, undefined, databasePath);
    await agenda.catalog();
    const [booking, absence] = await race(databasePath, ['booking', 'absence']);
    assert.equal(absence.ok, true);
    assert.ok(absence.absence);
    if (booking.ok) {
      assert.deepEqual(absence.absence.affectedBookingIds, [booking.bookingId]);
      assert.equal(absence.absence.resolution, 'requires-resolution');
      assert.equal(
        (await agenda.getBooking(booking.bookingId!, admin)).booking.status,
        'confirmed',
      );
    } else {
      assert.equal(booking.code, 'SLOT_UNAVAILABLE');
      assert.deepEqual(absence.absence.affectedBookingIds, []);
      assert.equal(absence.absence.resolution, 'none');
    }
    assert.equal((await store.all('SELECT * FROM agenda_absence_audit')).length, 1);
    assert.equal((await store.all('SELECT * FROM agenda_outbox')).length, booking.ok ? 1 : 0);
  }
});

test('preparation buffers use the same half-open absence snapshot and availability invariant', async (t) => {
  const config = structuredClone(localFixtureConfig);
  config.services[0].bufferBeforeMinutes = 10;
  const { agenda } = await fixture(t, config);
  await agenda.createAbsence(absenceInput({ endMinute: 800 }), context('preparation-adjacent'));
  const booking = await agenda.createBooking(
    bookingInput(810),
    context('preparation-booking', { kind: 'public' }),
  );
  const intersecting = await agenda.createAbsence(
    absenceInput({ startMinute: 800, endMinute: 805 }),
    context('preparation-intersecting'),
  );
  assert.deepEqual(intersecting.affectedBookingIds, [booking.booking.id]);
  await agenda.cancelBooking(booking.booking.id, 1, context('preparation-cancel', admin));
  await assert.rejects(
    agenda.createBooking(bookingInput(810), context('preparation-denied', { kind: 'public' })),
    errorCode('SLOT_UNAVAILABLE'),
  );
});

test('absence creation with a failing audit batch commits no absence, idempotency or alert snapshot', async (t) => {
  const { agenda, store, config } = await fixture(t);
  await agenda.catalog();
  const before = await counts(store);
  const broken: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: (statements) =>
      store.batch([
        ...statements,
        {
          sql: "INSERT INTO agenda_absence_audit(id, absence_id, action, actor_kind, actor_id, absence_version, created_at) VALUES('invalid-audit', 'missing', 'reported', 'admin', 'fixture-owner', 1, 1)",
        },
      ]),
  };
  await assert.rejects(
    createAgendaService(broken, config, { now }).createAbsence(
      absenceInput(),
      context('audit-failure-absence'),
    ),
    errorCode('STORAGE_UNAVAILABLE'),
  );
  assert.deepEqual(await counts(store), before);
});

test('malformed staff principals are denied and stable subjects up to 256 characters are accepted', async (t) => {
  const { agenda } = await fixture(t);
  for (const actor of [
    { kind: 'admin', id: 'with space' },
    { kind: 'admin', id: 'with,comma' },
    { kind: 'barber', id: 'a'.repeat(257), professionalId: 'a' },
    { kind: 'barber', id: 'fixture-barber' },
    { kind: 'barber', id: 'fixture-barber', professionalId: 'a,b' },
  ] as Actor[])
    await assert.rejects(agenda.listBookings({ date: day }, actor), errorCode('FORBIDDEN'));
  const actor: Actor = { kind: 'barber', id: 'a'.repeat(256), professionalId: 'a' };
  assert.equal(
    (await agenda.createAbsence(absenceInput(), context('long-valid-subject', actor))).status,
    'active',
  );
});

test('racing identical revoke keys return one version with one revocation audit', async (t) => {
  const { agenda, store, config } = await fixture(t);
  const absence = await agenda.createAbsence(absenceInput(), context('identical-revoke-seed'));
  const ctx = context('identical-revoke-key');
  let winner: ScheduleAbsence | undefined;
  const interleaved: SqlStore = {
    all: (sql, params) => store.all(sql, params),
    run: (sql, params) => store.run(sql, params),
    batch: async (statements) => {
      if (!winner && statements.some((row) => row.sql.startsWith('UPDATE agenda_absences'))) {
        winner = await agenda.revokeAbsence(absence.id, 1, ctx);
      }
      return store.batch(statements);
    },
  };
  const result = await createAgendaService(interleaved, config, { now }).revokeAbsence(
    absence.id,
    1,
    ctx,
  );
  assert.deepEqual(result, winner);
  assert.equal(result.version, 2);
  assert.equal((await store.all('SELECT * FROM agenda_absence_audit')).length, 2);
  assert.equal((await store.all('SELECT * FROM agenda_idempotency')).length, 2);
});

test('an orphaned absence calendar cannot be claimed by a new or reconstructed configuration', async (t) => {
  const { agenda, store, config } = await fixture(t);
  await agenda.createAbsence(absenceInput(), context('orphaned-absence-seed'));
  await store.run('DELETE FROM agenda_configuration');
  const before = await counts(store);
  for (const businessId of [config.businessId, 'other-fixture-business']) {
    const orphaned = createAgendaService(store, { ...config, businessId }, { now });
    await assert.rejects(orphaned.catalog(), errorCode('CONFIGURATION_CHANGED'));
    await assert.rejects(
      orphaned.listAbsences({ date: day }, admin),
      errorCode('CONFIGURATION_CHANGED'),
    );
    await assert.rejects(
      orphaned.createAbsence(absenceInput(), context('orphaned-absence-new')),
      errorCode('CONFIGURATION_CHANGED'),
    );
  }
  assert.deepEqual(await counts(store), before);
  assert.equal((await store.all('SELECT * FROM agenda_configuration')).length, 0);
});
