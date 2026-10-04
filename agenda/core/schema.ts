/** Public adapter contract for consistent private backups; guards are ephemeral. */
export const BACKUP_TABLES = [
  'agenda_configuration',
  'agenda_entries',
  'agenda_idempotency',
  'agenda_audit',
  'agenda_outbox',
  'agenda_rate_limits',
] as const;
export const SCHEMA_VERSION = 1;
