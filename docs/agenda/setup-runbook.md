# Operator setup runbook

This is a source-only, fail-closed onboarding path. The offline checker diagnoses a candidate; it cannot activate bookings, verify an account, grant a role, change runtime settings or publish a Site. No fixture value is a business default.

## 1. Finish the private business candidate

Keep the real candidate and provenance in `.agenda-private/`, excluded from public Git and builds. Preserve stable service/professional IDs when display names change. Use `null` for unknown numeric values or shifts, not zero or an empty closed week. Photos are optional and must have an approved, accurate attribution; invented display names are not real-person identity evidence.

Run from the repository root:

```sh
npm run check:setup -- .agenda-private/catalog-candidate.json
```

The JSON report identifies missing field paths and uses the **same validator as the runtime** for invalid values. It deliberately omits business names, service details, prices, profile names and identifiers. It reads at most 128 KiB, never rewrites the input and prints no raw parser excerpt on failure.

Exit codes:

- `0`: the supplied production configuration is structurally valid; separate approval and hosted verification are still required
- `2`: incomplete, invalid, fixture-only or unconfigured candidate
- `1`: unreadable/oversized/malformed input or incorrect command syntax

Every report has `activationAuthorized: false`. No mode switch or verification flag proves that the business approved the values. Keep `mode: "unconfigured"` and `verified: false` until the complete configuration has been reviewed. Do not fill fields just to make this command pass.

The remaining business decisions are preparation/cleanup buffers, service eligibility, each professional's seven-day intervals, slot spacing, minimum notice, maximum horizon, cancellation/rescheduling cutoff and absence handling. Day zero is Sunday. Each day's intervals are sorted, non-overlapping local-minute pairs; `[]` means genuinely closed. Shop hours do not prove individual shifts. Service duration is independent of slot spacing. The existing example configuration is a schema illustration, not an approved policy recommendation.

## 2. Verify accounts without granting roles

The reviewed candidate staff entry is `/admin.html`. On the same deployed Site, its top-level ChatGPT sign-in route returns the visitor to that page. The visitor can see/copy only their own per-Site identifier. Sign-in by itself grants no agenda permissions. This path still needs real hosted verification; mocked browser tests are not a substitute.

The actual business owner must approve the exact owner subject and each subject-to-professional mapping. Never use an email, invented name, Site access-policy account ID, developer identity or subject from another Site as an authorization fallback. Keep identifiers out of public evidence. The staff page does not accept or install an allowlist.

## 3. Prepare the same-Site release

Use the existing `.openai/hosting.json` project and `DB` binding. The source candidate adds no database migration. Preserve the current Site audience; updating code is separate from opening bookings.

Before any approved runtime change, capture the current source/version and private configuration state with the supported host tools. A source version is not a database backup. The candidate's build allowlist excludes private setup files and the offline checker. The exact source must pass lint, TypeScript, static/domain/Worker artifact checks, budgets and applicable browser checks. Keep a failed or unmeasured performance gate visible. Obtain human acceptance of the relevant UI.

Only after authorization should the approved server-side `AGENDA_CONFIG_JSON`, exact `AGENDA_ALLOWED_ORIGINS_JSON`, owner allowlist and optional barber mappings be installed using supported Sites runtime tools. Secrets/account mappings must not enter source, command lines, assets or screenshots. Do not change these values as part of running the offline checker.

## 4. Establish hosted readiness before real appointments

- Independently verify anonymous, signed-in-unapproved, approved-owner and scoped-barber behavior through the trusted dispatcher, including forged incoming identity headers
- Verify migration history and real D1 collision/idempotent-retry behavior with isolated synthetic data under an approved host-testing plan
- Approve a private backup destination, recovery owner and supported restore procedure; execute and verify a restore drill. Local SQLite backup tests do not establish remote D1 recovery, and no unsupported restore API is assumed
- Resolve retention, lost-management-link recovery/revocation and abuse-control policy before admitting real customer data
- Verify exact prices, durations, buffers, shifts, eligibility, policy cutoffs and phone/desktop flows with the operator, then obtain booking activation authorization

Notifications can remain disabled. Licensing a separately distributed reusable module is a separate decision from this business setup. Stop if an identity, configuration version, destination or risk changes; do not silently substitute another host, create an account or assign a role.
