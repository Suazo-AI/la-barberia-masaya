import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { SqliteStore } from '../adapters/sqlite.ts';
import { createAgendaService, AgendaError } from '../core/index.ts';
import { localFixtureConfig, unconfiguredConfig } from '../fixtures/local.ts';
import type { Actor, MutationContext, SqlStatement, SqlValue } from '../core/contracts.ts';
import type { ConcurrencyInput } from './concurrency-worker.ts';

const directory = new URL('../../drizzle/', import.meta.url);
const portableSql = await readFile(
  new URL('../migrations/0001_agenda.sql', import.meta.url),
  'utf8',
);
const journal: {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
} = JSON.parse(await readFile(new URL('meta/_journal.json', directory), 'utf8'));
const migrations = await Promise.all(
  journal.entries.map(async (entry) => ({
    ...entry,
    sql: await readFile(new URL(`${entry.tag}.sql`, directory), 'utf8'),
  })),
);

// This is the only migration delimiter. A trigger includes internal semicolons.
const statements = migrations.flatMap((migration) =>
  migration.sql
    .split('--> statement-breakpoint')
    .map((sql) => sql.trim())
    .filter(Boolean),
);
const normalize = (sql: string): string => sql.trim().replace(/\s+/g, ' ');
const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

function database(t: TestContext, kind: 'sites' | 'portable'): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => db.close());
  if (kind === 'portable') db.exec(portableSql);
  else for (const sql of statements) db.prepare(sql).run();
  return db;
}

async function sitesStore(t: TestContext): Promise<SqliteStore> {
  const store = new SqliteStore(':memory:');
  t.after(() => store.close());
  for (const sql of statements) await store.run(sql);
  return store;
}

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'agenda_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
}

// Extract balanced CHECK expressions rather than treating semicolons or nested
// function parentheses as boundaries. String literals may contain parentheses.
function checkExpressions(sql: string): string[] {
  const checks: string[] = [];
  const matcher = /\bCHECK\s*\(/gi;
  for (let match = matcher.exec(sql); match; match = matcher.exec(sql)) {
    let cursor = matcher.lastIndex;
    const start = cursor;
    let depth = 1;
    let quoted = false;
    while (depth > 0 && cursor < sql.length) {
      const char = sql[cursor];
      if (char === "'") {
        if (quoted && sql[cursor + 1] === "'") cursor += 1;
        else quoted = !quoted;
      } else if (!quoted) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
      }
      cursor += 1;
    }
    assert.equal(depth, 0, 'Every CHECK expression must be complete');
    checks.push(normalize(sql.slice(start, cursor - 1)));
    matcher.lastIndex = cursor;
  }
  return checks.sort();
}

