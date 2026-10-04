import { parentPort, workerData } from 'node:worker_threads';
import { SqliteStore } from '../adapters/sqlite.ts';
import { createAgendaService, AgendaError } from '../core/index.ts';
import { localFixtureConfig } from '../fixtures/local.ts';

export interface ConcurrencyInput {
  databasePath: string;
  gate: SharedArrayBuffer;
  operation: 'booking' | 'identical-booking' | 'raw-overlap' | 'snapshot-writer';
  index: number;
  count?: number;
}

const input = workerData as ConcurrencyInput;
if (!parentPort) throw new Error('Concurrency helper must run in a worker.');
const port = parentPort;
const gate = new Int32Array(input.gate);
const store = new SqliteStore(input.databasePath, { busyTimeoutMs: 10000 });
port.postMessage({ ready: true });
const wait = Atomics.wait(gate, 0, 0, 10000);
if (wait === 'timed-out') {
  store.close();
  throw new Error('Concurrency barrier timed out.');
}
try {
  if (input.operation === 'snapshot-writer') {
    const service = createAgendaService(store, localFixtureConfig, {
      now: () => new Date('2026-10-14T18:00:00Z'),
    });
    for (let index = 0; index < (input.count ?? 12); index += 1) {
      await service.createBooking(
        {
          serviceId: 'cut',
          professionalId: 'a',
          date: '2026-10-14',
          startMinute: 780 + index * 30,
        },
        {
          actor: { kind: 'public' },
          configVersion: 1,
          idempotencyKey: `snapshot-${index.toString().padStart(3, '0')}-fixture`,
        },
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
    }
    port.postMessage({ done: true, ok: true });
  } else if (input.operation === 'raw-overlap') {
    await store.batch([
      {
        sql: `INSERT INTO agenda_entries(id, kind, professional_id, professional_name,
        start_utc, end_utc, allocated_start_utc, allocated_end_utc, status, version,
        block_label, created_at, updated_at) VALUES(?, 'block', 'a', 'Fixture professional',
        1000, 2000, 1000, 2000, 'confirmed', 1, 'Fixture block', 100, 100)`,
        params: [`parallel-block-${input.index}`],
      },
      {
        sql: `INSERT INTO agenda_audit(id, entry_id, action, actor_kind, actor_id, entry_version, created_at)
        VALUES(?, ?, 'blocked', 'admin', 'fixture-owner', 1, 100)`,
        params: [`parallel-audit-${input.index}`, `parallel-block-${input.index}`],
      },
    ]);
    port.postMessage({ done: true, ok: true });
  } else {
    const service = createAgendaService(store, localFixtureConfig, {
      now: () => new Date('2026-10-14T18:00:00Z'),
    });
    const key =
      input.operation === 'identical-booking'
        ? 'same-key-workers-fixture'
        : `workers-key-${input.index}-fixture`;
    const receipt = await service.createBooking(
      { serviceId: 'cut', professionalId: 'a', date: '2026-10-14', startMinute: 780 },
      { actor: { kind: 'public' }, configVersion: 1, idempotencyKey: key },
    );
    port.postMessage({ done: true, ok: true, bookingId: receipt.booking.id });
  }
} catch (error) {
  port.postMessage({
    done: true,
    ok: false,
    code:
      error instanceof AgendaError
        ? error.code
        : error instanceof Error && error.message.includes('AGENDA_SLOT_CONFLICT')
          ? 'SLOT_UNAVAILABLE'
          : 'STORAGE_ERROR',
  });
} finally {
  store.close();
}
