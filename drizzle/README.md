# Sites D1 migration source

`db/schema.ts` models the same ten agenda tables, constraints, keys and indexes
as the portable canonical schema at `agenda/migrations/*.sql`.
`drizzle.config.ts` generates the Sites migration tree at this directory.

The initial files were generated with pinned `drizzle-kit` 0.31.11:

```sh
npx --no-install drizzle-kit generate --name=agenda_tables
npx --no-install drizzle-kit generate --custom --name=agenda_overlap_guards
```

The second command creates a genuine custom-migration journal entry and snapshot.
Its SQL contains the canonical insert/update overlap triggers verbatim, followed
by `PRAGMA optimize`. Every `CREATE TRIGGER ... BEGIN ... END;` stays **one SQL
statement**. Only `--> statement-breakpoint` separates statements; semicolons
inside trigger bodies are not migration boundaries.

The build copies this complete tree to `dist/.openai/drizzle`. Sites owns applying
and recording these migrations before uploading the Worker. Runtime requests do
not create or alter tables. No seed data, fixture configuration or customer data
belongs in this tree.

The portable adapter's local migration ledger and `PRAGMA user_version` are not
copied into D1. Sites has its own ledger, and the documented
[D1-compatible PRAGMA list](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
includes `optimize` but does not document `user_version`. Agenda exports use the
portable `SCHEMA_VERSION` constant independently; the ten application tables
and their invariants remain equivalent. D1 enforces foreign keys; no migration
disables them. Drizzle represents the outbox's compound UNIQUE constraint as an
equivalent named unique index.

After any applied deployment, existing SQL, matching snapshots and journal
entries are immutable. Append generated migrations for table changes and custom
migrations for trigger changes. Inspect table-rebuild migrations particularly
carefully: SQLite drops a table's triggers during a rebuild, so both overlap
guards must be restored before that new migration is complete. Preserve the
breakpoint-separated trigger bodies throughout packaging. A failed publication
can already have applied some migrations; establish the applied boundary before
correcting only a specifically failed unapplied migration.

`node --test agenda/tests/sites-migrations.test.ts` verifies the journal/snapshots,
statement boundaries, structural and behavioral parity against portable SQLite,
and core booking workflows using the Sites SQL. These are local SQLite checks,
not a claim of having provisioned or exercised a live D1 database.


Temporary absences append generated `0002_staff_absences.sql` and custom
`0003_staff_absence_guards.sql`. They preserve the original migrations and add
an immutable conflict snapshot, a separate staff/admin audit trail and guards
against new booking/walk-in allocations in active absences (including buffers).
Existing bookings and owner blocks remain untouched. Overlapping absences form
a union; revoking one does not disable any other absence. Private exports use
version 2; offline restore also upconverts version 1 with empty absence tables.
