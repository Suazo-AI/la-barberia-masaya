import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEMO_STORAGE_KEY,
  DEMO_POLICY,
  SERVICES,
  PROFESSIONALS,
  businessNow,
  addDays,
  dateRange,
  openingHours,
  isDemoState,
  createInitialState,
  availableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  createBlock,
  removeBlock,
  createDemoStore,
} from '../src/demo-store.js';

const now = new Date('2026-10-07T15:00:00Z'); // Wednesday, 09:00 Managua.
const date = '2026-10-07';
const professionalId = 'demo-diego';
const input = { date, startMinute: 780, serviceId: 'corte', professionalId };
const empty = () => createInitialState({ now, seed: false });
const create = (state = empty(), change = {}, at = now) =>
  createAppointment(state, { ...input, ...change }, { now: at, expectedRevision: state.revision });
const memoryStorage = () => {
  const values = new Map();
  const calls = [];
  return {
    values,
    calls,
    getItem(key) {
      calls.push(['get', key]);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push(['set', key]);
      values.set(key, value);
    },
  };
};

const errorCode = (result, expected) => {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, expected);
};

test('confirmed public catalog and unmistakably synthetic professional identities', () => {
  assert.deepEqual(
    SERVICES.map(({ id, priceNio, durationMinutes }) => [id, priceNio, durationMinutes]),
    [
      ['corte', 200, 30],
      ['barba', 150, 15],
      ['combo', 300, 45],
    ],
  );
  assert.deepEqual(
    PROFESSIONALS.map(({ id }) => id),
    ['demo-diego', 'demo-luis', 'demo-carlos'],
  );
  assert.ok(PROFESSIONALS.every(({ name }) => name.includes('Demo')));
  assert.ok(Object.isFrozen(SERVICES[0]));
});

