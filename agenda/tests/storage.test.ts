import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import { D1Store } from '../adapters/d1.ts';
import type { D1Binding, D1PreparedStatement, D1StatementResult } from '../adapters/d1.ts';
import type { SqlStatement } from '../core/contracts.ts';
import type { ConcurrencyInput } from './concurrency-worker.ts';

export interface WorkerResult {
  done: true;
  ok: boolean;
  code?: string;
  bookingId?: string;
}

async function database(t: TestContext): Promise<{ store: SqliteStore; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'agenda-storage-'));
  const path = join(directory, 'fixture.sqlite');
  const store = new SqliteStore(path);
  t.after(async () => {
    store.close();
    const target = resolve(directory);
    assert.ok(target.startsWith(`${resolve(tmpdir())}${sep}`));
    await rm(target, { recursive: true, force: true });
  });
  await migrateSqlite(store);
  return { store, path };
}

function block(id: string, professional = 'a', start = 1000, end = 2000): SqlStatement {
  return {
    sql: `INSERT INTO agenda_entries(id, kind, professional_id, professional_name,
      start_utc, end_utc, allocated_start_utc, allocated_end_utc, status, version,
      block_label, created_at, updated_at) VALUES(?, 'block', ?, 'Fixture professional',
      ?, ?, ?, ?, 'confirmed', 1, 'Fixture block', 100, 100)`,
    params: [id, professional, start, end, start, end],
  };
}

export async function runWorkers(
  t: TestContext,
  path: string,
  operation: ConcurrencyInput['operation'],
  count = 8,
): Promise<WorkerResult[]> {
  const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const ready: Promise<void>[] = [];
  const results: Promise<WorkerResult>[] = [];
  for (let index = 0; index < count; index += 1) {
    const worker = new Worker(new URL('./concurrency-worker.ts', import.meta.url), {
      workerData: { databasePath: path, gate, operation, index } satisfies ConcurrencyInput,
    });
    t.after(() => worker.terminate());
    ready.push(
      new Promise<void>((accept, reject) => {
        worker.on('message', (message: { ready?: boolean }) => {
          if (message.ready) accept();
        });
        worker.once('error', reject);
      }),
    );
    results.push(
      new Promise<WorkerResult>((accept, reject) => {
        let result: WorkerResult | undefined;
        worker.on('message', (message: WorkerResult) => {
          if (message.done) result = message;
        });
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code === 0 && result) accept(result);
          else reject(new Error(`Concurrency worker exited with code ${code}.`));
        });
      }),
    );
  }
  await Promise.all(ready);
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0, count);
  return Promise.all(results);
}

test('SQLite uses FK constraints, durable migrations and safe bound values', async (t) => {
  const { store, path } = await database(t);
  await migrateSqlite(store);
  assert.equal(
    (await store.all<{ foreign_keys: number }>('PRAGMA foreign_keys'))[0]?.foreign_keys,
    1,
  );
  assert.equal((await store.all('SELECT * FROM _agenda_migrations')).length, 2);
  await store.run('CREATE TABLE fixture_values(id INTEGER PRIMARY KEY, text TEXT, bytes BLOB)');
  const text = "fixture'); DROP TABLE agenda_entries; --";
  const bytes = new Uint8Array([0, 1, 255]);
  await store.run('INSERT INTO fixture_values(id, text, bytes) VALUES(?, ?, ?)', [1, text, bytes]);
  const rows = await store.all<{ text: string; bytes: Uint8Array }>(
    'SELECT text, bytes FROM fixture_values',
  );
  assert.equal(rows[0]?.text, text);
  assert.deepEqual(rows[0]?.bytes, bytes);
  store.close();
  const reopened = new SqliteStore(path);
  try {
    assert.equal((await reopened.all('SELECT * FROM fixture_values')).length, 1);
  } finally {
    reopened.close();
  }
});

test('SQLite batch rolls all statements back on a failed constraint', async (t) => {
  const { store } = await database(t);
  await assert.rejects(
    store.batch([
      block('first'),
      {
        sql: "INSERT INTO agenda_audit(id, entry_id, action, actor_kind, entry_version, created_at) VALUES('audit', 'first', 'blocked', 'admin', 1, 100)",
      },
      block('overlap', 'a', 1500, 2500),
    ]),
    /AGENDA_SLOT_CONFLICT/,
  );
  assert.deepEqual(await store.all('SELECT * FROM agenda_entries'), []);
  assert.deepEqual(await store.all('SELECT * FROM agenda_audit'), []);
  await store.batch([block('after-rollback')]);
  assert.equal((await store.all('SELECT * FROM agenda_entries')).length, 1);
});

