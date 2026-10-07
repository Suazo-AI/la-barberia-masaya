# Release-candidate closeout · 2026-10-06

This is a tested source candidate, not approval to activate real appointments, merge, grant access, or deploy. The current public review Site remains on v7 (`cd08b655d27bf6e23eeda80ba0a39d171bb858c5`), whose complete tracked source matches PR #4 at `6efd7bb4fd101949c1deee9af00b7bc601028fb9`. Its Worker/D1 shell is deployed; appointment activation is still closed. Earlier “not deployed” notes describe the historical authoring increments.

Read-only hosting inspection on 2026-10-06 verified the `DB` binding and ten agenda tables. Runtime variables are absent. Configuration, entries and outbox have no rows. This inspection does not prove real D1 collision, authenticated identity or recovery behavior.

## Repairs in this candidate

- Customer rescheduling uses `GET /bookings/:id/availability?date&professionalId`, authorized by the existing private booking capability. It excludes only that reservation and uses its original duration and buffers, matching the actual reschedule operation. Ordinary public availability still includes every confirmed allocation and rejects arbitrary exclusion parameters. Read-only availability does not reserve a slot; transaction and version checks remain decisive
- The historical affected-appointment notice remains visible after an absence is revoked. Its wording describes the report-time snapshot and asks the owner to check current status. It does not claim that all those appointments remain unresolved or change any appointment
- Lighthouse retains its browser ownership, exact-version, AppArmor, three-cold-run and metric gates. Its preflight failure is now saved as evidence. A fresh random debugging port and an acknowledged own-server startup avoid accidentally measuring another browser/server. No security requirement was relaxed

## Reproducible evidence

The source adds four domain cases and one HTTP case covering overlapping self-moves, other bookings, absences, original snapshot after configuration migration, permissions, cancellation/deadline rejection, token/query isolation and unchanged public availability. All 131 agenda tests, 16 static/model tests, 3 Worker artifact tests, lint, TypeScript and unchanged asset budgets passed in the cloud authoring environment. A locked dependency audit reported zero known vulnerabilities.

The cloud browser launch is blocked before rendering by socket restrictions, including the supported escalated launch. New browser evidence must therefore come from the existing GitHub workflow. `release-closeout.spec.mjs` runs the exact pre-change PR #4 application alongside the candidate at 390×844 and 1440×900, captures real before/after screenshots and video, verifies the repaired behavior, and saves axe incomplete findings for manual review. This paragraph does not claim CI has completed; the exact commit’s Actions result is authoritative.

Lighthouse cannot measure in this Debian authoring environment because its expected official Chrome/AppArmor installation is absent. The historical GitHub failure was a root-ownership preflight failure. A red performance gate must not be described as a performance pass. Real iOS/Safari, physical touch, screen readers and human acceptance also remain separate.

## Activation checklist

The responsible person is the actual business owner or an explicitly authorized local administrator, not automatically the developer or Site installer.

1. Confirm real services, descriptions, prices in NIO, durations, preparation/cleanup buffers and eligible barbers
2. Confirm each barber’s name, optional approved photo and seven-day working intervals. General shop photos are not attributable individual portfolios
3. Confirm slot spacing, advance notice, maximum booking horizon, cancellation/rescheduling cutoff and handling of appointments affected by absence. The template’s values are unapproved examples
4. Verify the actual owner’s same-Site stable sign-in subject and approve the owner allowlist. Approve exact subject-to-professional mappings for barbers. Sign-in or ownership of another app grants no agenda role. The documented top-level Sites sign-in route must be integrated/verified for phone entry
5. Supply verified server-side configuration/version/date and exact HTTPS allowed origin. Keep private runtime settings, identities, appointments and backups out of public Git, assets and screenshots
6. Verify deployed migration history, trusted dispatcher identity behavior for anonymous/unapproved/approved accounts, genuine D1 atomic collision/retry behavior and an approved private export/restore drill. Use isolated synthetic data and explicit approval for hosted changes
7. Decide retention, lost-link recovery/revocation and public abuse-control policies. Choose an approved private backup destination and recovery owner
8. Review the exact-build phone/desktop evidence, complete relevant Safari/iOS/screen-reader checks, obtain human visual acceptance and explicit release authorization

Catalog update, 2026-10-06: the user has now confirmed service prices and durations; [the private candidate notes](catalog-readiness.md) supersede that subset of item 1. Preparation/cleanup buffers, service eligibility and the other activation inputs remain unresolved. This partial confirmation does not mark the complete configuration verified or authorize activation.

