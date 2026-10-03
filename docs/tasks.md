# Issue-ready task graph

Updated 2026-10-03: current increment is approved round-two option 2 hero + selected monochrome El local grid + static foundation. T-01 direction is resolved for this increment; T-02/T-03/T-04/T-05 are active with one implementation owner to avoid overlap. T-06 and independent review follow on the exact source state. T-07 human responsive review remains open; T-08 release is blocked pending final approval/host. The task descriptions below preserve the original full-MVP roadmap; abstract graphics and Astro were proposals superseded by SPEC v0.3.

Current owned paths: implementer owns `src/`, `scripts/`, package/config/CI and reconciled docs. Reviewer is read-only and reports findings. Parent handles reference research for remaining sections outside the implementation paths. No speculative below-fold content is added.

## Graph and working rules

`T-01 → Gate A → {T-02, T-03, T-04} → T-05 → T-06 → T-07 → T-08`

- T-02, T-03 and T-04 may proceed in parallel after Gate A with non-overlapping owned paths
- T-05 integrates their outputs; Gate B must pass before production content is considered complete
- T-07 includes the independent review and Jason's Gate C approval; T-08 waits for Gate D release authorization
- T-09 (optional pipeline evaluation) is independent, read-only until separately authorized, and never blocks the website

Use one small branch/PR per task, e.g. `task/t02-static-foundation`. Separate worktrees/branches prevent accidental edit collisions; they are not security sandboxes. Agree file ownership before parallel work, and serialize changes to shared configuration/content contracts. Open PRs in draft mode initially. A different reviewer verifies code and evidence; the author does not self-approve the release. CI is authoritative for automated execution, the source ledger for facts, and Jason for final visual decisions.

For every task, include the evidence record in [acceptance.md](acceptance.md). Do not execute unreviewed third-party commands, weaken approvals, or place secrets into task prompts/logs. No automatic merge or production deploy should be enabled by default.

## T-01 — Confirm business and plan

**Owner:** project/content approver · **Depends on:** none · **Status:** ready for decisions

Complete canonical Maps citations, confirm the candidate shop and publishable fact sources, and decide call-first scope, stack and visual proposal. Record Gate A; list Gate B content/asset questions without requiring optional photos/services.

- Files: `docs/sources.md`, `docs/decisions.md`, affected spec sections
- Done: exact Maps identity reference; D-02 through D-04 decided; no contradictory unknown/approved statuses
- Evidence: dated publishable decision record and source references
- Requirements: R-01, R-10
- Does not include: installing dependencies, executing No Mistakes, publishing a website

## T-02 — Establish static foundation

**Owner:** implementation agent · **Depends on:** T-01 / Gate A

Scaffold the approved static stack, runtime pin, lockfile, lint/type-check/build commands and CI. Create the typed content contract and minimal route/404 skeleton. Inspect dependencies and scripts before execution; keep CI least-privilege, with no deployment credentials on untrusted PRs.

- Owned paths: package/config files, CI, minimal layout/skeleton; coordinate the shared content type with T-04
- Done: clean install, type check, lint, production build, smoke test; command map documented
- Evidence: reproducible commands, dependency rationale, exact-commit CI logs
- Requirements: R-11, R-14

## T-03 — Prepare visual system

**Owner:** design agent · **Depends on:** T-01 / Gate A

Develop the approved visual direction into mobile/desktop layouts and measured color/type/spacing tokens. Use original abstract decoration and a text wordmark. Show real content lengths and an optional-content-omitted state.

- Owned paths: stylesheet/design assets and design review screenshots; no contact content edits
- Done: 390×844 and 1440×900 layouts; contrast measured; no proprietary image/official-logo reconstruction
- Evidence: screenshots and token/asset provenance; design feedback recorded
- Requirements: R-06, R-07, R-08, R-10

## T-04 — Curate approved business content

**Owner:** content agent · **Depends on:** T-01 / Gate A; coordinate contract with T-02

