-- SQLite/D1 migration. Runtime adapters must execute mutation batches atomically.
-- All calendar allocations share this table and these half-open interval guards.
CREATE TABLE agenda_configuration (
  business_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  config_hash TEXT NOT NULL CHECK (length(config_hash) = 64),
  config_json TEXT NOT NULL CHECK (json_valid(config_json))
);

CREATE TABLE agenda_entries (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('booking', 'walk-in', 'block')),
  professional_id TEXT NOT NULL,
  professional_name TEXT NOT NULL,
  service_id TEXT,
  service_name TEXT,
  start_utc INTEGER NOT NULL CHECK (typeof(start_utc) = 'integer'),
  end_utc INTEGER NOT NULL CHECK (typeof(end_utc) = 'integer' AND end_utc > start_utc),
  allocated_start_utc INTEGER NOT NULL CHECK (typeof(allocated_start_utc) = 'integer' AND allocated_start_utc <= start_utc),
  allocated_end_utc INTEGER NOT NULL CHECK (typeof(allocated_end_utc) = 'integer' AND allocated_end_utc >= end_utc),
  duration_minutes INTEGER,
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (typeof(buffer_before_minutes) = 'integer' AND buffer_before_minutes >= 0),
  buffer_after_minutes INTEGER NOT NULL DEFAULT 0 CHECK (typeof(buffer_after_minutes) = 'integer' AND buffer_after_minutes >= 0),
  price_minor_units INTEGER,
  currency TEXT NOT NULL DEFAULT 'NIO' CHECK (currency = 'NIO'),
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  customer_display_name TEXT,
  customer_email TEXT,
  management_hash TEXT CHECK (management_hash IS NULL OR length(management_hash) = 64),
  block_label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (allocated_start_utc = start_utc - buffer_before_minutes * 60 AND allocated_end_utc = end_utc + buffer_after_minutes * 60),
  CHECK (
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
  )
);

CREATE INDEX agenda_entries_professional_time
  ON agenda_entries(professional_id, allocated_start_utc, allocated_end_utc) WHERE status = 'confirmed';
CREATE INDEX agenda_entries_time ON agenda_entries(start_utc, id);

CREATE TRIGGER agenda_entries_no_overlap_insert
BEFORE INSERT ON agenda_entries
WHEN NEW.status = 'confirmed' AND EXISTS (
  SELECT 1 FROM agenda_entries
  WHERE status = 'confirmed' AND professional_id = NEW.professional_id
    AND allocated_start_utc < NEW.allocated_end_utc AND allocated_end_utc > NEW.allocated_start_utc
)
BEGIN
  SELECT RAISE(ABORT, 'AGENDA_SLOT_CONFLICT');
END;

CREATE TRIGGER agenda_entries_no_overlap_update
BEFORE UPDATE OF professional_id, allocated_start_utc, allocated_end_utc, status ON agenda_entries
WHEN NEW.status = 'confirmed' AND EXISTS (
  SELECT 1 FROM agenda_entries
  WHERE status = 'confirmed' AND professional_id = NEW.professional_id
    AND id != OLD.id AND allocated_start_utc < NEW.allocated_end_utc AND allocated_end_utc > NEW.allocated_start_utc
)
BEGIN
  SELECT RAISE(ABORT, 'AGENDA_SLOT_CONFLICT');
END;

-- Place this assertion immediately after every optimistic conditional UPDATE.
-- A zero-row UPDATE is otherwise a successful SQL statement, including in D1.
CREATE TABLE agenda_write_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  affected INTEGER NOT NULL CONSTRAINT agenda_one_change CHECK (affected = 1)
);

CREATE TABLE agenda_configuration_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  valid INTEGER NOT NULL CONSTRAINT agenda_active_configuration CHECK (valid = 1)
);

CREATE TABLE agenda_idempotency (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE agenda_audit (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES agenda_entries(id),
  action TEXT NOT NULL CHECK (action IN ('created', 'cancelled', 'rescheduled', 'blocked', 'unblocked')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('public', 'admin', 'customer')),
  actor_id TEXT,
  entry_version INTEGER NOT NULL CHECK (entry_version >= 1),
  created_at INTEGER NOT NULL
);
CREATE INDEX agenda_audit_entry ON agenda_audit(entry_id, created_at, id);

-- Disabled is intentional. A delivery adapter/provider/runner must be approved
-- before transport is activated. There is no raw management token in this table.
CREATE TABLE agenda_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES agenda_entries(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('booking.confirmed', 'booking.cancelled', 'booking.rescheduled')),
  entry_version INTEGER NOT NULL CHECK (entry_version >= 1),
  recipient TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  next_attempt_at INTEGER,
  lease_until INTEGER,
  lease_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  UNIQUE (entry_id, event_type, entry_version)
);
CREATE INDEX agenda_outbox_delivery ON agenda_outbox(status, next_attempt_at);
CREATE UNIQUE INDEX agenda_outbox_lease ON agenda_outbox(lease_id) WHERE lease_id IS NOT NULL;

CREATE TABLE agenda_rate_limits (
  scope TEXT NOT NULL,
  bucket INTEGER NOT NULL CHECK (typeof(bucket) = 'integer'),
  count INTEGER NOT NULL CHECK (typeof(count) = 'integer' AND count > 0),
  PRIMARY KEY (scope, bucket)
);

PRAGMA user_version = 1;
