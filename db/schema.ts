import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// The portable schema in agenda/migrations/0001_agenda.sql is the behavioral
// reference. Drizzle owns Sites schema deployment; runtime code never migrates.
// SQLite trigger bodies live in the append-only custom migration because
// drizzle-kit snapshots do not model triggers.
export const agendaConfiguration = sqliteTable(
  'agenda_configuration',
  {
    businessId: text('business_id').primaryKey().notNull(),
    version: integer('version').notNull(),
    configHash: text('config_hash').notNull(),
    configJson: text('config_json').notNull(),
  },
  () => [
    check('agenda_configuration_version', sql`typeof(version) = 'integer' AND version >= 1`),
    check('agenda_configuration_hash', sql`length(config_hash) = 64`),
    check('agenda_configuration_json', sql`json_valid(config_json)`),
  ],
);

export const agendaEntries = sqliteTable(
  'agenda_entries',
  {
    id: text('id').primaryKey().notNull(),
    kind: text('kind').notNull(),
    professionalId: text('professional_id').notNull(),
    professionalName: text('professional_name').notNull(),
    serviceId: text('service_id'),
    serviceName: text('service_name'),
    startUtc: integer('start_utc').notNull(),
    endUtc: integer('end_utc').notNull(),
    allocatedStartUtc: integer('allocated_start_utc').notNull(),
    allocatedEndUtc: integer('allocated_end_utc').notNull(),
    durationMinutes: integer('duration_minutes'),
    bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
    bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
    priceMinorUnits: integer('price_minor_units'),
    currency: text('currency').notNull().default('NIO'),
    status: text('status').notNull(),
    version: integer('version').notNull(),
    customerDisplayName: text('customer_display_name'),
    customerEmail: text('customer_email'),
    managementHash: text('management_hash'),
    blockLabel: text('block_label'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('agenda_entries_professional_time')
      .on(table.professionalId, table.allocatedStartUtc, table.allocatedEndUtc)
      .where(sql`status = 'confirmed'`),
    index('agenda_entries_time').on(table.startUtc, table.id),
    check('agenda_entries_kind', sql`kind IN ('booking', 'walk-in', 'block')`),
    check('agenda_entries_start', sql`typeof(start_utc) = 'integer'`),
    check('agenda_entries_end', sql`typeof(end_utc) = 'integer' AND end_utc > start_utc`),
    check(
      'agenda_entries_allocated_start',
      sql`typeof(allocated_start_utc) = 'integer' AND allocated_start_utc <= start_utc`,
    ),
    check(
      'agenda_entries_allocated_end',
      sql`typeof(allocated_end_utc) = 'integer' AND allocated_end_utc >= end_utc`,
    ),
    check(
      'agenda_entries_buffer_before',
      sql`typeof(buffer_before_minutes) = 'integer' AND buffer_before_minutes >= 0`,
    ),
    check(
      'agenda_entries_buffer_after',
      sql`typeof(buffer_after_minutes) = 'integer' AND buffer_after_minutes >= 0`,
    ),
    check('agenda_entries_currency', sql`currency = 'NIO'`),
    check('agenda_entries_status', sql`status IN ('confirmed', 'cancelled')`),
    check('agenda_entries_version', sql`typeof(version) = 'integer' AND version >= 1`),
    check(
      'agenda_entries_management_hash',
      sql`management_hash IS NULL OR length(management_hash) = 64`,
    ),
    check(
      'agenda_entries_allocated_interval',
      sql`allocated_start_utc = start_utc - buffer_before_minutes * 60 AND allocated_end_utc = end_utc + buffer_after_minutes * 60`,
    ),
    check(
      'agenda_entries_kind_fields',
      sql`
    (kind = 'block' AND service_id IS NULL AND service_name IS NULL
      AND duration_minutes IS NULL AND price_minor_units IS NULL
      AND customer_display_name IS NULL AND customer_email IS NULL
      AND management_hash IS NULL AND buffer_before_minutes = 0 AND buffer_after_minutes = 0 AND block_label IS NOT NULL)
    OR
    (kind IN ('booking', 'walk-in') AND service_id IS NOT NULL AND service_name IS NOT NULL
      AND typeof(duration_minutes) = 'integer' AND duration_minutes > 0
      AND end_utc - start_utc = duration_minutes * 60
      AND typeof(price_minor_units) = 'integer' AND price_minor_units >= 0
      AND block_label IS NULL)
  `,
    ),
  ],
);

export const agendaWriteGuard = sqliteTable(
  'agenda_write_guard',
  {
    id: integer('id'),
    affected: integer('affected').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    check('agenda_write_guard_id', sql`id = 1`),
    check('agenda_one_change', sql`affected = 1`),
  ],
);

export const agendaConfigurationGuard = sqliteTable(
  'agenda_configuration_guard',
  {
    id: integer('id'),
    valid: integer('valid').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    check('agenda_configuration_guard_id', sql`id = 1`),
    check('agenda_active_configuration', sql`valid = 1`),
  ],
);

export const agendaIdempotency = sqliteTable(
  'agenda_idempotency',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseJson: text('response_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.key] }),
    check('agenda_idempotency_response', sql`json_valid(response_json)`),
  ],
);

export const agendaAudit = sqliteTable(
  'agenda_audit',
  {
    id: text('id').primaryKey().notNull(),
    entryId: text('entry_id')
      .notNull()
      .references(() => agendaEntries.id),
    action: text('action').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    entryVersion: integer('entry_version').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('agenda_audit_entry').on(table.entryId, table.createdAt, table.id),
    check(
      'agenda_audit_action',
      sql`action IN ('created', 'cancelled', 'rescheduled', 'blocked', 'unblocked')`,
    ),
    check('agenda_audit_actor', sql`actor_kind IN ('public', 'admin', 'customer')`),
    check('agenda_audit_entry_version', sql`entry_version >= 1`),
  ],
);

export const agendaOutbox = sqliteTable(
  'agenda_outbox',
  {
    id: text('id').primaryKey().notNull(),
    entryId: text('entry_id')
      .notNull()
      .references(() => agendaEntries.id),
    eventType: text('event_type').notNull(),
    entryVersion: integer('entry_version').notNull(),
    recipient: text('recipient'),
    payloadJson: text('payload_json').notNull(),
    status: text('status').notNull().default('disabled'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at'),
    leaseUntil: integer('lease_until'),
    leaseId: text('lease_id'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    sentAt: integer('sent_at'),
  },
  (table) => [
    unique('agenda_outbox_entry_event_version').on(
      table.entryId,
      table.eventType,
      table.entryVersion,
    ),
    index('agenda_outbox_delivery').on(table.status, table.nextAttemptAt),
    uniqueIndex('agenda_outbox_lease')
      .on(table.leaseId)
      .where(sql`lease_id IS NOT NULL`),
    check(
      'agenda_outbox_event',
      sql`event_type IN ('booking.confirmed', 'booking.cancelled', 'booking.rescheduled')`,
    ),
    check('agenda_outbox_entry_version', sql`entry_version >= 1`),
    check('agenda_outbox_payload', sql`json_valid(payload_json)`),
    check(
      'agenda_outbox_status',
      sql`status IN ('disabled', 'pending', 'processing', 'sent', 'failed')`,
    ),
    check('agenda_outbox_attempts', sql`attempts >= 0 AND attempts <= 5`),
  ],
);

export const agendaRateLimits = sqliteTable(
  'agenda_rate_limits',
  {
    scope: text('scope').notNull(),
    bucket: integer('bucket').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.bucket] }),
    check('agenda_rate_limits_bucket', sql`typeof(bucket) = 'integer'`),
    check('agenda_rate_limits_count', sql`typeof(count) = 'integer' AND count > 0`),
  ],
);
