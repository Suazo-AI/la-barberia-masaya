import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import {
  AgendaError,
  canonicalStringify,
  createAgendaService,
  hashConfiguration,
  validateAgendaConfig,
} from '../core/index.ts';
import type { Actor, AgendaConfig, MutationContext } from '../core/contracts.ts';

const day = '2026-10-05';
const now = () => new Date('2026-10-05T18:00:00Z');
const admin: Actor = { kind: 'admin', id: 'catalog-test-owner' };
const context = (key: string, actor: Actor = { kind: 'public' }): MutationContext => ({
  idempotencyKey: key,
  configVersion: 1,
  actor,
});
const errorCode = (code: string) => (error: unknown) =>
  error instanceof AgendaError && error.code === code;

// Synthetic regression data only. These prices, staff, shifts, buffers and policies
// are deliberately not the business configuration or a production fallback.
function testConfig(): AgendaConfig {
  return {
    mode: 'fixture',
    businessId: 'catalog-regression',
    businessName: 'Synthetic catalog regression',
    timeZone: 'America/Managua',
    currency: 'NIO',
    verified: false,
    version: 1,
    slotStepMinutes: 15,
    minLeadMinutes: 0,
    maxAdvanceDays: 7,
    cancellationLeadMinutes: 0,
    professionals: [
      {
        id: 'fixture-staff',
        name: 'Synthetic professional',
        weeklyHours: [[], [[780, 960]], [], [], [], [], []],
      },
    ],
    services: [
      { id: 'duration-30', durationMinutes: 30, priceMinorUnits: 12345 },
      { id: 'duration-15', durationMinutes: 15, priceMinorUnits: 6789 },
      { id: 'duration-45', durationMinutes: 45, priceMinorUnits: 19001 },
    ].map((service) => ({
      ...service,
      name: `Synthetic ${service.id}`,
      description: 'Local regression fixture only.',
      professionalIds: ['fixture-staff'],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    })),
  };
}

async function setup(t: TestContext, config = testConfig()) {
  const store = new SqliteStore(':memory:');
  t.after(() => store.close());
  await migrateSqlite(store);
  return { store, config, agenda: createAgendaService(store, config, { now }) };
}

test('catalog retains each independently configured duration and integer NIO price', async (t) => {
  const { agenda, config } = await setup(t);
  assert.deepEqual(validateAgendaConfig(config), []);
  const catalog = await agenda.catalog();
  assert.equal(catalog.currency, 'NIO');
  assert.equal(catalog.configVersion, 1);
  assert.equal(catalog.notifications, 'disabled');
  assert.deepEqual(catalog.services, config.services);
  // Neither a caller changing its original object nor a catalog response can
  // silently rewrite the service used by future bookings.
  config.services[0].durationMinutes = 90;
  config.services[0].priceMinorUnits = 1;
  catalog.services[1].durationMinutes = 90;
  catalog.services[1].priceMinorUnits = 1;
  assert.deepEqual((await agenda.catalog()).services, testConfig().services);
});

