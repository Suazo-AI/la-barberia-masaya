import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import { validateAgendaConfig } from '../core/config.ts';
import { canonicalStringify, hashConfiguration } from '../core/hash.ts';
import { BACKUP_TABLES, SCHEMA_VERSION } from '../core/schema.ts';
import { isoInstant, toUtcSeconds, validDate } from '../core/time.ts';
import { digestPattern, identifierPattern } from '../core/validation.ts';
import type {
  AgendaBackup,
  AgendaConfig,
  BookingReceipt,
  ScheduleBlock,
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

type BackupRow = Record<string, SqlValue>;
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && identifierPattern.test(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const versionKey = (id: string, version: number): string => `${id}:${version}`;

function shape(
  value: unknown,
  required: string[],
  optional: string[] = [],
): value is Record<string, unknown> {
  return (
    record(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}

function parseJson(value: SqlValue | undefined): unknown {
  if (typeof value !== 'string') fail();
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail();
  }
}

function snapshotTimes(value: Record<string, unknown>): { start: number; end: number } {
  if (
    !validDate(value.date) ||
    !integer(value.startMinute, 0, 1439) ||
    !integer(value.endMinute, 1, 1440) ||
    value.endMinute <= value.startMinute
  )
    fail();
  try {
    return {
      start: toUtcSeconds(value.date, value.startMinute),
      end: toUtcSeconds(value.date, value.endMinute),
    };
  } catch {
    fail();
  }
}

/** Prices/duration/customer are immutable snapshots; historical moves can have different times/staff. */
function receiptSnapshot(value: unknown, entry: BackupRow): BookingReceipt {
  if (
    !shape(value, ['booking', 'mode', 'notification', 'customerManagement']) ||
    typeof value.mode !== 'string' ||
    !['fixture', 'production'].includes(value.mode) ||
    value.notification !== 'disabled' ||
    value.customerManagement !== (entry.management_hash === null ? 'admin-only' : 'token') ||
    !shape(
      value.booking,
      [
        'id',
        'kind',
        'serviceId',
        'serviceName',
        'professionalId',
        'professionalName',
        'date',
        'startMinute',
        'endMinute',
        'startAt',
        'endAt',
        'durationMinutes',
        'priceMinorUnits',
        'currency',
        'status',
        'version',
      ],
      ['customerDisplayName'],
    )
  )
    fail();
  const booking = value.booking;
  if (
    entry.kind === 'block' ||
    !identifier(booking.id) ||
    booking.id !== entry.id ||
    booking.kind !== entry.kind ||
    !identifier(booking.serviceId) ||
    booking.serviceId !== entry.service_id ||
    !text(booking.serviceName, 120) ||
    booking.serviceName !== entry.service_name ||
    !identifier(booking.professionalId) ||
    !text(booking.professionalName, 120) ||
    !integer(booking.durationMinutes, 5, 480) ||
    booking.durationMinutes !== entry.duration_minutes ||
    !integer(booking.priceMinorUnits, 0, 10000000) ||
    booking.priceMinorUnits !== entry.price_minor_units ||
    booking.currency !== 'NIO' ||
    booking.currency !== entry.currency ||
    !['confirmed', 'cancelled'].includes(String(booking.status)) ||
    !integer(booking.version, 1, 2147483647) ||
    booking.version > Number(entry.version) ||
    (entry.customer_display_name === null
      ? Object.hasOwn(booking, 'customerDisplayName')
      : !text(booking.customerDisplayName, 80) ||
        booking.customerDisplayName !== entry.customer_display_name)
  )
    fail();
  const times = snapshotTimes(booking);
  if (
    (booking.endMinute as number) - (booking.startMinute as number) !== booking.durationMinutes ||
    booking.startAt !== isoInstant(times.start) ||
    booking.endAt !== isoInstant(times.end) ||
    (booking.status === 'cancelled' &&
      (entry.status !== 'cancelled' || booking.version !== entry.version))
  )
    fail();
  if (
    booking.version === entry.version &&
    (booking.professionalId !== entry.professional_id ||
      booking.professionalName !== entry.professional_name ||
      times.start !== entry.start_utc ||
      times.end !== entry.end_utc ||
      booking.status !== entry.status)
  )
    fail();
  return value as unknown as BookingReceipt;
}

function blockSnapshot(value: unknown, entry: BackupRow): ScheduleBlock {
  if (
    !shape(value, [
      'id',
      'professionalId',
      'date',
      'startMinute',
      'endMinute',
      'label',
      'status',
      'version',
    ]) ||
    entry.kind !== 'block' ||
    !identifier(value.id) ||
    value.id !== entry.id ||
    !identifier(value.professionalId) ||
    value.professionalId !== entry.professional_id ||
    !text(value.label, 120) ||
    value.label !== entry.block_label ||
    !integer(value.version, 1, 2) ||
    value.version > Number(entry.version) ||
    !['active', 'cancelled'].includes(String(value.status)) ||
    (value.status === 'cancelled' &&
      (entry.status !== 'cancelled' || value.version !== entry.version))
  )
    fail();
  const times = snapshotTimes(value);
  if (
    times.start !== entry.start_utc ||
    times.end !== entry.end_utc ||
    (value.version === entry.version &&
      value.status !== (entry.status === 'confirmed' ? 'active' : 'cancelled'))
  )
    fail();
  return value as unknown as ScheduleBlock;
}

function actorScope(audit: BackupRow, entry: BackupRow): string {
  if (audit.actor_kind === 'public') {
    if (audit.actor_id !== null || audit.action !== 'created' || entry.kind !== 'booking') fail();
    return 'public';
  }
  if (
    audit.actor_kind === 'admin' &&
    typeof audit.actor_id === 'string' &&
    audit.actor_id.length > 0 &&
    audit.actor_id.length <= 254 &&
    !/[\u0000-\u001f\u007f]/.test(audit.actor_id)
  )
    return `admin:${audit.actor_id}`;
  if (
    audit.actor_kind === 'customer' &&
    identifier(audit.actor_id) &&
    audit.actor_id === entry.id &&
    ['cancelled', 'rescheduled'].includes(String(audit.action)) &&
    entry.kind !== 'block'
  )
    return `customer:${audit.actor_id}`;
  fail();
}

function expectedScope(audit: BackupRow, entry: BackupRow): string {
  const actor = actorScope(audit, entry);
  if (audit.action === 'created') return `${entry.kind}:create:${actor}`;
  if (audit.action === 'blocked') return `block:create:${actor}`;
  if (audit.action === 'unblocked') return `block:cancel:${String(entry.id)}:${actor}`;
  if (audit.action === 'cancelled') return `booking:cancel:${String(entry.id)}:${actor}`;
  if (audit.action === 'rescheduled') return `booking:reschedule:${String(entry.id)}:${actor}`;
  fail();
}

/** Cached replies and notifications are typed event snapshots, not arbitrary valid JSON. */
function validateEventSnapshots(backup: AgendaBackup): void {
  const table = (name: string): BackupRow[] => {
    const rows = backup.tables.find((candidate) => candidate.name === name)?.rows;
    if (!rows) fail();
    return rows;
  };
  const entries = new Map<string, BackupRow>();
  for (const entry of table('agenda_entries')) {
    if (
      !identifier(entry.id) ||
      entries.has(entry.id) ||
      !['booking', 'walk-in', 'block'].includes(String(entry.kind)) ||
      !['confirmed', 'cancelled'].includes(String(entry.status)) ||
      !integer(entry.version, 1, 2147483647)
    )
      fail();
    entries.set(entry.id, entry);
  }
  const audits = new Map<string, BackupRow>();
  const histories = new Map<string, BackupRow[]>();
  for (const audit of table('agenda_audit')) {
    if (
      !identifier(audit.id) ||
      !identifier(audit.entry_id) ||
      !integer(audit.entry_version, 1, 2147483647) ||
      !integer(audit.created_at, 0)
    )
      fail();
    const entry = entries.get(audit.entry_id);
    const key = versionKey(audit.entry_id, audit.entry_version);
    if (!entry || audit.entry_version > Number(entry.version) || audits.has(key)) fail();
    actorScope(audit, entry);
    audits.set(key, audit);
    const history = histories.get(audit.entry_id) ?? [];
    history.push(audit);
    histories.set(audit.entry_id, history);
  }
  for (const [id, entry] of entries) {
    const history = (histories.get(id) ?? []).sort(
      (a, b) => Number(a.entry_version) - Number(b.entry_version),
    );
    if (
      history.length !== entry.version ||
      (entry.kind === 'block' && history.length !== (entry.status === 'cancelled' ? 2 : 1))
    )
      fail();
    for (const [index, audit] of history.entries()) {
      const final = index === history.length - 1;
      const action =
        index === 0
          ? entry.kind === 'block'
            ? 'blocked'
            : 'created'
          : final && entry.status === 'cancelled'
            ? entry.kind === 'block'
              ? 'unblocked'
              : 'cancelled'
            : 'rescheduled';
      if (
        audit.entry_version !== index + 1 ||
        audit.action !== action ||
        (index === 0 && final && entry.status !== 'confirmed')
      )
        fail();
    }
  }
  const outbox = new Map<string, BookingReceipt>();
  for (const event of table('agenda_outbox')) {
    if (
      !identifier(event.id) ||
      !identifier(event.entry_id) ||
      !integer(event.entry_version, 1, 2147483647) ||
      !integer(event.created_at, 0)
    )
      fail();
    const entry = entries.get(event.entry_id);
    const key = versionKey(event.entry_id, event.entry_version);
    const audit = audits.get(key);
    if (
      !entry ||
      entry.kind === 'block' ||
      !audit ||
      outbox.has(key) ||
      event.recipient !== entry.customer_email ||
      event.created_at !== audit.created_at
    )
      fail();
    const receipt = receiptSnapshot(parseJson(event.payload_json), entry);
    const expectedEvent =
      audit.action === 'created'
        ? 'booking.confirmed'
        : audit.action === 'cancelled'
          ? 'booking.cancelled'
          : 'booking.rescheduled';
    if (
      event.event_type !== expectedEvent ||
      receipt.booking.version !== event.entry_version ||
      receipt.booking.status !== (audit.action === 'cancelled' ? 'cancelled' : 'confirmed')
    )
      fail();
    outbox.set(key, receipt);
  }
  const cached = new Set<string>();
  for (const row of table('agenda_idempotency')) {
    if (
      typeof row.scope !== 'string' ||
      typeof row.key !== 'string' ||
      !/^[a-zA-Z0-9._:-]{8,128}$/.test(row.key) ||
      typeof row.request_hash !== 'string' ||
      !digestPattern.test(row.request_hash) ||
      !integer(row.created_at, 0)
    )
      fail();
    const response = parseJson(row.response_json);
    if (!record(response)) fail();
    const raw = record(response.booking) ? response.booking : response;
    if (!identifier(raw.id)) fail();
    const entry = entries.get(raw.id);
    if (!entry) fail();
    const snapshot =
      entry.kind === 'block' ? blockSnapshot(response, entry) : receiptSnapshot(response, entry);
    const version =
      entry.kind === 'block'
        ? (snapshot as ScheduleBlock).version
        : (snapshot as BookingReceipt).booking.version;
    const key = versionKey(raw.id, version);
    const audit = audits.get(key);
    if (!audit || cached.has(key) || row.scope !== expectedScope(audit, entry)) fail();
    if (
      entry.kind !== 'block' &&
      canonicalStringify(snapshot) !== canonicalStringify(outbox.get(key))
    )
      fail();
    if (
      entry.kind === 'block' &&
      (snapshot as ScheduleBlock).status !== (audit.action === 'unblocked' ? 'cancelled' : 'active')
    )
      fail();
    cached.add(key);
  }
  for (const [id, entry] of entries) {
    for (const audit of histories.get(id) ?? []) {
      const key = versionKey(id, Number(audit.entry_version));
      if (!cached.has(key) || (entry.kind !== 'block' && !outbox.has(key))) fail();
    }
  }
}

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
  const backup = structuredClone(value) as unknown as AgendaBackup;
  validateEventSnapshots(backup);
  return backup;
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