function indexes(db: DatabaseSync, table: string) {
  return db
    .prepare(`PRAGMA index_list(${quote(table)})`)
    .all()
    .map((row) => {
      const name = String(row.name);
      const source = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(name)?.sql;
      return {
        // An inline UNIQUE and Drizzle's explicit unique index have the same
        // uniqueness behavior despite differing SQLite-assigned names/origins.
        columns: db
          .prepare(`PRAGMA index_info(${quote(name)})`)
          .all()
          .map((column) => column.name),
        unique: row.unique,
        partial: row.partial,
        where:
          typeof source === 'string' ? normalize(source.match(/\bWHERE\s+(.+)$/i)?.[1] ?? '') : '',
      };
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function insert(db: DatabaseSync, table: string, values: Record<string, SqlValue>): void {
  const columns = Object.keys(values);
  db.prepare(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
  ).run(...Object.values(values));
}

function block(id: string, professional = 'a', start = 1000, end = 2000): Record<string, SqlValue> {
  return {
    id,
    kind: 'block',
    professional_id: professional,
    professional_name: 'Fixture',
    start_utc: start,
    end_utc: end,
    allocated_start_utc: start,
    allocated_end_utc: end,
    status: 'confirmed',
    version: 1,
    block_label: 'Fixture block',
    created_at: 100,
    updated_at: 100,
  };
}

test('Sites migrations have generated journal entries, chained snapshots and whole trigger statements', async (t) => {
  assert.equal(journal.dialect, 'sqlite');
  assert.equal(journal.version, '7');
  assert.equal(journal.entries.length, 2);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(
    names,
    journal.entries.map((entry) => `${entry.tag}.sql`),
  );
  const snapshots = await Promise.all(
    journal.entries.map(async (entry, index) => {
      assert.equal(entry.idx, index);
      assert.equal(entry.breakpoints, true);
      assert.equal(entry.version, '6');
      assert.ok(Number.isSafeInteger(entry.when));
      return JSON.parse(
        await readFile(
          new URL(`meta/${String(index).padStart(4, '0')}_snapshot.json`, directory),
          'utf8',
        ),
      );
    }),
  );
  assert.equal(snapshots[0].prevId, '00000000-0000-0000-0000-000000000000');
  assert.equal(snapshots[1].prevId, snapshots[0].id);
  assert.deepEqual(snapshots[1].tables, snapshots[0].tables);
  assert.equal(Object.keys(snapshots[0].tables).length, 8);
  assert.equal(
    Object.values(snapshots[0].tables).reduce(
      (total: number, table: any) => total + Object.keys(table.checkConstraints).length,
      0,
    ),
    31,
  );
  const drizzleRead = readMigrationFiles({ migrationsFolder: fileURLToPath(directory) });
  assert.deepEqual(
    drizzleRead.flatMap((migration) => migration.sql.map((sql) => sql.trim()).filter(Boolean)),
    statements,
  );
  const triggers = statements.filter((sql) => /CREATE TRIGGER/.test(sql));
  assert.equal(triggers.length, 2);
  for (const trigger of triggers) {
    assert.match(trigger, /BEGIN\s+SELECT RAISE\(ABORT, 'AGENDA_SLOT_CONFLICT'\);\s+END;$/);
    assert.equal(trigger.match(/CREATE TRIGGER/g)?.length, 1);
  }
  assert.ok(
    !statements.some((sql) => /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM)?\s*agenda_/i.test(sql)),
  );
  assert.ok(!statements.some((sql) => /PRAGMA\s+(?:user_version|foreign_keys)/i.test(sql)));
  assert.equal(statements.at(-1), 'PRAGMA optimize;');
  // prepare().run() accepts each complete CREATE TRIGGER; executing only its
  // first semicolon-delimited fragment would fail immediately.
  const db = database(t, 'sites');
  assert.equal(
    db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'trigger'").get()?.count,
    2,
  );
});

test('Sites tables, CHECK expressions, indexes, foreign keys and triggers match the portable schema', (t) => {
  const portable = database(t, 'portable');
  const sites = database(t, 'sites');
  const tables = tableNames(portable);
  assert.equal(tables.length, 8);
  assert.deepEqual(tableNames(sites), tables);
  for (const name of tables) {
    const columns = (db: DatabaseSync) =>
      db
        .prepare(`PRAGMA table_info(${quote(name)})`)
        .all()
        .map((row) => ({ ...row, type: String(row.type).toLowerCase() }));
    assert.deepEqual(columns(sites), columns(portable), `${name}: columns/defaults/nullability/PK`);
    assert.deepEqual(
      sites.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all(),
      portable.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all(),
      `${name}: foreign keys`,
    );
    assert.deepEqual(indexes(sites, name), indexes(portable, name), `${name}: index definitions`);
    const source = (db: DatabaseSync) =>
      String(
        db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name)
          ?.sql,
      );
    assert.deepEqual(
      checkExpressions(source(sites)),
      checkExpressions(source(portable)),
      `${name}: every CHECK`,
    );
  }
  const triggers = (db: DatabaseSync) =>
    db
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name")
      .all()
      .map((row) => ({ name: row.name, sql: normalize(String(row.sql)) }));
  assert.deepEqual(triggers(sites), triggers(portable));
  for (const row of portable
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL")
    .all()) {
    assert.ok(
      sites
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .get(String(row.name)),
    );
  }
  assert.equal(sites.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  assert.deepEqual(sites.prepare('PRAGMA foreign_key_check').all(), []);
});

for (const kind of ['portable', 'sites'] as const) {
  test(`${kind}: all allocation kinds, adjacency, cancellation, buffers and update overlap guards`, (t) => {
    const db = database(t, kind);
    insert(db, 'agenda_entries', block('first'));
    insert(db, 'agenda_entries', block('adjacent', 'a', 2000, 3000));
    insert(db, 'agenda_entries', block('other', 'b'));
    for (const entryKind of ['block', 'booking', 'walk-in']) {
      const value = block(`conflict-${entryKind}`, 'a', 1500, 2500);
      if (entryKind !== 'block')
        Object.assign(value, {
          kind: entryKind,
          end_utc: 3300,
          allocated_end_utc: 3300,
          block_label: null,
          service_id: 'cut',
          service_name: 'Fixture',
          duration_minutes: 30,
          price_minor_units: 20000,
        });
      assert.throws(() => insert(db, 'agenda_entries', value), /AGENDA_SLOT_CONFLICT/);
    }
    assert.throws(
      () =>
        db
          .prepare(
            "UPDATE agenda_entries SET start_utc=1500, allocated_start_utc=1500 WHERE id='adjacent'",
          )
          .run(),
      /AGENDA_SLOT_CONFLICT/,
    );
    assert.throws(
      () => db.prepare("UPDATE agenda_entries SET professional_id='a' WHERE id='other'").run(),
      /AGENDA_SLOT_CONFLICT/,
    );
    db.prepare("UPDATE agenda_entries SET status='cancelled' WHERE id='first'").run();
    insert(db, 'agenda_entries', block('replacement'));
    assert.throws(
      () => db.prepare("UPDATE agenda_entries SET status='confirmed' WHERE id='first'").run(),
      /AGENDA_SLOT_CONFLICT/,
    );
    insert(db, 'agenda_entries', {
      ...block('buffered', 'c', 4000, 5800),
      kind: 'booking',
      allocated_start_utc: 3400,
      buffer_before_minutes: 10,
      allocated_end_utc: 6400,
      buffer_after_minutes: 10,
      block_label: null,
      service_id: 'cut',
      service_name: 'Fixture',
      duration_minutes: 30,
      price_minor_units: 20000,
    });
    assert.throws(
      () => insert(db, 'agenda_entries', block('before-buffer', 'c', 3000, 3500)),
      /AGENDA_SLOT_CONFLICT/,
    );
    assert.throws(
      () => insert(db, 'agenda_entries', block('after-buffer', 'c', 6300, 7000)),
      /AGENDA_SLOT_CONFLICT/,
    );
    insert(db, 'agenda_entries', block('buffer-adjacent', 'c', 6400, 7000));
  });

  test(`${kind}: invalid CHECK values, foreign keys and uniqueness fail at the SQL boundary`, (t) => {
    const db = database(t, kind);
    insert(db, 'agenda_entries', block('entry'));
    const invalidEntryChanges = [
      "kind='unknown'",
      'start_utc=1000.5',
      'end_utc=start_utc',
      'end_utc=2000.5',
      'allocated_start_utc=start_utc+1',
      'allocated_end_utc=end_utc-1',
      'buffer_before_minutes=-1',
      'buffer_before_minutes=0.5',
      'buffer_after_minutes=-1',
      'buffer_after_minutes=0.5',
      "currency='USD'",
      "status='pending'",
      'version=0',
      'version=1.5',
      "management_hash='short'",
      'allocated_start_utc=start_utc-1',
      'allocated_end_utc=end_utc+1',
      "service_id='forbidden'",
      "service_name='forbidden'",
      'duration_minutes=30',
      'price_minor_units=0',
      "customer_display_name='forbidden'",
      "customer_email='fixture@example.invalid'",
      'block_label=NULL',
    ];
    for (const change of invalidEntryChanges) {
      assert.throws(
        () => db.prepare(`UPDATE agenda_entries SET ${change} WHERE id='entry'`).run(),
        /CHECK constraint failed/,
        change,
      );
    }
    insert(db, 'agenda_entries', {
      ...block('booking', 'b', 1000, 2800),
      kind: 'booking',
      block_label: null,
      service_id: 'cut',
      service_name: 'Fixture',
      duration_minutes: 30,
      price_minor_units: 20000,
    });
    for (const change of [
      'service_id=NULL',
      'service_name=NULL',
      'duration_minutes=0',
      'duration_minutes=30.5',
      'duration_minutes=20',
      'price_minor_units=-1',
      'price_minor_units=0.5',
      "block_label='forbidden'",
    ]) {
      assert.throws(
        () => db.prepare(`UPDATE agenda_entries SET ${change} WHERE id='booking'`).run(),
        /CHECK constraint failed/,
        change,
      );
    }
    const config = {
      business_id: 'fixture',
      version: 1,
      config_hash: 'a'.repeat(64),
      config_json: '{}',
    };
    for (const change of [
      { version: 0 },
      { version: 1.5 },
      { config_hash: 'short' },
      { config_json: 'invalid' },
    ]) {
      assert.throws(
        () => insert(db, 'agenda_configuration', { ...config, ...change }),
        /CHECK constraint failed/,
      );
    }
    for (const [table, values] of [
      ['agenda_write_guard', { id: 2, affected: 1 }],
      ['agenda_write_guard', { id: 1, affected: 0 }],
      ['agenda_configuration_guard', { id: 2, valid: 1 }],
      ['agenda_configuration_guard', { id: 1, valid: 0 }],
      ['agenda_rate_limits', { scope: 'test', bucket: 1.5, count: 1 }],
      ['agenda_rate_limits', { scope: 'test', bucket: 1, count: 0 }],
      ['agenda_rate_limits', { scope: 'test', bucket: 1, count: 1.5 }],
      [
        'agenda_idempotency',
        {
          scope: 'test',
          key: 'key',
          request_hash: 'test',
          response_json: 'invalid',
          created_at: 1,
        },
      ],
    ] satisfies Array<[string, Record<string, SqlValue>]>) {
      assert.throws(() => insert(db, table, values), /CHECK constraint failed/);
    }
    const audit = {
      id: 'audit',
      entry_id: 'entry',
      action: 'blocked',
      actor_kind: 'admin',
      entry_version: 1,
      created_at: 1,
    };
    for (const change of [{ action: 'unknown' }, { actor_kind: 'unknown' }, { entry_version: 0 }]) {
      assert.throws(
        () => insert(db, 'agenda_audit', { ...audit, ...change }),
        /CHECK constraint failed/,
      );
    }
    assert.throws(
      () => insert(db, 'agenda_audit', { ...audit, entry_id: 'missing' }),
      /FOREIGN KEY/,
    );
    const event = {
      id: 'outbox',
      entry_id: 'entry',
      event_type: 'booking.confirmed',
      entry_version: 1,
      payload_json: '{}',
      created_at: 1,
    };
    const invalidOutboxChanges: Record<string, SqlValue>[] = [
      { event_type: 'unknown' },
      { entry_version: 0 },
      { payload_json: 'invalid' },
      { status: 'unknown' },
      { attempts: -1 },
      { attempts: 6 },
    ];
    for (const change of invalidOutboxChanges) {
      assert.throws(
        () => insert(db, 'agenda_outbox', { ...event, ...change }),
        /CHECK constraint failed/,
      );
    }
    assert.throws(
      () => insert(db, 'agenda_outbox', { ...event, entry_id: 'missing' }),
      /FOREIGN KEY/,
    );
    insert(db, 'agenda_audit', audit);
    insert(db, 'agenda_outbox', { ...event, lease_id: 'unique-lease' });
    assert.equal(db.prepare('SELECT status FROM agenda_outbox').get()?.status, 'disabled');
    assert.throws(() => insert(db, 'agenda_outbox', { ...event, id: 'duplicate-event' }), /UNIQUE/);
    assert.throws(
      () =>
        insert(db, 'agenda_outbox', {
          ...event,
          id: 'duplicate-lease',
          entry_version: 2,
          lease_id: 'unique-lease',
        }),
      /UNIQUE/,
    );
    insert(db, 'agenda_outbox', { ...event, id: 'null-lease-1', entry_version: 2 });
    insert(db, 'agenda_outbox', { ...event, id: 'null-lease-2', entry_version: 3 });
    assert.throws(
      () => db.prepare("DELETE FROM agenda_entries WHERE id='entry'").run(),
      /FOREIGN KEY/,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
}

test('Sites migration SQL retains atomic rollback on both optimistic and configuration assertion guards', async (t) => {
  const store = await sitesStore(t);
  const insert: SqlStatement = {
    sql: `INSERT INTO agenda_entries(id, kind, professional_id, professional_name,
    start_utc, end_utc, allocated_start_utc, allocated_end_utc, status, version, block_label, created_at, updated_at)
    VALUES('rollback', 'block', 'a', 'Fixture', 1000, 2000, 1000, 2000, 'confirmed', 1, 'Fixture', 1, 1)`,
  };
  for (const [assertion, expected] of [
    [
      'INSERT INTO agenda_write_guard(id, affected) VALUES(1, changes()) ON CONFLICT(id) DO UPDATE SET affected=excluded.affected',
      /agenda_one_change/,
    ],
    [
      'INSERT INTO agenda_configuration_guard(id, valid) VALUES(1, 0) ON CONFLICT(id) DO UPDATE SET valid=excluded.valid',
      /agenda_active_configuration/,
    ],
  ] as const) {
    await assert.rejects(
      store.batch([
        insert,
        { sql: "UPDATE agenda_entries SET version=version+1 WHERE id='missing'" },
        { sql: assertion },
      ]),
      expected,
    );
    assert.deepEqual(await store.all('SELECT * FROM agenda_entries'), []);
    assert.deepEqual(await store.all('SELECT * FROM agenda_write_guard'), []);
    assert.deepEqual(await store.all('SELECT * FROM agenda_configuration_guard'), []);
  }
});

test('agenda core runs booking, idempotency, cancellation, walk-in, block and export on Sites migration SQL', async (t) => {
  const store = await sitesStore(t);
  const now = () => new Date('2026-10-05T18:00:00Z');
  const agenda = createAgendaService(store, structuredClone(localFixtureConfig), { now });
  const admin: Actor = { kind: 'admin', id: 'fixture-owner' };
  const context = (key: string, actor: Actor = { kind: 'public' }): MutationContext => ({
    idempotencyKey: key,
    actor,
    configVersion: 1,
  });
  const input = {
    serviceId: 'cut',
    professionalId: 'a',
    date: '2026-10-05',
    startMinute: 780,
    managementHash: 'a'.repeat(64),
  };
  const first = await agenda.createBooking(input, context('sites-booking-0001'));
  assert.deepEqual(await agenda.createBooking(input, context('sites-booking-0001')), first);
  assert.equal(await agenda.authorizeCustomer(first.booking.id, 'a'.repeat(64)), true);
  await assert.rejects(
    agenda.createBooking(input, context('sites-booking-0002')),
    (error: unknown) => error instanceof AgendaError && error.code === 'SLOT_UNAVAILABLE',
  );
  const moved = await agenda.rescheduleBooking(
    first.booking.id,
    { date: input.date, startMinute: 810, professionalId: 'a' },
    1,
    context('sites-move-0001', admin),
  );
  assert.equal(moved.booking.version, 2);
  const cancelled = await agenda.cancelBooking(
    first.booking.id,
    2,
    context('sites-cancel-0001', admin),
  );
  assert.equal(cancelled.booking.status, 'cancelled');
  await agenda.createWalkIn(
    { ...input, managementHash: undefined },
    context('sites-walk-in-0001', admin),
  );
  const blocked = await agenda.createBlock(
    {
      professionalId: 'a',
      date: input.date,
      startMinute: 840,
      endMinute: 900,
      label: 'Fixture block',
    },
    context('sites-block-0001', admin),
  );
  await agenda.cancelBlock(blocked.id, 1, context('sites-unblock-0001', admin));
  const exported = await agenda.exportData();
  assert.equal(exported.version, 1);
  assert.equal(exported.tables.find((table) => table.name === 'agenda_entries')?.rows.length, 3);
  assert.equal(exported.tables.find((table) => table.name === 'agenda_audit')?.rows.length, 6);
  assert.equal(exported.tables.find((table) => table.name === 'agenda_outbox')?.rows.length, 4);
  assert.ok(
    exported.tables
      .find((table) => table.name === 'agenda_outbox')
      ?.rows.every((row) => row.status === 'disabled'),
  );
});

test('Sites migration SQL stays empty while unconfigured application fails closed', async (t) => {
  const store = await sitesStore(t);
  const agenda = createAgendaService(store, unconfiguredConfig);
  await assert.rejects(
    agenda.catalog(),
    (error: unknown) => error instanceof AgendaError && error.code === 'CONFIGURATION_REQUIRED',
  );
  for (const table of [
    'agenda_configuration',
    'agenda_entries',
    'agenda_audit',
    'agenda_outbox',
    'agenda_idempotency',
  ]) {
    assert.deepEqual(await store.all(`SELECT * FROM ${table}`), []);
  }
});

test(
  'eight independent SQLite connections preserve booking atomicity on the Sites migration schema',
  { timeout: 30000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'agenda-sites-migrations-'));
    const path = join(directory, 'fixture.sqlite');
    const store = new SqliteStore(path);
    t.after(async () => {
      store.close();
      const target = resolve(directory);
      assert.ok(target.startsWith(`${resolve(tmpdir())}${sep}`));
      await rm(target, { recursive: true, force: true });
    });
    for (const sql of statements) await store.run(sql);
    const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const ready: Promise<void>[] = [];
    const results: Promise<{ done: true; ok: boolean; code?: string }>[] = [];
    for (let index = 0; index < 8; index += 1) {
      const worker = new Worker(new URL('./concurrency-worker.ts', import.meta.url), {
        workerData: {
          databasePath: path,
          gate,
          operation: 'booking',
          index,
        } satisfies ConcurrencyInput,
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
        new Promise((accept, reject) => {
          let result: { done: true; ok: boolean; code?: string } | undefined;
          worker.on('message', (message: { done?: true; ok: boolean; code?: string }) => {
            if (message.done) result = { ...message, done: true };
          });
          worker.once('error', reject);
          worker.once('exit', (code) => {
            if (code === 0 && result) accept(result);
            else reject(new Error(`Sites migration concurrency worker exited with code ${code}.`));
          });
        }),
      );
    }
    await Promise.all(ready);
    Atomics.store(new Int32Array(gate), 0, 1);
    Atomics.notify(new Int32Array(gate), 0, 8);
    const outcomes = await Promise.all(results);
    assert.equal(outcomes.filter((result) => result.ok).length, 1);
    assert.ok(
      outcomes.filter((result) => !result.ok).every((result) => result.code === 'SLOT_UNAVAILABLE'),
    );
    for (const table of ['agenda_entries', 'agenda_audit', 'agenda_outbox', 'agenda_idempotency']) {
      assert.equal((await store.all(`SELECT * FROM ${table}`)).length, 1);
    }
  },
);
