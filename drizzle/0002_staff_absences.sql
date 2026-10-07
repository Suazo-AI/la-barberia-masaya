CREATE TABLE `agenda_absence_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`absence_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`professional_id` text,
	`absence_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`absence_id`) REFERENCES `agenda_absences`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agenda_absence_audit_action" CHECK(action IN ('reported', 'revoked')),
	CONSTRAINT "agenda_absence_audit_actor" CHECK(actor_kind IN ('admin', 'barber')),
	CONSTRAINT "agenda_absence_audit_actor_id" CHECK(length(actor_id) > 0 AND length(actor_id) <= 256),
	CONSTRAINT "agenda_absence_audit_professional" CHECK((actor_kind = 'admin' AND professional_id IS NULL) OR (actor_kind = 'barber' AND professional_id IS NOT NULL)),
	CONSTRAINT "agenda_absence_audit_version" CHECK(typeof(absence_version) = 'integer' AND ((action = 'reported' AND absence_version = 1) OR (action = 'revoked' AND absence_version = 2))),
	CONSTRAINT "agenda_absence_audit_created_at" CHECK(typeof(created_at) = 'integer' AND created_at >= 0)
);
--> statement-breakpoint
CREATE INDEX `agenda_absence_audit_absence` ON `agenda_absence_audit` (`absence_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_absence_audit_absence_version` ON `agenda_absence_audit` (`absence_id`,`absence_version`);--> statement-breakpoint
CREATE TABLE `agenda_absences` (
	`id` text PRIMARY KEY NOT NULL,
	`professional_id` text NOT NULL,
	`start_utc` integer NOT NULL,
	`end_utc` integer NOT NULL,
	`reason` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`affected_booking_ids_json` text NOT NULL,
	`resolution` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "agenda_absences_start" CHECK(typeof(start_utc) = 'integer'),
	CONSTRAINT "agenda_absences_end" CHECK(typeof(end_utc) = 'integer' AND end_utc > start_utc),
	CONSTRAINT "agenda_absences_reason" CHECK(reason IS NULL OR (length(trim(reason)) > 0 AND length(reason) <= 120)),
	CONSTRAINT "agenda_absences_status" CHECK(status IN ('active', 'revoked')),
	CONSTRAINT "agenda_absences_version" CHECK(typeof(version) = 'integer' AND ((status = 'active' AND version = 1) OR (status = 'revoked' AND version = 2))),
	CONSTRAINT "agenda_absences_snapshot" CHECK(json_valid(affected_booking_ids_json) AND json_type(affected_booking_ids_json) = 'array'),
	CONSTRAINT "agenda_absences_resolution" CHECK((resolution = 'none' AND json_array_length(affected_booking_ids_json) = 0) OR (resolution = 'requires-resolution' AND json_array_length(affected_booking_ids_json) > 0)),
	CONSTRAINT "agenda_absences_created_at" CHECK(typeof(created_at) = 'integer' AND created_at >= 0),
	CONSTRAINT "agenda_absences_updated_at" CHECK(typeof(updated_at) = 'integer' AND updated_at >= created_at)
);
--> statement-breakpoint
CREATE INDEX `agenda_absences_professional_time` ON `agenda_absences` (`professional_id`,`start_utc`,`end_utc`) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX `agenda_absences_time` ON `agenda_absences` (`start_utc`,`id`);