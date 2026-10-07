import { parentPort, workerData } from 'node:worker_threads';
import { SqliteStore } from '../adapters/sqlite.ts';
import { createAgendaService, AgendaError } from '../core/index.ts';
import { localFixtureConfig } from '../fixtures/local.ts';

const input = workerData as {
  databasePath: string;
  gate: SharedArrayBuffer;
  operation: 'booking' | 'absence' | 'same-absence';
  index: number;
};
if (!parentPort) throw new Error('Concurrency helper must run in a worker.');
const port = parentPort;
const store = new SqliteStore(input.databasePath, { busyTimeoutMs: 10000 });
port.postMessage({ ready: true });
if (Atomics.wait(new Int32Array(input.gate), 0, 0, 10000) === 'timed-out') {
  store.close();
  throw new Error('Concurrency barrier timed out.');
}
try {
  const agenda = createAgendaService(store, localFixtureConfig, {
    now: () => new Date('2026-10-05T18:00:00Z'),
  });
  if (input.operation === 'booking') {
    const receipt = await agenda.createBooking(
      { serviceId: 'cut', professionalId: 'a', date: '2026-10-05', startMinute: 780 },
      {
        actor: { kind: 'public' },
        configVersion: 1,
        idempotencyKey: `race-booking-${input.index}`,
      },
    );
    port.postMessage({ done: true, ok: true, bookingId: receipt.booking.id });
  } else {
    const absence = await agenda.createAbsence(
      {
        professionalId: 'a',
        startDate: '2026-10-05',
        startMinute: 780,
        endDate: '2026-10-05',
        endMinute: 840,
      },
      {
        actor: { kind: 'barber', id: 'fixture-barber-a', professionalId: 'a' },
        configVersion: 1,
        idempotencyKey:
          input.operation === 'same-absence' ? 'same-absence-key' : `race-absence-${input.index}`,
      },
    );
    port.postMessage({ done: true, ok: true, absence });
  }
} catch (error) {
  port.postMessage({
    done: true,
    ok: false,
    code: error instanceof AgendaError ? error.code : 'STORAGE_ERROR',
  });
} finally {
  store.close();
}
