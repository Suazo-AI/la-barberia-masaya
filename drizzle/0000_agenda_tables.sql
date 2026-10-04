CREATE TABLE `agenda_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_id` text,
	`entry_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `agenda_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agenda_audit_action" CHECK(action IN ('created', 'cancelled', 'rescheduled', 'blocked', 'unblocked')),
	CONSTRAINT "agenda_audit_actor" CHECK(actor_kind IN ('public', 'admin', 'customer')),
	CONSTRAINT "agenda_audit_entry_version" CHECK(entry_version >= 1)
);
--> statement-breakpoint
CREATE INDEX `agenda_audit_entry` ON `agenda_audit` (`entry_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `agenda_configuration` (
	`business_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`config_hash` text NOT NULL,
	`config_json` text NOT NULL,
	CONSTRAINT "agenda_configuration_version" CHECK(typeof(version) = 'integer' AND version >= 1),
	CONSTRAINT "agenda_configuration_hash" CHECK(length(config_hash) = 64),
	CONSTRAINT "agenda_configuration_json" CHECK(json_valid(config_json))
);
--> statement-breakpoint
CREATE TABLE `agenda_configuration_guard` (
	`id` integer PRIMARY KEY,
	`valid` integer NOT NULL,
	CONSTRAINT "agenda_configuration_guard_id" CHECK(id = 1),
	CONSTRAINT "agenda_active_configuration" CHECK(valid = 1)
);
--> statement-breakpoint
CREATE TABLE `agenda_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`professional_id` text NOT NULL,
	`professional_name` text NOT NULL,
	`service_id` text,
	`service_name` text,
	`start_utc` integer NOT NULL,
	`end_utc` integer NOT NULL,
	`allocated_start_utc` integer NOT NULL,
	`allocated_end_utc` integer NOT NULL,
	`duration_minutes` integer,
	`buffer_before_minutes` integer DEFAULT 0 NOT NULL,
	`buffer_after_minutes` integer DEFAULT 0 NOT NULL,
	`price_minor_units` integer,
	`currency` text DEFAULT 'NIO' NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`customer_display_name` text,
	`customer_email` text,
	`management_hash` text,
	`block_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "agenda_entries_kind" CHECK(kind IN ('booking', 'walk-in', 'block')),
	CONSTRAINT "agenda_entries_start" CHECK(typeof(start_utc) = 'integer'),
	CONSTRAINT "agenda_entries_end" CHECK(typeof(end_utc) = 'integer' AND end_utc > start_utc),
	CONSTRAINT "agenda_entries_allocated_start" CHECK(typeof(allocated_start_utc) = 'integer' AND allocated_start_utc <= start_utc),
	CONSTRAINT "agenda_entries_allocated_end" CHECK(typeof(allocated_end_utc) = 'integer' AND allocated_end_utc >= end_utc),
	CONSTRAINT "agenda_entries_buffer_before" CHECK(typeof(buffer_before_minutes) = 'integer' AND buffer_before_minutes >= 0),
	CONSTRAINT "agenda_entries_buffer_after" CHECK(typeof(buffer_after_minutes) = 'integer' AND buffer_after_minutes >= 0),
	CONSTRAINT "agenda_entries_currency" CHECK(currency = 'NIO'),
	CONSTRAINT "agenda_entries_status" CHECK(status IN ('confirmed', 'cancelled')),
	CONSTRAINT "agenda_entries_version" CHECK(typeof(version) = 'integer' AND version >= 1),
	CONSTRAINT "agenda_entries_management_hash" CHECK(management_hash IS NULL OR length(management_hash) = 64),
	CONSTRAINT "agenda_entries_allocated_interval" CHECK(allocated_start_utc = start_utc - buffer_before_minutes * 60 AND allocated_end_utc = end_utc + buffer_after_minutes * 60),
	CONSTRAINT "agenda_entries_kind_fields" CHECK(
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
--> statement-breakpoint
CREATE INDEX `agenda_entries_professional_time` ON `agenda_entries` (`professional_id`,`allocated_start_utc`,`allocated_end_utc`) WHERE status = 'confirmed';--> statement-breakpoint
CREATE INDEX `agenda_entries_time` ON `agenda_entries` (`start_utc`,`id`);--> statement-breakpoint
CREATE TABLE `agenda_idempotency` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`),
	CONSTRAINT "agenda_idempotency_response" CHECK(json_valid(response_json))
);
--> statement-breakpoint
CREATE TABLE `agenda_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`event_type` text NOT NULL,
	`entry_version` integer NOT NULL,
	`recipient` text,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`lease_until` integer,
	`lease_id` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`entry_id`) REFERENCES `agenda_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agenda_outbox_event" CHECK(event_type IN ('booking.confirmed', 'booking.cancelled', 'booking.rescheduled')),
	CONSTRAINT "agenda_outbox_entry_version" CHECK(entry_version >= 1),
	CONSTRAINT "agenda_outbox_payload" CHECK(json_valid(payload_json)),
	CONSTRAINT "agenda_outbox_status" CHECK(status IN ('disabled', 'pending', 'processing', 'sent', 'failed')),
	CONSTRAINT "agenda_outbox_attempts" CHECK(attempts >= 0 AND attempts <= 5)
);
--> statement-breakpoint
CREATE INDEX `agenda_outbox_delivery` ON `agenda_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_outbox_lease` ON `agenda_outbox` (`lease_id`) WHERE lease_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_outbox_entry_event_version` ON `agenda_outbox` (`entry_id`,`event_type`,`entry_version`);--> statement-breakpoint
CREATE TABLE `agenda_rate_limits` (
	`scope` text NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`scope`, `bucket`),
	CONSTRAINT "agenda_rate_limits_bucket" CHECK(typeof(bucket) = 'integer'),
	CONSTRAINT "agenda_rate_limits_count" CHECK(typeof(count) = 'integer' AND count > 0)
);
--> statement-breakpoint
CREATE TABLE `agenda_write_guard` (
	`id` integer PRIMARY KEY,
	`affected` integer NOT NULL,
	CONSTRAINT "agenda_write_guard_id" CHECK(id = 1),
	CONSTRAINT "agenda_one_change" CHECK(affected = 1)
);
