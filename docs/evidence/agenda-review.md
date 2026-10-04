# Persistent agenda verification

Application source: `f321ab9c0db256fed92682ccad08ae15b552a628`. Before source: `181bc7e1f379d195aea0c06e6d56e2ac75d5886e`. [Requirements A-01 through A-12](../agenda/spec.md), [actual mobile/desktop evidence](agenda/README.md), [run/setup](../../agenda/README.md), [hosting gap](../agenda/hosting-handoff.md).

## Actual execution

2026-10-04, repository root on Windows: installed Node **24.18.0**, locked Playwright 1.63.0 and installed Chrome 154.0.8037.93. The repository and CI pin remains Node **24.19.0**; local results are not attributed to that pin.

`npm run check` on the exact application source returned **exit 0** after formatting/HTML validation, TypeScript, allowlist build, 16 static/historical-model tests, 67 agenda Node tests, budgets and both browser suites. Site browsers: **22 passed, 2 skipped**; agenda browsers: **23 passed, 0 skipped** (10 administrator, 13 public/management). Both reports have zero unexpected/flaky results and no top-level errors. The two local skips are optional historical pre-Obsidian comparisons when `UI_BASELINE_URL` is unset. They do not replace the real before/after collection for this increment.

The Node agenda checks cover actual eight-connection SQLite races, transaction rollback, Any-professional assignment, buffers and closing bounds, scoped capabilities, optimistic changes, configuration/version guards, persistent retries, Node HTTP, bounded origin/body/query/rate controls, disabled outbox leases/retries and private export/restore. Two D1 checks use a structural host double; they are not remote database tests. Backup tests include 28 corruptions and retain valid historical replies after changes. Browser tests include real committed writes whose response is deliberately lost, followed by injected errors, exact retries and verification through the actual API; the independent repro below also uses the SQL rate limiter itself.

Commands for final public/admin capture and strict export returned exit 0, using the pinned source and fresh loopback fixture runtime at port 4191. Original PNG/WebM files are copied without alteration. The [manifests](agenda/README.md) identify source, URL, clock, viewport, outcome, hashes and decode methods. No real customer data or notification is involved. Earlier failed capture-port attempts are excluded from the final collection.

Budget results: bootstrap 6,100/6,144 bytes; optional booking/client 36,184/36,864 bytes; optional gallery 14,329/20,480 bytes; modeled core gzip 394,045/409,600 bytes; modeled full-page gzip 527,815/563,200 bytes. The optional agenda budget was deliberately increased from 24 KiB to 36 KiB for the persistent API/retry/capability client; no runtime npm dependency was introduced. These are byte budgets, not Lighthouse scores.

Exact application-source [CI run 37170755609](https://github.com/Suazo-AI/la-barberia-masaya/actions/runs/37170755609) proceeded through `npm run check` and failed at the existing `npm run test:performance` gate. The log identifies `scripts/lighthouse.mjs:18`, rejecting `/opt/google/chrome/chrome` as not satisfying the required root-owned/non-writable official Chrome check. This is not a green CI or a Lighthouse performance pass. That environment blocker was not bypassed or debugged as part of this task.

## Independent technical review

A separate read-only reviewer examined the core, migrations, SQLite/D1 adapters, HTTP/Node/Worker, backup/outbox, all three clients, build and tests. It reproduced these concrete findings before they were fixed:

| Finding                                                  | Corrected behavior                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost-response retry after configuration migration        | An authorized exact replay returns its original committed response. A new write with the old catalog version still conflicts.                                                                             |
| Missing ownership metadata over private data             | Bootstrap is atomic and only initializes an empty calendar; it cannot reconstruct ownership over existing bookings/events.                                                                                |
| Adapter/domain deployment-mode mismatch                  | Missing or different `configurationMode` returns 503 before domain operations; production cannot serve a fixture domain and fixture admin cannot access production data.                                  |
| Changed admin payload after uncertain write              | One frozen operation retains its serialized body/key across close/reopen, authorization/config errors, 429 and malformed positive responses. Other mutations remain blocked until its result is verified. |
| Corrupt cached reply in a backup                         | Receipt/block identity, shape, version, scope, audit and outbox relationships are validated; `{}`, arrays, absent IDs and incompatible event payloads are rejected. Historical snapshots remain valid.    |
| Native time-input grid blocked 10:07 walk-in             | Walk-ins and blocks accept whole minutes; scheduled booking/move grid remains configured. The server still rejects a service ending after closing.                                                        |
| Deterministic retry rejection erased earlier uncertainty | Public creation and private changes retain prior uncertainty through all later retry errors, until a verified result is recovered.                                                                        |

On final source `f321ab9`, the reviewer independently used Chrome at 390px and a separate real SQLite/HTTP fixture with SQL limits of one request per bucket for public/admin and two for customer management, including its initial lookup. An Any booking committed 201, lost its response, received a real 429 on the identical retry, survived Escape/reopen and later returned its original 201 with the same key/body/token: one booking. Private cancellation similarly recovered its original 200, leaving version 2. An administrator 10:07 walk-in retained its operation through lost 201, real 429 and schedule refresh through Actualizar, rejected altered fields and recovered one entry at minute 607. No capability in query/request URLs, cookies or browser storage was observed.

The reviewer repeated the backend fixes on `070c620` and verified that all backend paths are unchanged in `f321ab9`. It inspected the final reports and selected actual mobile/desktop states, independently verified all 56 declared artifacts' hashes/bytes/dimensions and checked all six videos against their raw recordings with Chrome midpoint decode. No further functional blocker was observed in the reviewed source and captured fixture flows. Public copy/delta review is recorded with the delivery after the evidence commit; no new application source is part of that evidence commit.

## Remaining boundaries

The backend is not deployed. The build still emits static assets, and the existing Site requires a supported Worker that serves those assets, entrypoint/manifest wiring, Drizzle migration packaging and real D1 verification. Native dispatcher identity and an approved exact owner subject allowlist remain unconnected. See the [hosting handoff](../agenda/hosting-handoff.md); portable factories alone are not production readiness.

Real services/prices/durations/staff/shifts/policies, verification timestamp, owner assignment, private backup destination/remote recovery, email provider/runner, retention/revocation and license selection remain unresolved. Capabilities have no automatic expiration in this MVP. Email is disabled, and outbox delivery requires provider deduplication because it is at least once. Production remains closed until its verified setup; local fixture data cannot become hosted fallback.

Pending client requests and capabilities are held in memory. Close/reopen and in-page refresh tests do not establish recovery after a full page reload or closing the tab. Lost management links require an authorized administrator.

Human visual acceptance is separate from automated tests and independent technical review. Safari/iOS and a screen reader were not tested. No merge, credential provisioning, payment, actual notification or backend deployment occurred.
