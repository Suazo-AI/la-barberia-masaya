# Backend hosting handoff

Status on 2026-10-04: the agenda runs against persistent local SQLite. The D1 adapter and Worker factory have local contract tests. They are not a packaged or activated hosted backend. `npm run build` still emits the existing static website; it does not emit `dist/server/index.js`, connect D1 or apply hosted migrations. The parent owns the existing Site and its manifest. This implementation has not called Sites, changed its audience/configuration, created credentials or deployed a backend.

## Work required in the Site owner's checkout

Preserve the existing project ID and the approved HTML, CSS, JavaScript, fonts, photographs and notices. Use a supported asset-serving Worker build or a verified equivalent that keeps these assets reachable and routes `/api/agenda/v1` to `createAgendaWorker`. The supported entrypoint is a default object with callable `fetch(request, env, ctx)` in `dist/server/index.js`. A minimal Worker starter that excludes standalone assets is not suitable for this existing website.

Replace static-only packaging with Worker packaging in both source and built hosting manifests. Declare the logical D1 binding `DB`; the Site platform owns physical resources and wiring. The publisher's read-only inspection reported zero current D1 bindings/tables. No project ID, account credential, API key or assumed physical database ID is added here. Keep the business configuration and owner subject allowlist server-side and outside the public asset output.

Adapt the schema into the supported root `db/schema.ts` and `drizzle/*.sql` plus matching `drizzle/meta` journal/snapshots. `agenda/migrations/0001_agenda.sql` is the local pinned schema and is not automatically discovered by the Site publisher. Preserve every CHECK, index, assertion table and complete overlap trigger. Do not split SQL on every semicolon: trigger bodies contain internal statements. Production migration application is separate from request handling; it must finish before enabling routes. Once applied, migrations and matching metadata are immutable. Append subsequent migrations instead of rewriting applied history.

The factory should obtain a `D1Store` from the verified `DB` binding, create the domain with a complete verified production configuration, create the durable SQL rate limiter and supply exact allowed origins. Its transport mode must match `service.configurationMode`. Incomplete configuration, missing owner identity or fixture mode must keep every API unavailable. Hosted fixture data is forbidden.

## Identity boundary

The Sites dispatcher supplies `oai-authenticated-user-id` and email for signed-in visitors; anonymous public visitors receive neither. The subject is stable per Site and differs from the access-policy account ID. Only the explicitly verified dispatcher adapter may consume that identity. Generic Node requests and caller-supplied headers remain untrusted. Authorization uses an exact server-side subject allowlist, never an email, first visitor or client role.

For the protected administrator surface, a Site adapter can offer a top-level link to `/signin-with-chatgpt?return_to=/admin.html` with `target="_top"`. Do not initiate it with fetch, prefetch or a client router; dispatch owns that route. The owner must sign in and approve assigning their verified Site subject. Successful sign-in alone does not grant administrator rights. No subject-discovery or administrator-bootstrap endpoint exists in this module, and no owner was assigned by this increment.

## Evidence still needed for activation

The publisher must verify the packaged archive, all existing assets, anonymous public booking authorization, missing/unapproved/approved administrator identities, real D1 atomic collision and retry behavior, and hosted schema/backup recovery. Current D1 tests use a structural double and do not prove remote integration. The private backup destination and remote restore procedure remain unresolved; SQLite restore tests do not execute a D1 recovery operation.

Business facts remain pending: services, NIO prices, durations/buffers, eligible named staff and shifts, lead/cancel policies and verification timestamp. Email remains disabled until an approved sender, transport and runner exist. Capability expiration/revocation and record retention need a policy. The proposed module license needs the owner's selection. Human review of the exact mobile/desktop result and release authorization are separate from this draft PR.

These requirements come from the Sites `sites-building` references for starter capabilities, persistence/storage and authentication, read on 2026-10-04, plus the publisher's read-only inspection. They are a handoff, not an assertion that hosting was executed.
