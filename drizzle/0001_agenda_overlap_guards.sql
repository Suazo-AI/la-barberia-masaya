-- Custom Drizzle migration: preserve each complete trigger as one statement.
-- Never split this migration on semicolons inside BEGIN/END.
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
--> statement-breakpoint
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
--> statement-breakpoint
PRAGMA optimize;
