import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import { createAgendaService } from '../core/index.ts';
import type {
  AgendaBackup,
  AgendaService,
  BookingReceipt,
  MutationContext,
} from '../core/contracts.ts';
import { canonicalStringify, hashConfiguration } from '../core/hash.ts';
import { localFixtureConfig } from '../fixtures/local.ts';
import { BackupError, exportBackup, restoreBackup } from '../tools/backup.ts';
import { processOutbox } from '../tools/outbox.ts';
import type { ConcurrencyInput } from './concurrency-worker.ts';

const fixtureNow = '2026-10-14T18:00:00Z';
const publicContext = (key: string): MutationContext => ({
  actor: { kind: 'public' },
  configVersion: 1,
  idempotencyKey: key,
});
const adminContext = (key: string): MutationContext => ({
  actor: { kind: 'admin', id: 'fixture-owner' },
  configVersion: 1,
  idempotencyKey: key,
});

async function setup(t: TestContext): Promise<{
  store: SqliteStore;
  service: AgendaService;
  directory: string;
  path: string;
  stores: SqliteStore[];
}> {
  const directory = await mkdtemp(join(tmpdir(), 'agenda-backup-'));
  const path = join(directory, 'fixture.sqlite');
  const store = new SqliteStore(path);
  const stores = [store];
  t.after(async () => {
    for (const connection of stores) connection.close();
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`));
    await rm(directory, { recursive: true, force: true });
  });
  await migrateSqlite(store);
  const service = createAgendaService(store, localFixtureConfig, {
    now: () => new Date(fixtureNow),
  });
  await service.catalog();
  return { store, service, directory, path, stores };
}

const fixtureBooking = {
  serviceId: 'cut',
  professionalId: 'a',
  date: '2026-10-14',
  startMinute: 780,
  customer: { displayName: 'Cliente ficticio de pruebas', email: 'fixture@example.invalid' },
  managementHash: 'a'.repeat(64),
};

test('versioned private export restores bookings, blocks, walk-ins and idempotency into a fresh SQLite store', async (t) => {
  const { store, service, directory, stores } = await setup(t);
  const firstContext = publicContext('backup-create-first-fixture');
  const first = await service.createBooking(fixtureBooking, firstContext);
  const moved = await service.rescheduleBooking(
    first.booking.id,
    { professionalId: 'a', date: '2026-10-14', startMinute: 840 },
    1,
    adminContext('backup-reschedule-fixture'),
  );
  const second = await service.createBooking(
    { ...fixtureBooking, startMinute: 900 },
    publicContext('backup-create-second-fixture'),
  );
  await service.cancelBooking(second.booking.id, 1, adminContext('backup-cancel-fixture'));
  await service.createWalkIn(
    { ...fixtureBooking, professionalId: 'b', startMinute: 810 },
    adminContext('backup-walkin-fixture'),
  );
  await service.createBlock(
    {
      professionalId: 'b',
      date: '2026-10-14',
      startMinute: 900,
      endMinute: 930,
      label: 'Bloqueo ficticio',
    },
    adminContext('backup-block-fixture'),
  );
  await store.run(
    "INSERT INTO agenda_rate_limits(scope, bucket, count) VALUES('fixture-scope', 100, 2)",
  );
  const backup = await service.exportData();
  assert.equal(backup.version, 1);
  const restored = await restoreBackup(backup, join(directory, 'restored.sqlite'));
  stores.push(restored.store);
  const restoredService = createAgendaService(restored.store, restored.config, {
    now: () => new Date(fixtureNow),
  });
  assert.deepEqual((await restoredService.exportData()).tables, backup.tables);
  const current = await restoredService.getBooking(first.booking.id, {
    kind: 'admin',
    id: 'fixture-owner',
  });
  assert.deepEqual(current, moved);
  assert.equal(await restoredService.authorizeCustomer(first.booking.id, 'a'.repeat(64)), true);
  assert.equal((await restoredService.listBlocks({ date: '2026-10-14' })).length, 1);
  assert.equal(
    (await restoredService.listBookings({ date: '2026-10-14', includeCancelled: true })).length,
    3,
  );
  const replay = await restoredService.createBooking(fixtureBooking, firstContext);
  assert.deepEqual(replay, first);
  assert.deepEqual((await restoredService.exportData()).tables, backup.tables);
  assert.equal((await restored.store.all('PRAGMA foreign_key_check')).length, 0);
  assert.equal(
    (await restored.store.all<{ integrity_check: string }>('PRAGMA integrity_check'))[0]
      ?.integrity_check,
    'ok',
  );
});

test('restore never overwrites an existing database and rejects incompatible formats/table injection', async (t) => {
  const { store, service, path, directory } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('backup-existing-fixture'));
  const backup = await service.exportData();
  await assert.rejects(
    restoreBackup(backup, path),
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST',
  );
  const before = await service.exportData();
  const target = join(directory, 'invalid.sqlite');
  await assert.rejects(restoreBackup({ ...backup, version: 2 }, target), BackupError);
  const injected = structuredClone(backup);
  injected.tables[0]!.name = 'agenda_entries; DROP TABLE agenda_configuration; --';
  await assert.rejects(restoreBackup(injected, target), BackupError);
  assert.deepEqual((await service.exportData()).tables, before.tables);
  assert.equal((await store.all('SELECT * FROM agenda_entries')).length, 1);
  await assert.rejects(
    stat(target),
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT',
  );
});

test('restore rejects forged configuration, active overlaps, or orphan events and removes its new target', async (t) => {
  const { service, directory } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('backup-corrupt-fixture'));
  const backup = await service.exportData();
  const forged = structuredClone(backup);
  forged.config.businessName = 'Otra configuracion ficticia';
  const overlap = structuredClone(backup);
  const entries = overlap.tables.find((table) => table.name === 'agenda_entries')!;
  entries.rows.push({ ...entries.rows[0]!, id: 'overlapping-copy-fixture' });
  const orphan = structuredClone(backup);
  orphan.tables.find((table) => table.name === 'agenda_entries')!.rows = [];
  const extraColumn = structuredClone(backup);
  extraColumn.tables.find((table) => table.name === 'agenda_entries')!.rows[0]!.unexpected =
    'rejected';
  for (const [index, candidate] of [forged, overlap, orphan, extraColumn].entries()) {
    const target = join(directory, `corrupt-${index}.sqlite`);
    await assert.rejects(restoreBackup(candidate, target), BackupError);
    await assert.rejects(
      stat(target),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT',
    );
  }
  assert.deepEqual((await service.exportData()).tables, backup.tables);
});

test('restore rejects malformed cached replies, invalid scope/hash and incompatible reservation references', async (t) => {
  const { service, directory } = await setup(t);
  const context = publicContext('backup-semantic-cache-fixture');
  const receipt = await service.createBooking(fixtureBooking, context);
  await service.createBooking(
    { ...fixtureBooking, startMinute: 900 },
    publicContext('backup-semantic-other-fixture'),
  );
  const backup = await service.exportData();
  const cache = (candidate: AgendaBackup) =>
    candidate.tables
      .find((table) => table.name === 'agenda_idempotency')!
      .rows.find((row) => row.key === context.idempotencyKey)!;
  const reply = (candidate: AgendaBackup, alter: (value: BookingReceipt) => void) => {
    const value = structuredClone(receipt);
    alter(value);
    cache(candidate).response_json = JSON.stringify(value);
  };
  const corruptions: Array<(candidate: AgendaBackup) => void> = [
    (candidate) => {
      cache(candidate).response_json = '{}';
    },
    (candidate) => {
      cache(candidate).response_json = '[]';
    },
    (candidate) => {
      cache(candidate).response_json = 'null';
    },
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.id = 'missing-booking-fixture';
      }),
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.version = 2;
      }),
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.status = 'cancelled';
      }),
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.priceMinorUnits += 1;
      }),
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.durationMinutes += 15;
      }),
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.startAt = '2026-10-14T20:00:00.000Z';
      }),
    (candidate) => {
      cache(candidate).scope = 'booking:create:admin:unrelated-fixture';
    },
    (candidate) => {
      cache(candidate).scope = `booking:cancel:${receipt.booking.id}:public`;
    },
    (candidate) => {
      cache(candidate).request_hash = 'not-a-sha256-digest';
    },
    (candidate) => {
      cache(candidate).request_hash = 'A'.repeat(64);
    },
    (candidate) => {
      cache(candidate).key = 'invalid key with spaces';
    },
  ];
  for (const [index, alter] of corruptions.entries()) {
    const candidate = structuredClone(backup);
    alter(candidate);
    const target = join(directory, `invalid-cache-${index}.sqlite`);
    await assert.rejects(restoreBackup(candidate, target), BackupError);
    await assert.rejects(
      stat(target),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT',
    );
  }
  assert.deepEqual((await service.exportData()).tables, backup.tables);
  assert.deepEqual(await service.createBooking(fixtureBooking, context), receipt);
});

test('restore rejects notification payloads incompatible with the event and cached receipt', async (t) => {
  const { service, directory } = await setup(t);
  const receipt = await service.createBooking(
    fixtureBooking,
    publicContext('backup-semantic-outbox-fixture'),
  );
  const backup = await service.exportData();
  const event = (candidate: AgendaBackup) =>
    candidate.tables.find((table) => table.name === 'agenda_outbox')!.rows[0]!;
  const reply = (candidate: AgendaBackup, alter: (value: BookingReceipt) => void) => {
    const value = structuredClone(receipt);
    alter(value);
    event(candidate).payload_json = JSON.stringify(value);
  };
  const corruptions: Array<(candidate: AgendaBackup) => void> = [
    (candidate) => {
      event(candidate).payload_json = '{}';
    },
    (candidate) => {
      event(candidate).payload_json = '[]';
    },
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.id = 'missing-outbox-booking-fixture';
      }),
    (candidate) => {
      event(candidate).entry_version = 2;
    },
    (candidate) => {
      event(candidate).event_type = 'booking.cancelled';
    },
    (candidate) =>
      reply(candidate, (value) => {
        value.booking.status = 'cancelled';
      }),
    (candidate) =>
      reply(candidate, (value) => {
        value.mode = 'production';
      }),
    (candidate) => {
      event(candidate).recipient = 'other-fixture@example.invalid';
    },
    (candidate) => {
      event(candidate).payload_json = JSON.stringify({ ...receipt, mode: ['fixture'] });
    },
  ];
  for (const [index, alter] of corruptions.entries()) {
    const candidate = structuredClone(backup);
    alter(candidate);
    await assert.rejects(
      restoreBackup(candidate, join(directory, `invalid-outbox-${index}.sqlite`)),
      BackupError,
    );
  }
  assert.deepEqual((await service.exportData()).tables, backup.tables);
});

test('restore validates block cache identity, scope and historical active/cancelled state', async (t) => {
  const { service, directory, stores } = await setup(t);
  const input = {
    professionalId: 'a',
    date: '2026-10-14',
    startMinute: 900,
    endMinute: 930,
    label: 'Bloqueo fixture cache',
  };
  const context = adminContext('backup-semantic-block-fixture');
  const original = await service.createBlock(input, context);
  await service.cancelBlock(original.id, 1, adminContext('backup-semantic-unblock-fixture'));
  const backup = await service.exportData();
  for (const [index, response] of [
    {},
    [],
    { ...original, id: 'missing-block-fixture' },
    { ...original, version: 3 },
    { ...original, label: 'Etiqueta equivocada fixture' },
  ].entries()) {
    const candidate = structuredClone(backup);
    candidate.tables
      .find((table) => table.name === 'agenda_idempotency')!
      .rows.find((row) => row.key === context.idempotencyKey)!.response_json =
      JSON.stringify(response);
    await assert.rejects(
      restoreBackup(candidate, join(directory, `invalid-block-cache-${index}.sqlite`)),
      BackupError,
    );
  }
  const restored = await restoreBackup(backup, join(directory, 'historical-block.sqlite'));
  stores.push(restored.store);
  const restoredService = createAgendaService(restored.store, restored.config, {
    now: () => new Date(fixtureNow),
  });
  assert.deepEqual(await restoredService.createBlock(input, context), original);
});

test('restored idempotency retains valid historical replies after moves, cancellation and catalog/policy changes', async (t) => {
  const { store, service, directory, stores } = await setup(t);
  const createContext = publicContext('backup-history-create-fixture');
  const created = await service.createBooking(fixtureBooking, createContext);
  const moveContext = adminContext('backup-history-move-fixture');
  const moveInput = { professionalId: 'b', date: '2026-10-14', startMinute: 840 };
  const moved = await service.rescheduleBooking(created.booking.id, moveInput, 1, moveContext);
  const cancelContext = adminContext('backup-history-cancel-fixture');
  const cancelled = await service.cancelBooking(created.booking.id, 2, cancelContext);
  const changedConfig = structuredClone(localFixtureConfig);
  changedConfig.version = 2;
  changedConfig.cancellationLeadMinutes = 10080;
  changedConfig.maxAdvanceDays = 1;
  changedConfig.services[0]!.name = 'Servicio actualizado de prueba';
  changedConfig.services[0]!.durationMinutes = 45;
  changedConfig.services[0]!.priceMinorUnits = 35000;
  changedConfig.professionals[0]!.name = 'Nombre actualizado de prueba';
  await store.run('UPDATE agenda_configuration SET version = ?, config_hash = ?, config_json = ?', [
    changedConfig.version,
    await hashConfiguration(changedConfig),
    canonicalStringify(changedConfig),
  ]);
  const changedService = createAgendaService(store, changedConfig, {
    now: () => new Date('2026-10-25T18:00:00Z'),
  });
  const backup = await changedService.exportData();
  const restored = await restoreBackup(backup, join(directory, 'historical-changed-config.sqlite'));
  stores.push(restored.store);
  const restoredService = createAgendaService(restored.store, restored.config, {
    now: () => new Date('2026-10-25T18:00:00Z'),
  });
  assert.deepEqual(await restoredService.createBooking(fixtureBooking, createContext), created);
  assert.deepEqual(
    await restoredService.rescheduleBooking(created.booking.id, moveInput, 1, moveContext),
    moved,
  );
  assert.deepEqual(
    await restoredService.cancelBooking(created.booking.id, 2, cancelContext),
    cancelled,
  );
  assert.deepEqual((await restoredService.exportData()).tables, backup.tables);
});

test(
  'one-batch export remains consistent during writes from another real SQLite worker connection',
  { timeout: 30000 },
  async (t) => {
    const { store, service, path, directory, stores } = await setup(t);
    const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const worker = new Worker(new URL('./concurrency-worker.ts', import.meta.url), {
      workerData: {
        databasePath: path,
        gate,
        operation: 'snapshot-writer',
        index: 0,
        count: 12,
      } satisfies ConcurrencyInput,
    });
    t.after(() => worker.terminate());
    let finished = false;
    let result: { ok: boolean; code?: string } | undefined;
    const ready = new Promise<void>((accept, reject) => {
      worker.on('message', (message: { ready?: boolean }) => {
        if (message.ready) accept();
      });
      worker.once('error', reject);
    });
    const completion = new Promise<void>((accept, reject) => {
      worker.on('message', (message: { done?: boolean; ok: boolean; code?: string }) => {
        if (message.done) result = message;
      });
      worker.once('error', reject);
      worker.once('exit', (code) => {
        finished = true;
        if (code === 0 && result?.ok) accept();
        else reject(new Error(`Snapshot writer failed: ${result?.code ?? code}.`));
      });
    });
    await ready;
    const sizes = [0];
    Atomics.store(new Int32Array(gate), 0, 1);
    Atomics.notify(new Int32Array(gate), 0);
    while (!finished) {
      const backup = await exportBackup(store, () => new Date(fixtureNow));
      const count = backup.tables.find((table) => table.name === 'agenda_entries')!.rows.length;
      sizes.push(count);
      for (const table of ['agenda_audit', 'agenda_outbox', 'agenda_idempotency']) {
        assert.equal(
          backup.tables.find((candidate) => candidate.name === table)!.rows.length,
          count,
        );
      }
      await new Promise<void>((accept) => setTimeout(accept, 3));
    }
    await completion;
    const finalBackup = await service.exportData();
    assert.equal(
      finalBackup.tables.find((table) => table.name === 'agenda_entries')!.rows.length,
      12,
    );
    assert.ok(
      sizes.some((size) => size > 0 && size < 12),
      'Observed export snapshots while the writer was active.',
    );
    const restored = await restoreBackup(
      finalBackup,
      join(directory, 'concurrent-restored.sqlite'),
    );
    stores.push(restored.store);
    assert.deepEqual(
      (await exportBackup(restored.store, () => new Date(fixtureNow))).tables,
      finalBackup.tables,
    );
  },
);

test('offline backup CLI round-trips private files without overwrite or printing customer records', async (t) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const privateRoot = join(root, '.agenda-private');
  await mkdir(privateRoot, { recursive: true });
  const directory = await mkdtemp(join(privateRoot, 'cli-fixture-'));
  const path = join(directory, 'fixture.sqlite');
  const store = new SqliteStore(path);
  const connections = [store];
  t.after(async () => {
    for (const connection of connections) connection.close();
    assert.ok(resolve(directory).startsWith(`${resolve(privateRoot)}${sep}`));
    await rm(directory, { recursive: true, force: true });
  });
  await migrateSqlite(store);
  const service = createAgendaService(store, localFixtureConfig, {
    now: () => new Date(fixtureNow),
  });
  await service.createBooking(fixtureBooking, publicContext('backup-cli-fixture'));
  const backupPath = join(directory, 'private-backup.json');
  const restoredPath = join(directory, 'new-restored.sqlite');
  const execute = promisify(execFile);
  const exported = await execute(
    process.execPath,
    ['agenda/tools/backup-cli.ts', 'export', path, backupPath],
    { cwd: root, timeout: 15000 },
  );
  assert.match(exported.stdout, /exported/);
  assert.equal(exported.stdout.includes(fixtureBooking.customer.displayName), false);
  const restored = await execute(
    process.execPath,
    ['agenda/tools/backup-cli.ts', 'restore', backupPath, restoredPath],
    { cwd: root, timeout: 15000 },
  );
  assert.match(restored.stdout, /verified/);
  const restoredStore = new SqliteStore(restoredPath);
  connections.push(restoredStore);
  assert.deepEqual((await exportBackup(restoredStore)).tables, (await service.exportData()).tables);
  await assert.rejects(
    execute(process.execPath, ['agenda/tools/backup-cli.ts', 'export', path, backupPath], {
      cwd: root,
      timeout: 15000,
    }),
  );
  await assert.rejects(
    execute(process.execPath, ['agenda/tools/backup-cli.ts', 'restore', backupPath, restoredPath], {
      cwd: root,
      timeout: 15000,
    }),
  );
  const unsafe = join(root, 'fixture-backup-must-not-be-created.json');
  await assert.rejects(
    execute(process.execPath, ['agenda/tools/backup-cli.ts', 'export', path, unsafe], {
      cwd: root,
      timeout: 15000,
    }),
  );
  await assert.rejects(
    stat(unsafe),
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT',
  );
});

test('outbox defaults to no-send and never implicitly activates disabled records', async (t) => {
  const { store, service } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('outbox-disabled-fixture'));
  let sends = 0;
  const report = await processOutbox(store, {
    transport: {
      async send() {
        sends += 1;
      },
    },
  });
  assert.equal(report.disabled, true);
  assert.equal(report.claimed, 0);
  assert.equal(sends, 0);
  await processOutbox(store, {
    enabled: true,
    transport: {
      async send() {
        sends += 1;
      },
    },
    now: () => new Date(fixtureNow),
  });
  assert.equal(sends, 0);
  assert.equal(
    (
      await store.all<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM agenda_outbox',
      )
    )[0]?.status,
    'disabled',
  );
  await assert.rejects(processOutbox(store, { enabled: true }), /transport/);
});

test('two outbox runners on distinct connections cannot hold the same live lease', async (t) => {
  const { store, service, path, stores } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('outbox-live-lease-fixture'));
  await store.run("UPDATE agenda_outbox SET status = 'pending'");
  const secondStore = new SqliteStore(path);
  stores.push(secondStore);
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((accept) => {
    started = accept;
  });
  const blocked = new Promise<void>((accept) => {
    release = accept;
  });
  let sends = 0;
  const first = processOutbox(store, {
    enabled: true,
    now: () => new Date(fixtureNow),
    limit: 1,
    transport: {
      async send(message) {
        assert.ok(message.id);
        sends += 1;
        started();
        await blocked;
      },
    },
  });
  await entered;
  const second = await processOutbox(secondStore, {
    enabled: true,
    now: () => new Date(fixtureNow),
    limit: 1,
    transport: {
      async send() {
        sends += 1;
      },
    },
  });
  assert.equal(second.claimed, 0);
  release();
  assert.equal((await first).sent, 1);
  assert.equal(sends, 1);
  assert.deepEqual(
    await store.all('SELECT status, attempts, lease_id, lease_until FROM agenda_outbox'),
    [{ status: 'sent', attempts: 1, lease_id: null, lease_until: null }],
  );
});

test('outbox failures preserve bookings, redact transport errors and retry only when due with a bounded limit', async (t) => {
  const { store, service } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('outbox-retry-fixture'));
  await store.run("UPDATE agenda_outbox SET status = 'pending'");
  let clock = Date.parse(fixtureNow);
  let sends = 0;
  const options = {
    enabled: true,
    retryBaseSeconds: 30,
    limit: 1,
    now: () => new Date(clock),
    transport: {
      async send() {
        sends += 1;
        throw new Error('Provider secret and customer data must not reach SQL/logs.');
      },
    },
  };
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const report = await processOutbox(store, options);
    assert.equal(report.claimed, 1);
    const row = (
      await store.all<{
        attempts: number;
        last_error: string;
        next_attempt_at: number | null;
        status: string;
      }>('SELECT attempts, last_error, next_attempt_at, status FROM agenda_outbox')
    )[0]!;
    assert.equal(row.attempts, attempt);
    assert.equal(row.last_error, 'TRANSPORT_FAILED');
    assert.equal((await service.listBookings({ date: '2026-10-14' })).length, 1);
    if (attempt < 5) {
      assert.equal(report.retried, 1);
      assert.equal((await processOutbox(store, options)).claimed, 0);
      clock = row.next_attempt_at! * 1000;
    } else {
      assert.equal(report.failed, 1);
      assert.equal(row.status, 'failed');
      assert.equal(row.next_attempt_at, null);
    }
  }
  assert.equal(sends, 5);
  assert.equal((await processOutbox(store, options)).claimed, 0);
});

test('an expired old lease cannot overwrite the newer runner acknowledgement', async (t) => {
  const { store, service, path, stores } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('outbox-expired-lease-fixture'));
  await store.run("UPDATE agenda_outbox SET status = 'pending'");
  const secondStore = new SqliteStore(path);
  stores.push(secondStore);
  let clock = Date.parse(fixtureNow);
  let entered!: () => void;
  let rejectOld!: () => void;
  const started = new Promise<void>((accept) => {
    entered = accept;
  });
  const blocked = new Promise<void>((_, reject) => {
    rejectOld = () => reject(new Error('Old fake transport failed.'));
  });
  const first = processOutbox(store, {
    enabled: true,
    leaseSeconds: 10,
    limit: 1,
    now: () => new Date(clock),
    transport: {
      async send() {
        entered();
        await blocked;
      },
    },
  });
  await started;
  clock += 11000;
  const second = await processOutbox(secondStore, {
    enabled: true,
    leaseSeconds: 10,
    limit: 1,
    now: () => new Date(clock),
    transport: { async send() {} },
  });
  assert.equal(second.sent, 1);
  rejectOld();
  assert.equal((await first).staleLease, 1);
  assert.deepEqual(await store.all('SELECT status, attempts, last_error FROM agenda_outbox'), [
    { status: 'sent', attempts: 2, last_error: null },
  ]);
});

test('outbox retires an exhausted crashed lease without an additional send', async (t) => {
  const { store, service } = await setup(t);
  await service.createBooking(fixtureBooking, publicContext('outbox-exhausted-fixture'));
  await store.run(
    "UPDATE agenda_outbox SET status = 'processing', attempts = 5, lease_id = 'crashed-lease-fixture-id', lease_until = 1",
  );
  let sends = 0;
  const report = await processOutbox(store, {
    enabled: true,
    now: () => new Date(fixtureNow),
    transport: {
      async send() {
        sends += 1;
      },
    },
  });
  assert.equal(report.failed, 1);
  assert.equal(sends, 0);
  assert.deepEqual(await store.all('SELECT status, last_error FROM agenda_outbox'), [
    { status: 'failed', last_error: 'DELIVERY_RETRY_LIMIT' },
  ]);
});
