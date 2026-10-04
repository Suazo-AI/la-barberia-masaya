import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import { validateAgendaConfig } from '../core/config.ts';
import { canonicalStringify, hashConfiguration } from '../core/hash.ts';
import { BACKUP_TABLES, SCHEMA_VERSION } from '../core/schema.ts';
import type {
  AgendaBackup,
  AgendaConfig,
  SqlStatement,
  SqlStore,
  SqlValue,
} from '../core/contracts.ts';

export class BackupError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(): never {
  throw new BackupError(
    'INVALID_BACKUP',
    'Backup format, configuration or invariants are invalid.',
  );
}
const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const backupOrder: Record<(typeof BACKUP_TABLES)[number], string> = {
  agenda_configuration: 'business_id',
  agenda_entries: 'id',
  agenda_idempotency: 'scope, key',
  agenda_audit: 'id',
  agenda_outbox: 'id',
  agenda_rate_limits: 'scope, bucket',
};

/** All tables, including the stored configuration, belong to one SQL snapshot. */
export async function exportBackup(
  store: SqlStore,
  now: () => Date = () => new Date(),
): Promise<AgendaBackup> {
  const results = await store.batch(
    BACKUP_TABLES.map((name) => ({
      sql: `SELECT * FROM ${quote(name)} ORDER BY ${backupOrder[name]}`,
    })),
  );
  const configRows = results[0]?.rows;
  if (configRows?.length !== 1 || typeof configRows[0]?.config_json !== 'string') fail();
  let config: unknown;
  try {
    config = JSON.parse(configRows[0].config_json);
  } catch {
    fail();
  }
  return validateBackup({
    format: 'portable-agenda',
    version: SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    config,
    tables: BACKUP_TABLES.map((name, index) => ({ name, rows: results[index]?.rows ?? [] })),
  });
}

/** Validates the fixed versioned envelope; never accepts backup-provided SQL. */
export function validateBackup(value: unknown): AgendaBackup {
  if (
    !record(value) ||
    value.format !== 'portable-agenda' ||
    value.version !== SCHEMA_VERSION ||
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !record(value.config) ||
    !Array.isArray(value.tables) ||
    value.tables.length !== BACKUP_TABLES.length
  )
    fail();
  const config = value.config as unknown as AgendaConfig;
  if (config.mode === 'unconfigured' || validateAgendaConfig(config).length > 0) fail();
  const names = new Set<string>();
  let rowCount = 0;
  for (const table of value.tables) {
    if (
      !record(table) ||
      typeof table.name !== 'string' ||
      !BACKUP_TABLES.some((name) => name === table.name) ||
      names.has(table.name) ||
      !Array.isArray(table.rows)
    )
      fail();
    names.add(table.name);
    rowCount += table.rows.length;
    if (rowCount > 1_000_000) fail();
    for (const row of table.rows) {
      if (
        !record(row) ||
        Object.keys(row).length > 64 ||
        Object.values(row).some(
          (item) =>
            item !== null &&
            typeof item !== 'string' &&
            !(typeof item === 'number' && Number.isSafeInteger(item)),
        )
      )
        fail();
    }
  }
  // Copy caller-owned data so it cannot change during asynchronous restore checks.
  return structuredClone(value) as unknown as AgendaBackup;
}

