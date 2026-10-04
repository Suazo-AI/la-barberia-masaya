# Source-only Sites integration candidate

Prepared from `f321ab9c0db256fed92682ccad08ae15b552a628` in an isolated cloud branch. This is implementation and local evidence, not a deployment, owner assignment, business configuration or claim of operational readiness. The existing Site and public demo remain unchanged.

## Build and packaging

`npm ci --ignore-scripts` installs pinned development tooling. `npm run build` retains the existing static website workflow. `npm run test:sites` builds and checks the separate Worker candidate; run `npm run build` again before static preview or browser checks.

`npm run build:sites` first builds the same approved public assets, embeds their exact bytes in a self-contained ESM Worker, then emits only `dist/server/index.js` and `dist/.openai/hosting.json` plus the complete generated migration tree under `dist/.openai/drizzle`. The default export exposes `fetch(request, env)`. The integration uses no undocumented `ASSETS` binding, framework runtime or Node API. Assets are allowlisted at build time and are not obtained from server configuration. Every photograph, font, license notice, HTML, CSS and browser module is checked byte-for-byte by artifact tests. A conservative 2 MiB gzip project budget bounds the embedded bundle; this is not a statement about the account's hosting limits or fees.

The source manifest retains the existing Site project ID, declares only the logical D1 binding `DB`, and removes static-only packaging. A plain `npm run build` is intentionally insufficient for publishing this backend candidate. The Site owner must use `npm run build:sites` in the normal authorized Sites publishing workflow. Source-only preparation does not run that workflow or create credentials.

## Runtime configuration and identity

All three settings are server-side runtime values, with empty examples in `.env.example`:

- `AGENDA_CONFIG_JSON`: complete verified production `AgendaConfig`, with real services, NIO prices, durations, staff, shifts, policies and verification timestamp
- `AGENDA_ADMIN_SUBJECTS_JSON`: JSON array of explicitly approved stable same-Site user subjects
- `AGENDA_ALLOWED_ORIGINS_JSON`: JSON array of exact HTTPS origins, without trailing slash, path or credentials

Missing or malformed configuration, fixture/unconfigured mode, missing D1, unverified business facts or an empty owner list keeps every agenda API unavailable. The public assets remain reachable. Runtime schema creation is forbidden; migrations must have applied before Worker activation. Notifications remain disabled with no external transport or runner.

Only `agenda/adapters/sites.ts` reads `oai-authenticated-user-id`, on the condition that it runs exclusively behind the Sites dispatcher that owns and authenticates that header. Do not expose that entrypoint through an arbitrary HTTP server or deploy it somewhere that forwards caller-supplied identity headers unchanged. Generic Worker/Node adapters keep their existing independent trust boundary. Authorization compares the subject to the explicit server allowlist; email, account access-policy ID, client roles, anonymous visitors and merely signing in never grant administrator rights.

The publisher must add a Sites-specific administrator sign-in link during activation: top-level navigation to `/signin-with-chatgpt?return_to=/admin.html` with `target="_top"`; dispatch owns this route. The shared static/local administrator UI currently has no sign-in link, so this is pending activation work, not a completed UI flow. There is no identity-discovery, first-visitor bootstrap or self-grant endpoint. Verifying and approving the owner subject and granting persistent administration remain separate required steps. This candidate deliberately does not assign anybody.

## Migration and verification boundaries

Root `db/schema.ts` defines the portable tables, constraints and indexes. The generated initial Drizzle migration is followed by a custom migration with complete overlap triggers. Journal and snapshots are checked in; a build copies them without alteration. Split only at explicit `--> statement-breakpoint` delimiters, never at trigger-body semicolons. These are initial unapplied migrations; once applied, append migrations rather than rewriting SQL or metadata. The local adapter retains its own canonical migration and schema version marker.

Local tests exercise the Sites adapter through a real SQLite-backed structural D1 double. They check anonymous booking, same-key replay, disabled outbox, exact administrator authorization, invalid setup, origin rejection and closed API behavior. The artifact tests import the actual single-file Worker and verify its assets and metadata. This does not prove live D1 limits, remote migrations, remote concurrency, dispatch header stripping or a hosted backup/restore procedure.

Before activation, the owner must review and test actual Site dispatch, D1 migration atomicity, collision/retry behavior, private export and restoration to an approved destination, then complete the real business configuration and explicit access approval. Customer capability expiry/revocation, record retention and public abuse controls remain operational decisions. No new license has been selected or applied.

## Document-loss resilience

The browser keeps the exact pending mutation in memory for safe same-document retries. A non-secret per-tab guard records only that a write may be unresolved. It is written before sending and cleared only after a verified success or definite rejection. After a true document reload, a surviving guard blocks new writes instead of silently generating a new booking or change. No management token, idempotency key, payload, customer detail or booking ID is stored by the guard.

This is a bounded fail-closed mitigation, not automatic cross-document recovery. It cannot follow a closed tab, cleared session storage, another browser or another device. Private links still require the original saved capability. An administrator must establish the outcome of an unresolved operation before further booking; a successful schedule read alone is not proof that a delayed write cannot still commit. Automatic secure recovery requires a separately designed server operation-status contract. Storage unavailability blocks new writes rather than accepting this risk silently.

Public/customer and administrative fetches have bounded request deadlines. A timeout is an uncertain mutation outcome, never proof that storage rejected the operation. Existing same-document retries preserve the original request through later rejected retries.

The optional on-demand booking JavaScript budget increases from 36 to 40 KiB for the non-secret reload guards and recovery messages. Bootstrap, core asset and full-page gzip budgets are unchanged; this does not claim a measured performance pass.

## References

- [D1 prepared statements and transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 SQL API](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- The Site owner's verified hosting contract and source-only handoff govern eventual deployment; no Site state was changed by this candidate
