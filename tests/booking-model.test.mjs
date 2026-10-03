import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICES,
  BARBERS,
  businessNow,
  addDays,
  dateRange,
  openingHours,
  mockOccupations,
  availableSlots,
  nextAvailableDate,
} from '../src/booking-model.js';

const now = new Date('2026-10-03T15:00:00Z'); // Saturday 09:00 in Managua.
const query = { date: '2026-10-03', serviceId: 'cut', barberId: 'any', now };

test('business date follows Managua across UTC midnight', () => {
  assert.deepEqual(businessNow(new Date('2026-10-04T01:45:00Z')), {
    date: '2026-10-03',
    minute: 1185,
  });
  assert.deepEqual(dateRange(now), { min: '2026-10-03', max: '2026-10-23' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('weekly schedule distinguishes closed Tuesday and occupied demo Thursday', () => {
  assert.equal(openingHours('2026-10-06'), null);
  assert.deepEqual(availableSlots({ ...query, date: '2026-10-06' }), []);
  assert.deepEqual(openingHours('2026-10-08'), [780, 1140]);
  assert.deepEqual(availableSlots({ ...query, date: '2026-10-08' }), []);
  assert.equal(nextAvailableDate({ ...query, date: '2026-10-08' }), '2026-10-09');
});

test('each service fits opening bounds and avoids occupations of every assigned professional', () => {
  for (let offset = 0; offset < 21; offset++) {
    const date = addDays(query.date, offset);
    for (const service of SERVICES)
      for (const barberId of ['any', ...BARBERS.map(({ id }) => id)]) {
        const slots = availableSlots({ ...query, date, serviceId: service.id, barberId });
        const hours = openingHours(date);
        assert.equal(new Set(slots.map(({ start }) => start)).size, slots.length);
        for (const slot of slots) {
          assert.equal(slot.end - slot.start, service.duration);
          assert.ok(slot.start >= hours[0] && slot.end <= hours[1]);
          assert.ok(slot.barberIds.length > 0);
          for (const id of slot.barberIds) {
            if (barberId !== 'any') assert.equal(id, barberId);
            for (const [start, end] of mockOccupations(date, id))
              assert.ok(slot.end <= start || slot.start >= end);
          }
        }
      }
  }
});

test('any professional is a deduplicated union, retaining available assignment IDs', () => {
  const a = availableSlots({ ...query, barberId: 'a' });
  const b = availableSlots({ ...query, barberId: 'b' });
  const any = availableSlots(query);
  assert.deepEqual(
    any.map(({ start }) => start),
    [...new Set([...a, ...b].map(({ start }) => start))].sort((a, b) => a - b),
  );
  const firstCombo = availableSlots({ ...query, serviceId: 'combo' }).find(
    ({ start }) => start === 600,
  );
  assert.deepEqual(firstCombo.barberIds, ['a']);
});

test('service duration changes usable starts and excludes closing overruns', () => {
  const short = availableSlots({ ...query, barberId: 'a', serviceId: 'beard' });
  const long = availableSlots({ ...query, barberId: 'a', serviceId: 'combo' });
  assert.ok(short.some(({ start }) => start === 1110));
  assert.ok(!long.some(({ start }) => start === 1110));
  assert.ok(short.length > long.length);
});

test('past starts, past dates, invalid dates and out-of-horizon dates are excluded', () => {
  const midday = new Date('2026-10-03T18:15:00Z');
  assert.ok(availableSlots({ ...query, now: midday }).every(({ start }) => start > 735));
  for (const date of ['2026-10-02', '2026-10-24', '2026-02-30', '', 'invalid'])
    assert.deepEqual(availableSlots({ ...query, date }), []);
  assert.deepEqual(availableSlots({ ...query, serviceId: 'unknown' }), []);
  assert.deepEqual(availableSlots({ ...query, barberId: 'unknown' }), []);
  assert.deepEqual(availableSlots({ ...query, now: new Date('2026-10-04T01:00:00Z') }), []);
});