test('dates and weekly hours use Managua, including UTC midnight and closed Tuesday', () => {
  assert.deepEqual(businessNow(new Date('2026-10-08T01:45:00Z')), { date, minute: 1185 });
  assert.deepEqual(dateRange(now), { min: date, max: '2026-10-21' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-02-30', 1), '');
  for (const [day, hours] of [
    ['2026-10-04', [600, 1020]],
    ['2026-10-05', [780, 1140]],
    ['2026-10-06', null],
    ['2026-10-07', [780, 1140]],
    ['2026-10-08', [780, 1140]],
    ['2026-10-09', [600, 1140]],
    ['2026-10-10', [600, 1140]],
  ])
    assert.deepEqual(openingHours(day), hours);
  const copy = openingHours(date);
  copy[0] = 0;
  assert.deepEqual(openingHours(date), [780, 1140]);
});

test('seed appointments use next available open day and do not overlap', () => {
  const state = createInitialState({ now: new Date('2026-10-06T21:00:00Z') });
  assert.equal(state.appointments.length, 2);
  assert.ok(isDemoState(state));
  assert.ok(
    state.appointments.every(
      (item) =>
        item.date === date &&
        item.source === 'seed' &&
        item.synthetic &&
        item.label.startsWith('Cita de ejemplo'),
    ),
  );
  const afterClosing = createInitialState({ now: new Date('2026-10-08T00:20:00Z') });
  assert.ok(afterClosing.appointments.every((item) => item.date === '2026-10-08'));
});

test('pure create is immutable, records only synthetic fields and rejects invalid inputs', () => {
  const state = empty();
  const before = structuredClone(state);
  const result = create(state);
  assert.equal(result.ok, true);
  assert.deepEqual(state, before);
  assert.equal(result.appointment.endMinute, 810);
  assert.equal(result.appointment.source, 'client');
  assert.equal(result.appointment.label, 'Cliente demo 1');
  assert.equal(result.state.revision, 1);
  assert.ok(isDemoState(result.state));
  for (const change of [
    { customerName: 'Do not store this' },
    { phone: 'secret' },
    { professionalId: 'real-person' },
    { actor: 'owner' },
    { date: '2026-02-30' },
    { date: '2026-10-06' },
    { date: '2026-10-22' },
    { startMinute: 781 },
    { startMinute: '780' },
    { serviceId: 'unknown' },
    { startMinute: NaN },
  ])
    assert.equal(create(state, change).ok, false);
  assert.equal(createAppointment(state, null, { now }).ok, false);
  assert.deepEqual(availableSlots(state, null), []);
});

test('all slots fit service duration, cleanup, 5-minute grid, horizon and weekday hours', () => {
  const state = empty();
  for (let offset = 0; offset <= 14; offset++) {
    const day = addDays(date, offset);
    for (const service of SERVICES) {
      const slots = availableSlots(state, { date: day, serviceId: service.id, now });
      const hours = openingHours(day);
      if (!hours) assert.deepEqual(slots, []);
      for (const slot of slots) {
        assert.equal(slot.startMinute % 5, 0);
        assert.equal(slot.endMinute - slot.startMinute, service.durationMinutes);
        assert.ok(slot.startMinute >= hours[0]);
        assert.ok(slot.endMinute + 5 <= hours[1]);
        assert.deepEqual(
          slot.professionalIds,
          PROFESSIONALS.map(({ id }) => id),
        );
      }
    }
  }
  const last = availableSlots(state, { date, serviceId: 'combo', now }).at(-1);
  assert.equal(last.startMinute, 1090);
  assert.equal(last.endMinute, 1135);
});

test('duration plus cleanup rejects overlap in both directions and allows exact adjacency', () => {
  const first = create(empty(), { startMinute: 840 });
  for (const startMinute of [810, 835, 840, 865, 870]) {
    assert.equal(create(first.state, { startMinute }).ok, false, `start ${startMinute}`);
  }
  assert.equal(create(first.state, { startMinute: 805 }).ok, true); // Ends 835 + cleanup to 840.
  assert.equal(create(first.state, { startMinute: 875 }).ok, true);
  assert.equal(create(first.state, { startMinute: 840, professionalId: 'demo-luis' }).ok, true);
  const any = availableSlots(first.state, { date, serviceId: 'corte', now });
  assert.deepEqual(any.find(({ startMinute }) => startMinute === 840).professionalIds, [
    'demo-luis',
    'demo-carlos',
  ]);
  assert.equal(new Set(any.map(({ startMinute }) => startMinute)).size, any.length);
});

test('customer lead time is exactly 60 minutes; admin may use the remaining future time', () => {
  const at = new Date('2026-10-07T19:00:00Z'); // 13:00 Managua.
  assert.equal(create(empty(), { startMinute: 835 }, at).ok, false);
  assert.equal(create(empty(), { startMinute: 840 }, at).ok, true);
  assert.equal(create(empty(), { startMinute: 840 }, new Date(at.getTime() + 1)).ok, false);
  const admin = create(empty(), { startMinute: 780, actor: 'admin' }, at);
  assert.equal(admin.ok, true);
  assert.equal(admin.appointment.source, 'admin');
  assert.equal(
    create(empty(), { startMinute: 780, actor: 'admin' }, new Date(at.getTime() + 1)).ok,
    false,
  );
});

test('reschedule excludes only its own allocation and preserves original on conflict', () => {
  const first = create();
  const version = first.appointment.version;
  const own = availableSlots(first.state, {
    date,
    serviceId: 'corte',
    professionalId,
    excludeId: first.appointment.id,
    now,
  });
  assert.ok(own.some(({ startMinute }) => startMinute === 780));
  assert.deepEqual(
    availableSlots(first.state, { date, serviceId: 'barba', excludeId: first.appointment.id, now }),
    [],
  );
  assert.deepEqual(
    availableSlots(first.state, { date, serviceId: 'corte', excludeId: 'missing', now }),
    [],
  );
  const moved = rescheduleAppointment(
    first.state,
    first.appointment.id,
    { date, startMinute: 785, expectedVersion: version },
    { now },
  );
  assert.equal(moved.ok, true);
  assert.equal(moved.appointment.version, 2);
  assert.equal(moved.state.appointments.length, 1);
  const second = create(moved.state, { startMinute: 840 });
  const before = structuredClone(second.state);
  errorCode(
    rescheduleAppointment(
      second.state,
      moved.appointment.id,
      { date, startMinute: 820, expectedVersion: 2 },
      { now },
    ),
    'UNAVAILABLE',
  );
  assert.deepEqual(second.state, before);
  errorCode(
    rescheduleAppointment(
      second.state,
      moved.appointment.id,
      { date, startMinute: 785, expectedVersion: 1 },
      { now },
    ),
    'STALE_VERSION',
  );
});

test('cancellation releases its slot, advances version and cannot be repeated', () => {
  const first = create();
  const cancelled = cancelAppointment(
    first.state,
    first.appointment.id,
    { expectedVersion: 1 },
    { now },
  );
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.appointment.status, 'cancelled');
  assert.equal(cancelled.appointment.version, 2);
  assert.equal(create(cancelled.state).ok, true);
  errorCode(
    cancelAppointment(cancelled.state, first.appointment.id, { expectedVersion: 2 }, { now }),
    'CANCELLED',
  );
  errorCode(cancelAppointment(first.state, first.appointment.id, {}, { now }), 'INVALID_INPUT');
  assert.deepEqual(
    availableSlots(cancelled.state, {
      date,
      serviceId: 'corte',
      excludeId: first.appointment.id,
      now,
    }),
    [],
  );
});

test('customer cancellation and move cutoff is 60 minutes, admin can override within horizon', () => {
  const first = create();
  const atCutoff = new Date('2026-10-07T18:00:00Z');
  const tooLate = new Date(atCutoff.getTime() + 1);
  assert.equal(
    cancelAppointment(first.state, first.appointment.id, { expectedVersion: 1 }, { now: atCutoff })
      .ok,
    true,
  );
  errorCode(
    cancelAppointment(first.state, first.appointment.id, { expectedVersion: 1 }, { now: tooLate }),
    'CUTOFF',
  );
  errorCode(
    rescheduleAppointment(
      first.state,
      first.appointment.id,
      { date, startMinute: 900, expectedVersion: 1 },
      { now: tooLate },
    ),
    'CUTOFF',
  );
  assert.equal(
    cancelAppointment(
      first.state,
      first.appointment.id,
      { actor: 'admin', expectedVersion: 1 },
      { now: tooLate },
    ).ok,
    true,
  );
  assert.equal(
    rescheduleAppointment(
      first.state,
      first.appointment.id,
      { date, startMinute: 900, actor: 'admin', expectedVersion: 1 },
      { now: tooLate },
    ).ok,
    true,
  );
  errorCode(
    cancelAppointment(
      first.state,
      first.appointment.id,
      { actor: 'admin', expectedVersion: 1 },
      { now: new Date('2026-10-08T15:00:00Z') },
    ),
    'OUTSIDE_HORIZON',
  );
});

test('pure state revision rejects stale actions without modifying state', () => {
  const first = create();
  errorCode(
    createAppointment(first.state, { ...input, startMinute: 900 }, { now, expectedRevision: 0 }),
    'STALE_STATE',
  );
  assert.equal(first.state.appointments.length, 1);
});

test('simulated admin blocks/unblocks with conflict, version, bounds and role checks', () => {
  const blockInput = { date, startMinute: 840, endMinute: 900, professionalId, actor: 'admin' };
  errorCode(createBlock(empty(), { ...blockInput, actor: 'customer' }, { now }), 'INVALID_INPUT');
  const blocked = createBlock(empty(), blockInput, { now });
  assert.equal(blocked.ok, true);
  assert.ok(isDemoState(blocked.state));
  assert.equal(create(blocked.state, { startMinute: 840 }).ok, false);
  assert.equal(create(blocked.state, { startMinute: 810 }).ok, false); // cleanup enters block.
  assert.equal(create(blocked.state, { startMinute: 900 }).ok, true);
  errorCode(createBlock(blocked.state, blockInput, { now }), 'CONFLICT');
  errorCode(
    removeBlock(blocked.state, blocked.block.id, { actor: 'admin', expectedVersion: 2 }, { now }),
    'STALE_VERSION',
  );
  const removed = removeBlock(
    blocked.state,
    blocked.block.id,
    { actor: 'admin', expectedVersion: 1 },
    { now },
  );
  assert.equal(removed.ok, true);
  assert.equal(create(removed.state, { startMinute: 840 }).ok, true);
  for (const change of [
    { date: '2026-10-13' },
    { date: '2026-10-22' },
    { startMinute: 841 },
    { endMinute: 1145 },
  ]) {
    assert.equal(createBlock(empty(), { ...blockInput, ...change }, { now }).ok, false);
  }
});

test('persistent reload retains user-created records and reset changes only the demo key', () => {
  const storage = memoryStorage();
  storage.values.set('production-agenda', 'untouched');
  const store = createDemoStore({ storage, now: () => now });
  assert.equal(store.getStatus().persistence, 'local');
  const booked = store.create({ ...input, startMinute: 900 });
  assert.equal(booked.ok, true);
  const reload = createDemoStore({ storage, now: () => now });
  assert.deepEqual(reload.getState(), booked.state);
  const copy = reload.getState();
  copy.appointments[0].label = 'Tampered';
  assert.notEqual(reload.getState().appointments[0].label, 'Tampered');
  assert.equal(reload.reset().ok, true);
  assert.equal(reload.getState().appointments.length, 2);
  assert.equal(storage.values.get('production-agenda'), 'untouched');
  assert.ok(storage.calls.every(([, key]) => key === DEMO_STORAGE_KEY));
});

test('unavailable storage and read/write exceptions retain a functional in-memory demo', () => {
  for (const storage of [
    null,
    {},
    {
      getItem() {
        throw new Error('denied');
      },
      setItem() {},
    },
    {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('quota');
      },
    },
  ]) {
    const store = createDemoStore({ storage, now: () => now });
    assert.equal(store.getStatus().persistence, 'memory');
    const booked = store.create({ ...input, startMinute: 900 });
    assert.equal(booked.ok, true);
    assert.equal(store.getState().appointments.length, 3);
    assert.equal(store.reset().state.appointments.length, 2);
  }
});