for (const service of testConfig().services) {
  test(`${service.durationMinutes}-minute service uses its exact duration for slots, closing and adjacent bookings`, async (t) => {
    const { agenda } = await setup(t);
    const query = { serviceId: service.id, professionalId: 'fixture-staff', date: day };
    const availability = await agenda.availability(query);
    assert.ok(availability.slots.length > 0);
    assert.ok(
      availability.slots.every(
        (slot) => slot.endMinute - slot.startMinute === service.durationMinutes,
      ),
    );
    assert.equal(availability.slots.at(-1)!.startMinute, 960 - service.durationMinutes);
    assert.equal(availability.slots.at(-1)!.endMinute, 960);
    const first = await agenda.createBooking(
      { ...query, startMinute: 780 },
      context(`${service.id}-first`),
    );
    assert.equal(first.booking.durationMinutes, service.durationMinutes);
    assert.equal(first.booking.endMinute, 780 + service.durationMinutes);
    assert.equal(first.booking.priceMinorUnits, service.priceMinorUnits);
    assert.equal(first.booking.currency, 'NIO');
    assert.equal(
      Date.parse(first.booking.endAt) - Date.parse(first.booking.startAt),
      service.durationMinutes * 60_000,
    );
    const occupied = await agenda.availability(query);
    assert.ok(occupied.slots.every((slot) => slot.startMinute >= 780 + service.durationMinutes));
    await assert.rejects(
      agenda.createBooking(
        { ...query, startMinute: 780 + service.durationMinutes - 15 },
        context(`${service.id}-overlap`),
      ),
      errorCode('SLOT_UNAVAILABLE'),
    );
    const adjacent = await agenda.createBooking(
      { ...query, startMinute: 780 + service.durationMinutes },
      context(`${service.id}-adjacent`),
    );
    assert.equal(adjacent.booking.startMinute, first.booking.endMinute);
  });

  test(`${service.durationMinutes}-minute rescheduling uses private availability and preserves the price/duration snapshot`, async (t) => {
    const { agenda, store, config } = await setup(t);
    const query = { date: day, professionalId: 'fixture-staff' };
    const receipt = await agenda.createBooking(
      { ...query, serviceId: service.id, startMinute: 780, managementHash: 'a'.repeat(64) },
      context(`${service.id}-original`),
    );
    const actor: Actor = { kind: 'customer', reservationId: receipt.booking.id };

    // Model an explicitly reviewed offline configuration migration in this
    // isolated in-memory database, never in a live deployment.
    const changed = structuredClone(config);
    changed.version = 2;
    for (const item of changed.services) {
      item.durationMinutes += 15;
      item.priceMinorUnits += 777;
    }
    await store.run(
      'UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ?',
      [changed.version, await hashConfiguration(changed), canonicalStringify(changed)],
    );
    const migrated = createAgendaService(store, changed, { now });
    const catalog = await migrated.catalog();
    const current = catalog.services.find((item) => item.id === service.id)!;
    assert.equal(current.durationMinutes, service.durationMinutes + 15);
    assert.equal(current.priceMinorUnits, service.priceMinorUnits + 777);
    const publicSlots = await migrated.availability({ ...query, serviceId: service.id });
    assert.ok(
      publicSlots.slots.every(
        (slot) => slot.endMinute - slot.startMinute === current.durationMinutes,
      ),
    );
    assert.ok(!publicSlots.slots.some((slot) => slot.startMinute === 780));
    const ownSlots = await migrated.rescheduleAvailability(receipt.booking.id, query, actor);
    assert.ok(ownSlots.slots.some((slot) => slot.startMinute === 780));
    assert.ok(
      ownSlots.slots.every((slot) => slot.endMinute - slot.startMinute === service.durationMinutes),
    );
    assert.equal(ownSlots.slots.at(-1)!.startMinute, 960 - service.durationMinutes);
    const moved = await migrated.rescheduleBooking(
      receipt.booking.id,
      { ...query, startMinute: 795 },
      1,
      { ...context(`${service.id}-move`, actor), configVersion: 2 },
    );
    assert.equal(moved.booking.durationMinutes, service.durationMinutes);
    assert.equal(moved.booking.endMinute, 795 + service.durationMinutes);
    assert.equal(moved.booking.priceMinorUnits, service.priceMinorUnits);
    assert.equal(moved.booking.version, 2);
    assert.deepEqual(await migrated.getBooking(receipt.booking.id, admin), moved);
  });
}

test('confirmed catalog alone cannot activate production while staff, buffers and policies are unknown', async (t) => {
  const partial = {
    ...testConfig(),
    mode: 'unconfigured',
    verified: false,
    professionals: [],
    slotStepMinutes: null,
    minLeadMinutes: null,
    maxAdvanceDays: null,
    cancellationLeadMinutes: null,
    services: testConfig().services.map((service) => ({
      ...service,
      professionalIds: [],
      bufferBeforeMinutes: null,
      bufferAfterMinutes: null,
    })),
  };
  for (const draft of [
    partial,
    { ...partial, mode: 'production', verified: true, verifiedAt: now().toISOString() },
  ]) {
    const { agenda, store } = await setup(t, draft as unknown as AgendaConfig);
    assert.ok(validateAgendaConfig(draft as unknown as AgendaConfig).length > 0);
    await assert.rejects(agenda.catalog(), errorCode('CONFIGURATION_REQUIRED'));
    await assert.rejects(
      agenda.createBooking(
        { serviceId: 'duration-30', date: day, startMinute: 780 },
        context('incomplete-catalog-booking'),
      ),
      errorCode('CONFIGURATION_REQUIRED'),
    );
    for (const table of ['agenda_configuration', 'agenda_entries', 'agenda_outbox'])
      assert.equal((await store.all(`SELECT * FROM ${table}`)).length, 0);
  }
});