Email delivery may remain disabled. Sender/provider/runner approval is needed only before enabling messages. License selection and copyright attribution remain necessary before distributing the reusable module as open source; a public repository is not itself a license.

## Rollback boundary

Preserve v7 as the last deployed source and preserve all existing branches/PRs. This candidate adds no database migration or business configuration. A source rollback must never be confused with restoring a live database. No production rollback, destructive cleanup, real booking, external notification, owner grant, merge or deployment was executed in this closeout.

## Staff sign-in entry increment

The next source increment adds a Sites-only self-identity read before business configuration. `GET /api/agenda/v1/identity` returns only whether this request is authenticated, its own opaque per-Site subject when present, and fixed dispatch-owned sign-in/sign-out paths. It never returns email, other users, a role, a list of accounts, business configuration or private appointments. It makes no D1 call and creates no grant. It is GET-only, rejects query parameters, checks Origin/Fetch Metadata, sets no-store and provides no CORS permission.

The staff page starts authentication only through a top-level link to `/signin-with-chatgpt?return_to=%2Fadmin.html`. Signed-in but unapproved staff can copy their own identifier for a separate explicit approval. Account identifiers stay in memory/the page, not URLs or browser storage. Refresh/account changes clear the previous identifier; pending-operation recovery guards remain intact. An already authorized agenda does not display the setup panel. The sign-out link uses the corresponding dispatch route.

The portable Worker and Node adapters do not expose this endpoint or interpret dispatcher identity headers. Sites-specific unit tests model headers already supplied by trusted dispatch; they do not establish that a public hosted dispatcher strips forged incoming identity headers. That requires real hosted verification before any grant. Browser cases explicitly mock identity/session responses for UI coverage and intercept the sign-in navigation locally; they perform no real sign-in. Their real pre-change application is pinned at `59801861ab926343630ef6b847500ce790abc2d8`.

No identity allowlist, runtime setting, business configuration, external account, persistent credential, deployment or role grant is changed by this increment. The actual owner and barber accounts still need verification and explicit approval. The current deployed review Site remains unchanged.

Identity navigation and `pagehide` synchronously scrub private DOM/state, the own-subject display and retained mutation body/key/retry. A page-lifetime abort/epoch guard rejects delayed old replies; it cannot clear an uncertain operation's pending sentinel. A persisted `pageshow` scrubs again and revalidates access before private data can return. Tests include an actual sign-out/Back navigation and explicit persisted lifecycle-event simulation around a committed-but-delayed synthetic mutation; they do not assert that CI admitted the page to an actual browser back/forward cache.

## Offline setup increment · 2026-10-06

The [operator runbook](setup-runbook.md) and `npm run check:setup -- <private-config.json>` provide a concrete, read-only next step. The checker reuses runtime validation, identifies missing input paths, omits private values and never fills defaults, contacts the host or authorizes activation. Production-shaped input can pass structural validation while all separate approval/hosted-verification gates remain. Eight regressions cover incomplete candidates, fixture rejection, runtime-validator parity, malformed/special-file input, privacy, file bounds and unchanged inputs.

Local checks on this combined candidate passed on 2026-10-06: lint, TypeScript, 151 agenda tests (including eight catalog-duration and eight setup-check cases), 16 static/model tests, four built-Worker artifact tests, static/Worker builds and unchanged asset budgets. No new public UI, runtime adapter, schema/migration or production configuration is changed. Browser tests have not been rerun locally for this offline increment; exact-head CI remains authoritative. A read-only Site inspection still found v7 and no runtime entries (revision 0).

### Explained performance blocker

The retained CI preflight for image `20260927.320.1` reports Chrome UID 0 and mode `0777`: ownership was correct, but the installed binary was group/world writable. GitHub's [exact image provisioning source](https://github.com/actions/runner-images/blob/1275e33f5019b02660b81ecc5622fe196211fa89/images/ubuntu/scripts/build/configure-system.sh#L12-L15) recursively makes `/opt` writable, explaining the guard failure. The [published image manifest](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/Ubuntu2404-Readme.md) matches the pinned Chrome version. An unchanged retry is not a demonstrated repair.

No guard, security permission, runner or metric threshold was changed. A private Chrome download does not meet the present root-owned/path-specific AppArmor contract; [official Puppeteer guidance](https://pptr.dev/troubleshooting#issues-with-apparmor-on-ubuntu) documents that sandbox restriction. A different-platform lab would need separately reviewed integrity and sandbox verification before it could establish the three cold-run performance result. Performance remains unmeasured, not passed.
