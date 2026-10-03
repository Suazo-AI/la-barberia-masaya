# Decisions and approval gates

Updated: 2026-10-03. Current decisions below supersede conflicting proposals in the historical table.

## Current decisions

| ID | Decision | Owner / status / reason |
| --- | --- | --- |
| D-11 | Round-two option 2, contundente | User selected 2026-10-03; black/ivory frontal-interior split, condensed heavyweight type, one call CTA. Supersedes hero03 and D-04 |
| D-12 | Implement approved hero and continue end-to-end website in reviewed stages | User authorized 2026-10-03. Future section design still uses human-guided references |
| D-13 | Plain HTML/CSS with Node build/preview and locked dev tools | Implementation choice within D-03 simpler alternative; zero application JS, no runtime framework/backend, lower maintenance |
| D-14 | Anton + Barlow/Barlow Condensed, self-hosted OFL fonts | Implementation choice matching D-11, avoids paid fonts and third-party initial requests |
| D-15 | Photo use and referenced image generation permitted for this project | Initially pending; user explicitly confirmed permission on 2026-10-03. Selected optimized derivative and review evidence may be used for this project. Raw Maps/competitor screenshots remain excluded |
| D-16 | Public canonical repo exists at Suazo-AI/la-barberia-masaya | Verified 2026-10-03; main README-only baseline `e74e58622c715b1618c543496b5b680d1bd875f6`. Resolves D-06 |

Gate A is complete for the hero increment. Gate B is partial (business/contact confirmed; photo permission confirmed; official launch authority open). Gate C is still required for the actual responsive implementation, not the already-selected concept. Gate D is open. Directions and hours belong to the next selected visit-section treatment.

D-17 · User selected 2026-10-03: Stockers-style tight B/W four-column grid, adapted truthfully as “El local” using two authorized enhanced interior views and two explicit detail crops. No fictional client work. Two columns on phones. Actual visual review remains pending.

## Historical proposal table (2026-10-02; not current instructions)

| ID | Decision | Status | Reason / next action |
| --- | --- | --- | --- |
| D-01 | First pilot is the La Barbería Masaya website; CRM and Forja bot come later | Scope established | Keep the pilot small enough to finish and verify end to end |
| D-02 | One Spanish static page, with call-first conversion and directions | Proposed | Matches the verified classes of contact information without inventing a reservation system. Confirm the desired booking/contact workflow |
| D-03 | Astro + TypeScript, plain CSS, typed content, no backend | Proposed | Fits a reusable static-site pilot while avoiding database/auth maintenance. Plain HTML/CSS remains acceptable if preferred. No dependency installed or version selected yet |
| D-04 | Charcoal/copper/cream editorial direction; original abstract graphics first | Proposed | Grounded in observed atmosphere without rehosting unlicensed images or suggesting fabricated premises |
| D-05 | Jason has final visual authority | Required process gate | Human approval of mobile/desktop screenshots and preview is required; CI cannot substitute |
| D-06 | Public project repository under Suazo-AI | Visibility requested; remote pending | Use only public business facts and project material. The repository URL must be verified after creation |
| D-07 | Evaluate the user-requested No Mistakes pipeline; do not install/run now | Evaluation only; integration not approved | Reviewed adapter defaults can bypass approvals/sandbox. Worktrees isolate changes, not execution/security. PR-body attestations are author-editable and cannot prove tests passed |
| D-08 | CI logs/artifacts for the exact commit are authoritative for automated checks | Required process gate | Run declared commands in a controlled environment with pinned toolchain/dependencies; review independently. Agent narratives are supporting context |
| D-09 | Host, domain, deployment permissions, and release route | Open | Choose after stack/plan approval. Creating a public repo does not itself select a host or activate continuous production deployment |
| D-10 | Ratings, review quotes, unverified services/prices, WhatsApp and booking claims | Excluded from MVP | These facts or rights are unnecessary, unstable, or unverified. Any addition needs evidence and scope approval |

## Historical Gate A — approve the implementation direction

Historical prerequisites, resolved for the hero increment by D-11 through D-16:

- Confirm B-01 is the intended shop near El Cailagua
- Approve or change D-02, D-03, and D-04
- Record the desired workflow: **Llamar** with a visible phone number is recommended; a request-for-appointment workflow needs a confirmed channel and honest wording

Record each decision with date, approver role, exact option, and a publishable approval reference. No private conversation transcript belongs in this public file.

## Gate B — approve usable content and assets

Required before production content is complete:

- Verify name/address/phone and the exact Maps destination
- Confirm hours or approve omission with a call-to-confirm sentence
- Confirm authority to present the website as the business's official site
- Approve customer-facing Spanish copy and each asset/license; use the original-graphics fallback if no photo rights are supplied

Never make release conditional on obtaining optional photos, prices, or a services catalog. Omit those sections cleanly when unavailable.

## Gate C — approve the visual result

Jason reviews the same commit on mobile and desktop, including the real content lengths and optional-content fallbacks. Record approval or concrete requested changes. A material layout/copy/asset change after approval reopens the affected part of the visual gate. All applicable automated checks still run after final changes.

## Gate D — approve and verify release

Confirm host/domain, access level, canonical URL, and permitted deployment route. Merge or deploy only within the explicit current authorization. Gate A through C, required checks, and independent review must pass first. Verify the deployed commit/artifact, HTTPS, primary links, metadata, and mobile rendering; retain the previous artifact/commit for rollback.

## No Mistakes integration boundary

The [reviewed adapter source](https://github.com/kunchenguid/no-mistakes/blob/14e8dd10fde33a5a7e83589b3791707c43df5602/internal/agent/codex.go) is a security warning to resolve, not permission to execute. Before integration:

1. Review a pinned revision, its install/run path, dependency provenance, spawned commands, network behavior, credentials, and generated artifacts
2. Require an isolated, least-privilege execution environment; deny approval/sandbox bypass flags and prove the effective configuration in a harmless test
3. Keep secrets unavailable to untrusted pull-request code; do not give autonomous agents production deployment or account-administration powers
4. Require ordinary CI checks and independent review regardless of orchestrator output; do not accept editable PR text as execution evidence
5. Obtain any action-time approval required for installation/execution or expanded persistent access. Do not infer approval from the request to consider this repository

If safe operation cannot be demonstrated, proceed with the same small task graph and ordinary reviewed PR workflow without the tool. The pilot does not depend on adopting an orchestrator.

## Current decision log

2026-10-02: Initial proposal recorded. No implementation direction, production business content, final visuals, host, or pipeline execution has been approved in this planning package. Tests/build/deployment are not yet run.


## Visit increment — 2026-10-03

- Design owner: project approver selected Stockers visit reference; implementation adapts only split-panel rhythm and rules, not its branding or content. Dark Anton/Barlow typographic panel keeps navigation practical and the hero unchanged.
- Content owner: public Google Maps business listing, re-verified 2026-10-03, not independent business confirmation. Exact weekly schedule and place ID are preserved; dated source/holiday qualification is visible.
- Latest gallery direction: approved effect is for genuine haircut photographs and reviews. The local grid is static again; the retained engine is disabled pending authentic material. Historic WebGL tests are explicitly skipped while that feature is unavailable, not reported as current passing checks.
- Implementation and draft PR update authorized; human visual review and public-release permission remain separate gates.
