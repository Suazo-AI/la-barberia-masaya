-- Append-only guards matching portable 0002; do not split trigger bodies.
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
PRAGMA optimize;