test('malformed, oversized, wrong-schema or personal-data storage is replaced with safe seed data', () => {
  for (const raw of [
    'not json',
    'null',
    '{}',
    'x'.repeat(120_001),
    JSON.stringify({ ...empty(), schemaVersion: 2 }),
    JSON.stringify({ ...create().state, email: 'never retained' }),
    JSON.stringify({ ...empty(), appointments: [null] }),
    JSON.stringify({
      ...create().state,
      appointments: [{ ...create().appointment, label: 'Actual customer' }],
    }),
  ]) {
    const storage = memoryStorage();
    storage.values.set(DEMO_STORAGE_KEY, raw);
    const store = createDemoStore({ storage, now: () => now });
    assert.equal(store.getStatus().recovered, true);
    assert.ok(isDemoState(store.getState()));
    assert.equal(store.getState().appointments.length, 2);
    assert.ok(!storage.values.get(DEMO_STORAGE_KEY).includes('never retained'));
  }
});

test('a second tab detects stale data before writing and can retry from refreshed state', () => {
  const storage = memoryStorage();
  const first = createDemoStore({ storage, now: () => now });
  const second = createDemoStore({ storage, now: () => now });
  assert.equal(first.create({ ...input, startMinute: 900 }).ok, true);
  errorCode(second.create({ ...input, startMinute: 960 }), 'STALE_STATE');
  assert.deepEqual(second.getState(), first.getState());
  assert.equal(second.create({ ...input, startMinute: 960 }).ok, true);
  const third = createDemoStore({ storage, now: () => now });
  assert.equal(third.getState().appointments.length, 4);
  storage.values.set(DEMO_STORAGE_KEY, 'corrupt');
  errorCode(third.create({ ...input, startMinute: 1020 }), 'STALE_STATE');
  assert.ok(isDemoState(third.getState()));
});

