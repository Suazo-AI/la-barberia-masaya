# Cloud-only agenda integration candidate review

Date: 2026-10-04 UTC. Implementation baseline: `f321ab9c0db256fed92682ccad08ae15b552a628`. The later remote `68c362fd15e02e01ea5b25a789340af69f825842` adds documentation and actual earlier screenshots/videos only; its application source is unchanged. Those artifacts describe the prior application, not browser verification of the new reload guards.

## Subsequent remote verification

The source candidate was published separately in [draft PR #3](https://github.com/Suazo-AI/la-barberia-masaya/pull/3), leaving PR #2's branch unchanged. Initial exact-head [CI run 37173363055](https://github.com/Suazo-AI/la-barberia-masaya/actions/runs/37173363055) on `ceaf7b16f4d4f48b66b1fc2bfe79c7a7324853ab` passed all local-equivalent checks, 24 website browser tests and 31 of 32 agenda browser tests. The remaining test failed in route-interception cleanup (`Route is already handled`) after its request deadline assertions; it was corrected to wait for active routing handlers before removing interception. No timeout, UI or replay assertions were removed or relaxed. The next exact-head CI result is reported on the draft PR; the initial run is not claimed green.

Dependency audit also identified the development-only esbuild advisory [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) through Drizzle tooling. A targeted override selects the already pinned patched esbuild `0.28.2` for that transitive dependency. After regenerating the affected lock entries and a clean `npm ci --ignore-scripts`, `npm audit` reports zero known vulnerabilities. Generation drift, types and tests are checked again; no development server or hosted runtime dependency is introduced.

## Scope

- Isolated source-only Worker/assets adapter for the same Site, with exact logical `DB` binding and no assigned owner
- Generated initial D1 migration package, preserving eight application tables, 31 CHECK expressions, index/FK semantics and full overlap triggers
- Non-secret per-tab unresolved-mutation markers, fail-closed true-reload behavior and bounded administrative requests
- No PC access, remote branch replacement, Site mutation, real D1 operation, administrator grant, message delivery, business activation, merge or license selection

## Checks executed in the cloud workspace

Runtime: Node `v24.19.0`, repository lockfile. All rows below describe actual command execution, not expected CI results.

| Command or check | Result |
| --- | --- |
| `npm ci --ignore-scripts` and pinned build tooling installation | Passed; no preexisting locked dependency version removed or changed |
| `npm run lint` | Passed |
| `npm run typecheck:agenda` | Passed for agenda plus root schema/config |
| `npm run build` | Passed, unchanged static asset workflow |
| `npm test` | 16 passed |
| `npm run test:agenda` | 89 passed, including reload-marker tests, Sites adapter tests and generated migration parity/concurrency tests |
| `npm run test:sites` | 3 passed against actual bundled Worker; all 28 public assets checked byte-for-byte |
| Official local Sites archive packager | Passed; Worker plus manifest and full migration metadata only |
| `npm run check:budgets` | Passed; optional booking allowance intentionally 36→40 KiB for reload safety; bootstrap/core/full gzip caps unchanged |
| `drizzle-kit check` and generation drift check | Passed; no schema changes generated after checked-in migrations |
| `playwright test -c agenda/playwright.config.mjs --list` | 32 browser tests registered, including nine new reload/storage/timeout regressions |
| `git diff --check` | Passed |

The bundled Worker is approximately 1.4 MB raw / 885 KB gzip, below the conservative 2 MiB project build budget. This is not a hosting price, quota or runtime performance measurement. The candidate adds pinned development dependencies only; its hosted runtime has no npm dependencies or Node imports.

## Independent review and fixes

An independent source review and focused test run found no P0/P1 issue. Review identified and prompted fixes for configured remote photo CSP compatibility, temporary session-storage write failure hiding the only uncertain retry, and misleading wording about the not-yet-implemented administrator sign-in affordance. Browser fixture dates were checked against the real fixed-clock SQLite catalog and corrected to the October 4–25 range. Migration tests exercise actual constraints and eight concurrent independent SQLite connections, not just table counts.

## Explicitly not verified

During the initial local-only preparation, no Chromium browser was launched after the cloud audit reported a sandbox startup restriction; the local registration count was not a browser pass. The subsequent remote CI results above supersede that local limitation. Human visual acceptance remains pending; no measured Lighthouse result is claimed, and the initial remote aggregate was not fully green.

Tests using a local SQL-backed structural D1 double do not establish real D1 dispatch, migrations, concurrency limits, backups or restoration. Those remain activation gates, together with approved real business configuration, same-Site owner identity and persistent-access approval, hosted admin sign-in UI, retention/revocation policy and a private recovery destination.

The non-secret reload marker does not provide cross-tab/device recovery or safe automatic unlock after document loss. It blocks a new operation while the prior result is unknown. Only same-document retry retains the exact original secret/payload in memory. See [the complete candidate handoff](../agenda/sites-candidate.md).