Create the typed business record and concise Spanish copy. Confirm primary contact and directions; either use approved hours or a complete fallback. Complete Gate B. Prepare metadata using the final domain only when known.

- Owned paths: business content record, source/asset ledger, copy fixtures
- Done: every fact has source status; unknown services/prices/WhatsApp/reviews absent; no incomplete release placeholders
- Evidence: content diff, source IDs, approval/rights references
- Requirements: R-01, R-02, R-03, R-04, R-05, R-10, R-13

## T-05 — Integrate responsive page

**Owner:** integration agent · **Depends on:** T-02, T-03, T-04

Implement semantic page sections and ordinary call/directions anchors. Maintain readable contact information, no-JS operation, focus/skip link, robust reflow, reduced motion, and safe media fallbacks. No backend or new integration.

- Owned paths: page/components/layout integration; shared files change through coordination
- Done: all specified viewport and omission states usable; no overflow or hidden contact action
- Evidence: production-build screenshots, deterministic navigation/URL checks, build/type-check results
- Requirements: R-02 through R-08

## T-06 — Verify functional and quality gates

**Owner:** QA agent independent of principal implementation · **Depends on:** T-05

Implement/run the full acceptance matrix against the production build. Inspect privacy/network/storage behavior, asset rights, package/build output, accessibility, metadata, size budgets and pinned lab performance. Open precise fixes with reproduction evidence; rerun affected checks after changes.

- Owned paths: tests and evidence; report source fixes rather than overwrite another active branch
- Done: R-01 through R-14 have PASS or explicit blocking statuses, no unexplained failures
- Evidence: exact-commit CI artifacts, test reports, screenshots, manual-check checklist
- Requirements: R-01 through R-14

## T-07 — Review and approve visuals

**Owner:** independent reviewer + Jason · **Depends on:** T-06

Review the diff, sources, test evidence and limitations; obtain Jason's explicit mobile/desktop visual approval. Resolve release blockers and rerun affected checks. Aesthetic approval does not override broken functionality, rights or privacy.

- Files: concise review/release record once implementation exists
- Done: no unresolved blockers; independent review and Gate C refer to the same final commit
- Evidence: review findings/dispositions, approval reference, final screenshots and CI
- Requirements: R-15

## T-08 — Publish and verify release

**Owner:** release operator · **Depends on:** T-07 and Gate D authorization

Use the approved host/domain and least necessary permissions. Set correct canonical/base path, production indexing policy, and HTTPS. Publish the reviewed artifact; verify remote/deployed commit identity, primary links, mobile render and response/asset paths. Document rollback and handoff.

- Files: host-specific release/rollback instructions and final metadata/config as approved
- Done: verified live URL/commit, smoke checks, rollback path and known limitations; check again if deployment rewrites assets or paths
- Evidence: deployment run/artifact IDs, observed public URL/time, smoke results
- Requirements: R-03, R-13, R-16

## T-09 — Evaluate safe pipeline integration (optional)

**Owner:** independent security/tooling reviewer · **Depends on:** none for read-only analysis

Review the pinned No Mistakes source and document whether it can run with normal sandbox/approval controls, minimal credentials and authoritative external CI. Verify the effective Codex adapter flags rather than assuming configuration overrides defaults. Treat worktrees as collaboration tooling, not containment.

- Files: add only the relevant decision/evidence to `docs/decisions.md`; no generic factory template expansion
- Done: explicit adopt/defer/reject recommendation, supported configuration plan and remaining authorization requirements
- Evidence: pinned source references and, only after separate approval, harmless isolated validation results
- Not authorized here: installation/execution, approval bypass, credential expansion, or replacing CI with PR-body attestations

## Completion boundary

The pilot is complete when the approved website is live at its verified URL, required checks/reviews are recorded for its exact artifact, and the release/rollback handoff is usable. CRM, chatbot, automated booking, and generalizing a full multi-business factory are separate follow-on decisions.