async function verifyDatabase(store: SqliteStore, config: AgendaConfig): Promise<void> {
  const [integrity, foreignKeys, conflicts, configuration] = await store.batch([
    { sql: 'PRAGMA integrity_check' },
    { sql: 'PRAGMA foreign_key_check' },
    {
      sql: `SELECT a.id FROM agenda_entries a JOIN agenda_entries b
      ON a.id < b.id AND a.professional_id = b.professional_id
      WHERE a.status = 'confirmed' AND b.status = 'confirmed'
      AND a.allocated_start_utc < b.allocated_end_utc
      AND a.allocated_end_utc > b.allocated_start_utc LIMIT 1`,
    },
    { sql: 'SELECT * FROM agenda_configuration' },
  ]);
  if (
    integrity?.rows?.length !== 1 ||
    integrity.rows[0]?.integrity_check !== 'ok' ||
    foreignKeys?.rows?.length !== 0 ||
    conflicts?.rows?.length !== 0 ||
    configuration?.rows?.length !== 1
  )
    fail();
  const row = configuration.rows[0];
  if (
    !row ||
    row.business_id !== config.businessId ||
    row.version !== config.version ||
    row.config_hash !== (await hashConfiguration(config)) ||
    typeof row.config_json !== 'string'
  )
    fail();
  let storedConfig: unknown;
  try {
    storedConfig = JSON.parse(row.config_json);
  } catch {
    fail();
  }
  if (canonicalStringify(storedConfig) !== canonicalStringify(config)) fail();

  const entries = await store.all<Record<string, SqlValue>>('SELECT * FROM agenda_entries');
  const professionals = new Set(config.professionals.map((professional) => professional.id));
  const services = new Set(config.services.map((service) => service.id));
  for (const entry of entries) {
    if (
      typeof entry.professional_id !== 'string' ||
      !professionals.has(entry.professional_id) ||
      (entry.kind !== 'block' &&
        (typeof entry.service_id !== 'string' || !services.has(entry.service_id))) ||
      ![
        'start_utc',
        'end_utc',
        'allocated_start_utc',
        'allocated_end_utc',
        'created_at',
        'updated_at',
      ].every(
        (column) => typeof entry[column] === 'number' && Number.isSafeInteger(entry[column]),
      ) ||
      (entry.management_hash !== null &&
        (typeof entry.management_hash !== 'string' ||
          !/^[a-f0-9]{64}$/.test(entry.management_hash)))
    )
      fail();
  }
  const invalidEvents =
    await store.all(`SELECT o.id FROM agenda_outbox o JOIN agenda_entries e ON e.id = o.entry_id
    WHERE e.kind = 'block' OR o.entry_version > e.version
    UNION ALL SELECT a.id FROM agenda_audit a JOIN agenda_entries e ON e.id = a.entry_id
    WHERE a.entry_version > e.version LIMIT 1`);
  if (invalidEvents.length > 0) fail();
}

/** Restores only to an exclusively created database; the source is never replaced. */
export async function restoreBackup(
  value: unknown,
  targetNewDatabase: string,
): Promise<{ store: SqliteStore; config: AgendaConfig }> {
  const backup = validateBackup(value);
  if (targetNewDatabase === ':memory:')
    throw new BackupError('NEW_DATABASE_REQUIRED', 'Restore requires a new file-backed database.');
  const path = resolve(targetNewDatabase);
  let store: SqliteStore | undefined;
  const file = await open(path, 'wx', 0o600);
  try {
    store = new SqliteStore(path);
    await file.close();
    await migrateSqlite(store);
    const inserts: SqlStatement[] = [];
    for (const name of BACKUP_TABLES) {
      const table = backup.tables.find((candidate) => candidate.name === name);
      if (!table) fail();
      const columns = await store.all<{ name: string }>(`PRAGMA table_info(${quote(name)})`);
      const expectedColumns = columns.map((column) => column.name).sort();
      for (const row of table.rows) {
        const keys = Object.keys(row).sort();
        if (canonicalStringify(keys) !== canonicalStringify(expectedColumns)) fail();
        inserts.push({
          sql: `INSERT INTO ${quote(name)} (${keys.map(quote).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          params: keys.map((key) => row[key] as SqlValue),
        });
      }
    }
    await store.batch(inserts);
    await verifyDatabase(store, backup.config);
    return { store, config: backup.config };
  } catch (error) {
    store?.close();
    await file.close().catch(() => {});
    // These exact paths are exclusively created by this invocation. No recursive
    // cleanup, source path manipulation or replacement of an existing file.
    await unlink(path).catch(() => {});
    await unlink(`${path}-wal`).catch(() => {});
    await unlink(`${path}-shm`).catch(() => {});
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      'RESTORE_REJECTED',
      'Backup restore failed; the original database was not changed.',
    );
  }
}
