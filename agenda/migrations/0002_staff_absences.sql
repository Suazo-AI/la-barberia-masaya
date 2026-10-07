-- Additive temporary absences. Existing allocations are preserved for explicit
-- owner resolution; absences are a separate union of unavailable intervals.
CREATE TABLE agenda_absences (
  id TEXT PRIMARY KEY NOT NULL,
  professional_id TEXT NOT NULL,
  start_utc INTEGER NOT NULL CHECK (typeof(start_utc) = 'integer'),
  end_utc INTEGER NOT NULL CHECK (typeof(end_utc) = 'integer' AND end_utc > start_utc),
  reason TEXT CHECK (reason IS NULL OR (length(trim(reason)) > 0 AND length(reason) <= 120)),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND ((status = 'active' AND version = 1) OR (status = 'revoked' AND version = 2))),
  affected_booking_ids_json TEXT NOT NULL CHECK (json_valid(affected_booking_ids_json) AND json_type(affected_booking_ids_json) = 'array'),
  resolution TEXT NOT NULL CHECK ((resolution = 'none' AND json_array_length(affected_booking_ids_json) = 0) OR (resolution = 'requires-resolution' AND json_array_length(affected_booking_ids_json) > 0)),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer' AND updated_at >= created_at)
);
CREATE INDEX agenda_absences_professional_time
  ON agenda_absences(professional_id, start_utc, end_utc) WHERE status = 'active';
CREATE INDEX agenda_absences_time ON agenda_absences(start_utc, id);

CREATE TABLE agenda_absence_audit (
  id TEXT PRIMARY KEY NOT NULL,
  absence_id TEXT NOT NULL REFERENCES agenda_absences(id),
  action TEXT NOT NULL CHECK (action IN ('reported', 'revoked')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('admin', 'barber')),
  actor_id TEXT NOT NULL CHECK (length(actor_id) > 0 AND length(actor_id) <= 256),
  professional_id TEXT CHECK ((actor_kind = 'admin' AND professional_id IS NULL) OR (actor_kind = 'barber' AND professional_id IS NOT NULL)),
  absence_version INTEGER NOT NULL CHECK (typeof(absence_version) = 'integer' AND ((action = 'reported' AND absence_version = 1) OR (action = 'revoked' AND absence_version = 2))),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  UNIQUE (absence_id, absence_version)
);
CREATE INDEX agenda_absence_audit_absence ON agenda_absence_audit(absence_id, created_at, id);

-- Every new booking/walk-in is checked against the complete active absence
-- union, including its service buffers. Owner blocks are intentionally separate.
CREATE TRIGGER agenda_entries_no_absence_insert
BEFORE INSERT ON agenda_entries
WHEN NEW.status = 'confirmed' AND NEW.kind IN ('booking', 'walk-in') AND EXISTS (
  SELECT 1 FROM agenda_absences
  WHERE status = 'active' AND professional_id = NEW.professional_id
    AND start_utc < NEW.allocated_end_utc AND end_utc > NEW.allocated_start_utc
)
BEGIN
  SELECT RAISE(ABORT, 'AGENDA_SLOT_CONFLICT');
END;

CREATE TRIGGER agenda_entries_no_absence_update
BEFORE UPDATE OF kind, professional_id, allocated_start_utc, allocated_end_utc, status ON agenda_entries
WHEN NEW.status = 'confirmed' AND NEW.kind IN ('booking', 'walk-in') AND EXISTS (
  SELECT 1 FROM agenda_absences
  WHERE status = 'active' AND professional_id = NEW.professional_id
    AND start_utc < NEW.allocated_end_utc AND end_utc > NEW.allocated_start_utc
)
BEGIN
  SELECT RAISE(ABORT, 'AGENDA_SLOT_CONFLICT');
END;

-- Preserve the historical conflict snapshot even after bookings move/cancel.
CREATE TRIGGER agenda_absences_immutable_snapshot
BEFORE UPDATE ON agenda_absences
WHEN NEW.id IS NOT OLD.id OR NEW.professional_id IS NOT OLD.professional_id
  OR NEW.start_utc IS NOT OLD.start_utc OR NEW.end_utc IS NOT OLD.end_utc
  OR NEW.reason IS NOT OLD.reason OR NEW.affected_booking_ids_json IS NOT OLD.affected_booking_ids_json
  OR NEW.resolution IS NOT OLD.resolution OR NEW.created_at IS NOT OLD.created_at
  OR OLD.status != 'active' OR NEW.status != 'revoked' OR NEW.version != OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'AGENDA_ABSENCE_IMMUTABLE');
END;

CREATE TRIGGER agenda_absences_snapshot_shape
BEFORE INSERT ON agenda_absences
WHEN json_valid(NEW.affected_booking_ids_json) AND (
  EXISTS (SELECT 1 FROM json_each(NEW.affected_booking_ids_json) WHERE type != 'text' OR length(value) = 0)
  OR (SELECT count(*) FROM json_each(NEW.affected_booking_ids_json)) !=
     (SELECT count(DISTINCT value) FROM json_each(NEW.affected_booking_ids_json))
)
BEGIN
  SELECT RAISE(ABORT, 'AGENDA_ABSENCE_SNAPSHOT_INVALID');
END;

PRAGMA user_version = 2;