test('SQLite zero-row optimistic update guard aborts the entire transaction', async (t) => {
  const { store } = await database(t);
  await assert.rejects(
    store.batch([
      block('must-rollback'),
      { sql: "UPDATE agenda_entries SET version = version + 1 WHERE id = 'missing'" },
      {
        sql: 'INSERT INTO agenda_write_guard(id, affected) VALUES(1, changes()) ON CONFLICT(id) DO UPDATE SET affected = excluded.affected',
      },
      {
        sql: "INSERT INTO agenda_idempotency(scope, key, request_hash, response_json, created_at) VALUES('fixture', 'fixture-key', 'fixture-hash', '{}', 100)",
      },
    ]),
    /agenda_one_change/,
  );
  assert.deepEqual(await store.all('SELECT * FROM agenda_entries'), []);
  assert.deepEqual(await store.all('SELECT * FROM agenda_idempotency'), []);
  assert.deepEqual(await store.all('SELECT * FROM agenda_write_guard'), []);
});

test('SQLite batch reports SELECT and RETURNING rows without repeating mutations', async (t) => {
  const { store } = await database(t);
  await store.run('CREATE TABLE fixture_counter(id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
  const results = await store.batch([
    { sql: 'INSERT INTO fixture_counter VALUES(1, 0)' },
    { sql: 'SELECT * FROM fixture_counter' },
    { sql: 'UPDATE fixture_counter SET value = value + 1 WHERE id = 1 RETURNING value' },
    { sql: 'UPDATE fixture_counter SET value = 9 WHERE id = 999 RETURNING value' },
    { sql: 'SELECT value FROM fixture_counter' },
  ]);
  assert.equal(results[0]?.changes, 1);
  assert.deepEqual(results[0]?.rows, []);
  assert.equal(results[1]?.changes, 0);
  assert.deepEqual(results[1]?.rows, [{ id: 1, value: 0 }]);
  assert.equal(results[2]?.changes, 1);
  assert.deepEqual(results[2]?.rows, [{ value: 1 }]);
  assert.equal(results[3]?.changes, 0);
  assert.deepEqual(results[3]?.rows, []);
  assert.deepEqual(results[4]?.rows, [{ value: 1 }]);
});

test('SQL overlap guards allow adjacent and different-professional blocks and reject conflicting updates', async (t) => {
  const { store } = await database(t);
  await store.batch([
    block('first'),
    block('adjacent', 'a', 2000, 3000),
    block('other-professional', 'b'),
  ]);
  await assert.rejects(
    store.run(`UPDATE agenda_entries SET start_utc = 1500, allocated_start_utc = 1500
    WHERE id = 'adjacent'`),
    /AGENDA_SLOT_CONFLICT/,
  );
  assert.equal(
    (
      await store.all<{ start_utc: number }>(
        "SELECT start_utc FROM agenda_entries WHERE id = 'adjacent'",
      )
    )[0]?.start_utc,
    2000,
  );
  await store.run("UPDATE agenda_entries SET status = 'cancelled' WHERE id = 'first'");
  await store.batch([block('replacement')]);
});

test('SQLite enforces foreign keys and refuses changed applied migrations', async (t) => {
  const { store } = await database(t);
  await assert.rejects(
    store.run(`INSERT INTO agenda_audit(id, entry_id, action, actor_kind, entry_version, created_at)
    VALUES('orphan', 'missing', 'created', 'admin', 1, 100)`),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      store.applyMigrations([
        { name: '0001_agenda.sql', sql: 'SELECT 1;', sha256: 'modified' },
        { name: '0002_staff_absences.sql', sql: 'SELECT 1;', sha256: 'modified' },
      ]),
    /modified/,
  );
  assert.equal((await store.all('SELECT * FROM _agenda_migrations')).length, 2);
  await store.run('PRAGMA user_version = 999');
  await assert.rejects(migrateSqlite(store), /newer/);
  assert.equal(
    (await store.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version,
    999,
  );
});

test(
  'eight real SQLite worker connections cannot commit overlapping raw batches',
  { timeout: 30000 },
  async (t) => {
    const { store, path } = await database(t);
    const results = await runWorkers(t, path, 'raw-overlap');
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.ok(
      results.filter((result) => !result.ok).every((result) => result.code === 'SLOT_UNAVAILABLE'),
    );
    assert.equal((await store.all('SELECT * FROM agenda_entries')).length, 1);
    assert.equal((await store.all('SELECT * FROM agenda_audit')).length, 1);
  },
);

test(
  'eight real SQLite worker connections race for one booking with one outbox/audit/idempotency event',
  { timeout: 30000 },
  async (t) => {
    const { store, path } = await database(t);
    const results = await runWorkers(t, path, 'booking');
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.ok(
      results.filter((result) => !result.ok).every((result) => result.code === 'SLOT_UNAVAILABLE'),
    );
    for (const table of ['agenda_entries', 'agenda_audit', 'agenda_outbox', 'agenda_idempotency']) {
      assert.equal((await store.all(`SELECT * FROM ${table}`)).length, 1);
    }
  },
);

test(
  'eight racing identical idempotency keys replay one committed booking',
  { timeout: 30000 },
  async (t) => {
    const { store, path } = await database(t);
    const results = await runWorkers(t, path, 'identical-booking');
    assert.ok(
      results.every((result) => result.ok),
      JSON.stringify(results),
    );
    assert.equal(new Set(results.map((result) => result.bookingId)).size, 1);
    for (const table of ['agenda_entries', 'agenda_audit', 'agenda_outbox', 'agenda_idempotency']) {
      assert.equal((await store.all(`SELECT * FROM ${table}`)).length, 1);
    }
  },
);

test('D1 adapter contract uses one host batch, binds values and normalizes results (no real D1 claim)', async () => {
  const prepared: Array<{ sql: string; values: unknown[] }> = [];
  let batchCalls = 0;
  let runCalls = 0;
  const binding: D1Binding = {
    prepare(sql) {
      const call = { sql, values: [] as unknown[] };
      prepared.push(call);
      const statement: D1PreparedStatement = {
        bind(...values) {
          call.values = values;
          return statement;
        },
        async all<T>() {
          return { success: true, results: [{ payload: [0, 255] }] as T[] };
        },
        async run() {
          runCalls += 1;
          return { success: true, meta: { changes: 1, last_row_id: 2 }, results: [] };
        },
      };
      return statement;
    },
    async batch(statements) {
      batchCalls += 1;
      assert.equal(statements.length, 2);
      return [
        { success: true, meta: { changes: 1 }, results: [] },
        { success: true, meta: { changes: 0 }, results: [{ value: 3 }] },
      ];
    },
  };
  const store = new D1Store(binding);
  const bytes = new Uint8Array([9, 0, 255, 9]).subarray(1, 3);
  const result = await store.batch([
    { sql: 'INSERT fixture (?)', params: [bytes] },
    { sql: 'SELECT fixture' },
  ]);
  assert.equal(batchCalls, 1);
  assert.equal(runCalls, 0);
  assert.deepEqual(new Uint8Array(prepared[0]?.values[0] as ArrayBuffer), new Uint8Array([0, 255]));
  assert.equal(result[0]?.changes, 1);
  assert.deepEqual(result[1]?.rows, [{ value: 3 }]);
  assert.deepEqual(
    (await store.all<{ payload: Uint8Array }>('SELECT fixture'))[0]?.payload,
    new Uint8Array([0, 255]),
  );
  await store.run('UPDATE fixture');
  assert.equal(runCalls, 1);
});

test('D1 adapter propagates transaction failures and rejects incomplete host results (contract test)', async () => {
  let response: D1StatementResult[] = [{ success: false, error: 'AGENDA_SLOT_CONFLICT' }];
  const statement: D1PreparedStatement = {
    bind() {
      return statement;
    },
    async all<T>() {
      return { success: false, error: 'D1 unavailable' } as D1StatementResult<T>;
    },
    async run() {
      return { success: false, error: 'D1 unavailable' };
    },
  };
  const store = new D1Store({ prepare: () => statement, batch: async () => response });
  await assert.rejects(store.batch([{ sql: 'INSERT fixture' }]), /AGENDA_SLOT_CONFLICT/);
  response = [];
  await assert.rejects(store.batch([{ sql: 'INSERT fixture' }]), /incomplete/);
  await assert.rejects(store.all('SELECT fixture'), /unavailable/);
  await assert.rejects(store.run('UPDATE fixture'), /unavailable/);
  assert.deepEqual(await store.batch([]), []);
});
