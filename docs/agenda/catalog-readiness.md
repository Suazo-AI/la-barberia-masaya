# Private catalog candidate · 2026-10-06

The user has confirmed the price and duration portion of the service catalog. A private, inactive configuration candidate preserves those values and their source references outside tracked source and public assets. The beard estimate and the conservative scheduled duration are recorded separately. No appointment, policy, shift, identity, access grant or production setting is created by this increment.

The current live review page has no published numeric service catalog and still reports that the agenda needs configuration. Historical demo values were explicitly fictional. The later direct confirmation from the user is the basis for the candidate; this work does not claim to have found an independently current price list on the live page.

## Candidate boundary

- The candidate keeps `mode: "unconfigured"`, `verified: false` and no `verifiedAt`
- Unknown preparation/cleanup buffers and booking policies are `null`; service eligibility lists are empty. The confirmed three-person count now has explicitly provisional, user-authorized invented display names and neutral stable profile IDs. Individual shifts remain `null`, with no account/photograph mappings. Template and fixture defaults are not approved business facts
- Service duration and start-time spacing are separate inputs. Confirmed durations do not establish the allowed slot step
- The current validator deliberately rejects this partial candidate, even if someone changes only its mode and verification flag. A complete verified configuration and separately approved host identity are still necessary
- Candidate and provenance files stay in the existing ignored private configuration directory. They are never imported into application source or copied into the Worker/static build
- The historical fixtures remain unchanged and explicitly fictional. Private confirmed data is not used as a new production fallback

## Still needed before activation

1. Confirm per-service preparation/cleanup buffers and any detailed service inclusions before adding new descriptions
2. Review the three provisional display names for the intended launch, confirm service eligibility and explicit seven-day individual shifts, and verify real identity/attribution before any account or optional photo mapping. Shop opening hours alone do not establish individual working shifts
3. Confirm slot spacing, minimum notice, maximum booking horizon, cancellation/rescheduling cutoff, and how to resolve appointments affected by absence
4. Verify the real owner's stable same-Site identity and obtain explicit role approval; independently approve exact barber identity mappings
5. Complete retention, lost-link recovery/revocation, abuse controls, private backup destination and recovery ownership
6. Complete the existing hosted identity/D1/recovery checks, final configuration version/date/origin review, human acceptance and explicit release authorization

Sending email can remain disabled. The separate open-source license choice is not resolved by catalog confirmation.

## Regression coverage

`agenda/tests/catalog-duration.test.ts` uses isolated synthetic names, prices, staff, shifts, buffers and policies. It checks independent 30-, 15- and 45-minute durations through catalog output, slot endpoints, closing boundaries, integer NIO receipt snapshots, overlap rejection and adjacent bookings. Private reschedule availability and mutations preserve each original price/duration snapshot after a simulated configuration migration, while new public availability uses the new catalog. Caller mutation of a returned catalog cannot change the domain's configured values.

The partial-candidate case proves that confirmed catalog fields alone cannot initialize configuration or bookings. The packaged Worker test rejects private candidate/provenance paths. No UI or runtime code is changed, and no new browser evidence is claimed by this increment.

Run the focused regression with `node --test agenda/tests/catalog-duration.test.ts`; run the existing aggregate checks before any release. The actual private candidate is checked separately against the user-confirmed values, ignored-file boundary and unchanged fail-closed validator. Synthetic test coverage is not evidence of real hosted activation, identity, D1 recovery or owner approval.

The [operator setup runbook](setup-runbook.md) supplies a read-only command that reports missing field paths without exposing candidate values or importing fixture defaults. It is now the executable starting point for finishing this setup; a successful structural check still cannot authorize activation.
