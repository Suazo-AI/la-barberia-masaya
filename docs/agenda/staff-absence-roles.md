# Owner and barber roles; temporary absence reporting

Source-only increment from `b3abca5b67ac2de7247c3f2d37801467c525473b`, authorized 2026-10-04. The shop owner and each barber use their own verified identity from a phone or desktop. The installer has no implicit account, role or operational authority. Nothing in this change grants an identity, applies a remote migration, sends a message or activates the live agenda.

## Authority

- The existing server-owned `adminSubjects` / `AGENDA_ADMIN_SUBJECTS_JSON` allowlist represents owners. The legacy domain actor name `admin` is retained for compatibility. Owners can read and manage all configured professionals, report/revoke any absence and export private backups
- Optional `barberSubjects` / `AGENDA_BARBER_SUBJECTS_JSON` is a server-only JSON object mapping exact verified stable subjects to configured professional IDs. The owner and barber sets must be disjoint. Unknown subjects, unknown professionals and malformed/ambiguous mappings fail closed. No names, email addresses, client headers/body fields or installer identity are accepted as role assignments
- A barber can read only their own agenda and report/revoke their own temporary absences. They cannot alter bookings, create owner blocks or walk-ins, see other professionals' private schedules or export the shop database
- The domain repeats scope enforcement. Listing and export require an actor; missing/public actors are rejected. HTTP capability flags shape the UI but never replace server checks
- The Sites resolver remains restricted to the documented dispatcher-owned stable user-ID contract. This change does not verify or expand production identity access; current production setup and business-verification gates remain

## Absences and existing appointments

An absence is temporary unavailability, not deletion/deactivation of an account. It has an explicit start/end in `America/Managua`, stored as UTC seconds. The optional 120-character operational note should omit medical or other sensitive details.

Start dates must be today or later; a report may begin earlier today. The end must be in the future, after the start and no later than the end of the configured booking horizon. Overnight and multiple-day reports are supported. The half-open interval `[start, end)` blocks new bookings/walk-ins and reschedules, including service preparation/cleanup buffers. It need not align to a slot grid or staff shift. Overlapping reports form a union; revoking one does not clear another.

Absences have a separate table instead of weakening the exclusive appointment/block allocation invariant. Existing appointments remain confirmed and unchanged. At report commit, a transaction snapshots the overlapping booking/walk-in IDs and sets `resolution: requires-resolution` when any are present. The owner sees this internal alert in the schedule. A booking committed first enters the snapshot; a later booking is rejected by database triggers. Advisory availability alone never authorizes a booking.

The existing-appointment resolution policy is still awaiting a user decision. There is no automatic cancellation, reassignment, customer message or email outbox event for absence reports. The snapshot is immutable history, not a live claim that every listed appointment is still unresolved. Revoking a report restores availability subject to all other bookings, blocks and absences; it does not change appointments or clear the historical owner-review flag. No “mark resolved” workflow is implied by this increment.

Creation and revocation are idempotent and audited with the actual staff actor. Changed retry payloads conflict. Revocation requires the current optimistic version. The existing UI uncertain-mutation and document-reload guards also cover absence actions.

## HTTP additions

All routes retain exact-origin, JSON, no-store and idempotency controls.

- `GET /api/agenda/v1/admin/session`: verified `role: owner | barber`, optional own `professionalId`, and `{manageShop, reportAbsence}` capabilities; no subject ID is returned
- `GET /api/agenda/v1/admin/schedule`: now returns `{bookings, blocks, absences}`. Barber queries are fixed to their own professional; an explicit different professional is forbidden. `includeCancelled=true` also includes revoked reports
- `POST /api/agenda/v1/admin/absences`: `{professionalId, startDate, startMinute, endDate, endMinute, reason?, configVersion}`; end-minute 1440 is normalized to next-day 00:00
- `POST /api/agenda/v1/admin/absences/:id/revoke`: `{expectedVersion, configVersion}`

A report response includes `id`, interval fields, optional reason, `status: active | revoked`, `version`, `affectedBookingIds`, `resolution: none | requires-resolution` and `timeZone: America/Managua`.

## Storage and rollout

Portable `0002_staff_absences.sql` and generated Sites migrations `0002_staff_absences.sql` / `0003_staff_absence_guards.sql` append two tables and four triggers. Previously applied migrations remain byte-for-byte unchanged. The initial application still has eight tables remotely; deploying this candidate would require a separately authorized, verified additive migration. No migration or deployment is performed here.

A code-only rollback to the pre-absence Worker would hide absence reports and omit them from its availability and backup contract, although the retained SQL triggers still reject overlapping new bookings. Legacy backups would lose this new history. Once reports exist, use a reviewed compatible rollback/recovery plan, preserving schema and reports; do not treat an old Worker or old-format export as a complete rollback. No automatic database rollback is provided.

Private backups are now version 2, including absence reports/audit. Offline restore supports version-1 backups by adding empty absence tables, and validates version-2 snapshots, scope/audit consistency and absence/booking relationships. Never put exports, customer data, real role mappings or subject IDs in the public repository or build assets.

For local fixture-only role testing use `AGENDA_MODE=fixture AGENDA_FIXTURE_ROLE=barber`; the server injects a clearly fictional identity mapped to professional `a`. Owner remains the default fixture. The flag is rejected outside fixture mode and cannot be selected by a request header.

## Verification boundaries

The test suite covers role isolation and escalation attempts, normal and overnight intervals, buffer/adjacency behavior, preserved existing appointments, idempotency/conflict/rollback, overlapping report revocation, separate-connection booking/absence races, backup compatibility and portable/Sites SQL parity.

Browser evidence must come from the real pinned pre-increment application and the exact candidate commit on mobile and desktop. There was no separate barber interface in the baseline. Local Chromium launch is blocked by this executor's sandbox; exact-commit GitHub Actions is the intended browser execution/evidence route. Prepared tests are not completed browser verification. Independent source review, browser verification, human visual acceptance, exact-head CI and authorized live activation remain separate gates.

[Verification record and evidence procedure](../evidence/staff-absence-review.md).
