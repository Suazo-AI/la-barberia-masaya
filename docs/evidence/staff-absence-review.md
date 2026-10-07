# Staff roles and temporary absence verification

Candidate based on `b3abca5b67ac2de7247c3f2d37801467c525473b`; source-only increment, 2026-10-04. See [requirements and rollout boundaries](../agenda/staff-absence-roles.md).

## Local checks actually run

Final non-browser pass completed 2026-10-04 04:04 UTC in the isolated candidate worktree on the cloud executor, Node `v24.19.0`:

| Check | Result |
| --- | --- |
| `npm run lint` | Exit 0: Prettier and HTML validation |
| `npm run typecheck:agenda` | Exit 0: agenda and Drizzle schema typechecks |
| `npm run test:agenda` | Exit 0: 126 tests passed, zero skipped |
| `npm test` | Exit 0: 16 static/model tests passed |
| `npm run test:sites` | Exit 0: Worker build and all 3 artifact tests passed |
| `npm run build && npm run check:budgets` | Exit 0: static build and unchanged budgets passed |
| `git diff --check` | Exit 0 |
| Initial applied SQL/snapshots vs base | No changes to portable 0001, Drizzle 0000/0001 or their snapshots |

The additive migration parity suite covers ten application tables and six complete triggers across portable SQL and Sites migration SQL. Absence races use independent SQLite connections/worker threads; they are not a claim of live D1 verification. Backups exercise preserved current and historical booking overlap, version-1 upgrade, version-2 restore, audit/idempotency integrity and a pre-lock timestamp interleaving. Validation establishes compatible historical booking overlap; wall-clock timestamps are not treated as a transaction-order ledger.

## Browser evidence route

Local Chromium launch was blocked by the execution sandbox. No local screenshots/video or local completed browser pass is claimed. The existing GitHub Actions workflow is extended to execute the exact candidate and retain its screenshots, videos and metadata.

- Baseline: real application source pinned to `b3abca5`, independently built and run with fictional fixtures at `http://127.0.0.1:4185/admin.html`
- Candidate: owner and barber fixture servers share a unique isolated test DB, separate from legacy agenda browser tests
- Before/after: 1440×900 and 390×844 screenshots; the baseline had one administrator interface and no separate barber role
- Flow evidence: report an overnight absence over a confirmed appointment, preserve that appointment, read historical conflict warning, revoke the absence without modifying the booking, keyboard dialog dismissal/focus restoration
- Failure coverage: lost committed response, identical-key retries, repeated clicks, unresolved reload guard, hidden owner-action handlers on barber views and unknown session roles
- Reflow/accessibility: axe, 320px/200% text, reduced motion, horizontal-overflow assertions
- Artifacts: `test-results` PNG/WebM plus `staff-roles-metadata.json`; metadata records source/baseline commit, URL, viewport, capture time and fixture mode

All 41 agenda browser tests register, including 9 new role/evidence tests. Test registration is not browser execution. Exact-head CI results and artifact links must be recorded in the draft PR after the authorized push. The repository's known Lighthouse/Chrome environment check is separate from functional/browser checks; do not label overall CI green unless every required check actually passes.

## Independent review and remaining gates

Read-only review runs independently of the implementers. Early review corrected two issues before publication: the UI export contract/filename now uses backup v2, and immutable affected-booking snapshots are labeled historical rather than claiming current conflicts. The final source commit must be reviewed after all edits.

This source does not activate a live barber login, grant the installer or owner access, migrate the hosted DB, deploy the Site, send customer notifications or resolve the pending existing-appointment policy. Human visual acceptance and the original business/identity/host/recovery activation gates remain outstanding.