test('state is bounded and malformed active overlaps are rejected', () => {
  const first = create().state;
  const duplicate = structuredClone(first.appointments[0]);
  duplicate.id = 'demo-appointment-2';
  const overlapping = { ...first, nextId: 3, appointments: [...first.appointments, duplicate] };
  assert.equal(isDemoState(overlapping), false);
  const state = empty();
  state.nextId = DEMO_POLICY.maxAppointments + 1;
  state.appointments = Array.from({ length: DEMO_POLICY.maxAppointments }, (_, index) => ({
    ...create().appointment,
    id: `demo-appointment-${index + 1}`,
    label: `Cliente demo ${index + 1}`,
    status: 'cancelled',
  }));
  assert.ok(isDemoState(state));
  errorCode(create(state), 'LIMIT_REACHED');
});

test('module isolation: no production imports, network, cookies, secrets or identifiers', async () => {
  const source = await readFile(new URL('../src/demo-store.js', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /\bimport\s|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.cookie|sessionStorage|\/api\//,
  );
  assert.doesNotMatch(source, /access_token|authToken|identityId|email\s*:/);
  assert.equal((source.match(/labarberia:demo:v1/g) ?? []).length, 1);
});

test('wrapper create, own-slot move, reload and cancellation persist a single synthetic record', () => {
  const storage = memoryStorage();
  const store = createDemoStore({ storage, now: () => now });
  const booked = store.create({ ...input, startMinute: 900 });
  const moved = store.reschedule(booked.appointment.id, {
    date,
    startMinute: 905,
    expectedVersion: 1,
  });
  assert.equal(moved.ok, true);
  assert.equal(moved.appointment.version, 2);
  const reload = createDemoStore({ storage, now: () => now });
  const persisted = reload.getState().appointments.find(({ id }) => id === booked.appointment.id);
  assert.equal(persisted.startMinute, 905);
  errorCode(reload.cancel(persisted.id, { expectedVersion: 1 }), 'STALE_VERSION');
  const cancelled = reload.cancel(persisted.id, { expectedVersion: 2 });
  assert.equal(cancelled.ok, true);
  const last = createDemoStore({ storage, now: () => now });
  assert.equal(
    last.getState().appointments.find(({ id }) => id === persisted.id).status,
    'cancelled',
  );
  assert.equal(last.getState().appointments.length, 3);
  assert.ok(
    last
      .availableSlots({ date, serviceId: 'corte', professionalId })
      .some(({ startMinute }) => startMinute === 905),
  );
});

test('storage failures after initialization and an external reset do not lose in-memory work', () => {
  for (const failureType of ['read', 'write']) {
    const underlying = memoryStorage();
    let fail = false;
    const storage = {
      getItem(key) {
        if (fail && failureType === 'read') throw new Error('denied after init');
        return underlying.getItem(key);
      },
      setItem(key, value) {
        if (fail && failureType === 'write') throw new Error('quota after init');
        underlying.setItem(key, value);
      },
    };
    const store = createDemoStore({ storage, now: () => now });
    fail = true;
    assert.equal(store.create({ ...input, startMinute: 900 }).ok, true);
    assert.equal(store.getStatus().persistence, 'memory');
    assert.equal(store.getState().appointments.length, 3);
  }
  const storage = memoryStorage();
  const store = createDemoStore({ storage, now: () => now });
  store.create({ ...input, startMinute: 900 });
  storage.values.delete(DEMO_STORAGE_KEY);
  errorCode(store.create({ ...input, startMinute: 960 }), 'STALE_STATE');
  assert.equal(store.getState().appointments.length, 2);
});

test('counter boundaries fail safely instead of persisting an invalid state', () => {
  const state = empty();
  state.nextId = Number.MAX_SAFE_INTEGER - 2;
  errorCode(create(state), 'LIMIT_REACHED');
  const first = create();
  first.state.appointments[0].version = Number.MAX_SAFE_INTEGER - 2;
  errorCode(
    cancelAppointment(
      first.state,
      first.appointment.id,
      { expectedVersion: Number.MAX_SAFE_INTEGER - 2 },
      { now },
    ),
    'LIMIT_REACHED',
  );
});

test('explicit refresh synchronizes another tab without changing cached snapshots or stale-write checks', () => {
  const storage = memoryStorage();
  const first = createDemoStore({ storage, now: () => now });
  const second = createDemoStore({ storage, now: () => now });
  const booked = first.create({ ...input, startMinute: 900 });
  assert.equal(second.getState().appointments.length, 2);
  const refreshed = second.refresh();
  assert.deepEqual(refreshed, booked.state);
  refreshed.appointments.length = 0;
  assert.equal(second.getState().appointments.length, 3);
  assert.equal(second.create({ ...input, startMinute: 960 }).ok, true);
  first.refresh();
  const blocked = first.block({
    date,
    startMinute: 1020,
    endMinute: 1080,
    professionalId,
    actor: 'admin',
  });
  assert.equal(blocked.ok, true);
  assert.equal(second.refresh().blocks.length, 1);
  assert.equal(first.unblock(blocked.block.id, { actor: 'admin', expectedVersion: 1 }).ok, true);
  assert.deepEqual(second.refresh().blocks, []);
  assert.equal(second.getState().appointments.length, 4);
});
