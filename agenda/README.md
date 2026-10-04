# Portable agenda

Persistent single-business agenda with a TypeScript domain, SQL invariants and separate storage/HTTP adapters. Requirements are in [the specification](../docs/agenda/spec.md). No framework or runtime npm dependency is needed. Node 24.19.0 is the pinned local runtime; D1 is a candidate hosting adapter and has not been deployed or tested remotely.

## Local use

From the repository root:

```sh
npm ci --ignore-scripts
npm run build
npm run agenda:local
```

The default server binds `127.0.0.1:4183`. With the checked-in incomplete configuration, all booking APIs are unavailable and the site explains that the agenda needs configuration. It does not publish sample prices or slots.

To exercise persistence with explicitly fictional data, in PowerShell:

```powershell
$env:AGENDA_MODE = 'fixture'
npm run agenda:local
```

Visit `/` for the reservation flow, `/manage.html` through the private link issued for one booking, and `/admin.html` for the local administrator. Fixture mode supplies a server-side local principal only on loopback; it refuses a production process and is never enabled in the Worker adapter. Services, prices, staff, shifts and policies in this mode are invented test data, not business facts. No emails are sent. Optional customer fields are disabled in fixture UI; use only synthetic test data through developer tests.

The SQLite file is `.local-agenda/fixture.sqlite`, retained across restarts. `AGENDA_DB` may select a file inside an ignored private local directory. `AGENDA_EPHEMERAL=1` and `AGENDA_NOW` are fixture-only test controls; active browser tests use a new private database each run. Neither control can affect production mode.

## Boundaries

| Directory    | Responsibility                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `core`       | Configuration, availability, typed contracts, business rules, idempotency and authorization scopes |
| `migrations` | Unified allocations, overlap triggers, version/assertion guards, audit and outbox                  |
| `adapters`   | Native Node SQLite, structural D1 binding, loopback Node HTTP and host-injected Worker factory     |
| `http`       | Versioned API, trusted identity port, origin/body/query checks and SQL throttling                  |
| `tools`      | Offline backup/restore and explicitly disabled notification runner                                 |
| `fixtures`   | Local/historical fixtures, excluded from hosting adapters and static output                        |
| `tests`      | Real SQLite concurrency/persistence, portable contracts and browser behavior                       |

`createAgendaService(store, config, dependencies)` accepts a SQL adapter and optional clock/ID functions. The Node SQLite and D1 adapters implement the same `SqlStore` contract. `batch` is one transaction and returns SELECT/RETURNING rows by position. A single configured business is served per database/deployment; multi-tenant authorization is outside this MVP. The supported business timezone and currency are currently `America/Managua` and NIO, explicit in the contracts.

Reservations, walk-ins and blocks share `agenda_entries`. Their protected allocated intervals include service buffers. Database triggers reject overlaps atomically, while optimistic versions and SQL assertions reject zero-row updates. An availability read does not hold a slot. Mutations store their original idempotent response with the allocation, audit and disabled outbox record in the same transaction. Reusing a key with a different payload conflicts. The public client retains uncertain requests and reuses their original key, token and reviewed configuration version.

Prices, durations and buffers are server-derived snapshots. The catalog exposes `configVersion`, every mutation must submit that reviewed version, and the active configuration hash/version is guarded inside the transaction. Editing the config file does not silently replace a live database configuration; changing a configured deployment requires an offline migration plan and review.

## Production setup still required

Complete `config.example.json` outside public assets using verified business information, then mark the configuration verified with its verification timestamp and version. Confirm prices in NIO minor units, service durations/buffers, eligible staff, their shifts and lead/cancel policies. The template defaults are inactive examples of configuration fields, not approved policies.

The Worker factory requires host-provided environment access, explicit same-origin settings, a verified `TrustedIdentityResolver` and stable owner subject allowlist. The entire API remains closed until that integration exists. Never derive identity from request headers, the first visitor or a client-provided role. The local runner deliberately does not implement production identity. See [HTTP contracts](http/README.md).

The SQLite schema is portable to D1's SQL engine and its prepared batches; D1 adapter tests use a structural contract double, not a live Cloudflare database. Host access, migrations, owner identity, deployment limits and backup destination need a separately reviewed setup. This increment assumes no Cron, Queues, Durable Objects, rate-limit binding or D1 Time Travel access. The parent controls hosting; nothing in this directory deploys a backend.

Rate counters are atomic SQL global buckets without client IP/customer identifiers. This bounds mutation volume but deliberately trades fairness for privacy: one abusive visitor can exhaust the global bucket. Before public activation, review those limits and supported host abuse controls. No per-client or host rate-limiting capability is claimed.

## Private management and notifications

The browser creates a 32-byte Web Crypto capability for its booking and sends it only in creation JSON or an Authorization header. Storage contains only a scoped SHA-256 hash. The management link carries the capability in a URL fragment, which the management page immediately removes from the address and retains in memory. No token goes into query strings, logs, browser storage or an idempotent response. Treat the link as private; an authorized administrator must help if it is lost. It is not an account or an infrastructure credential.

The default outbox is disabled and the application explicitly says no email was sent. `processOutbox` requires deliberate enablement and an injected approved transport; it does not activate disabled records or provision a runner/provider. Leases, backoff and five-attempt bounds are tested. Delivery is at least once: a provider must deduplicate by stable event ID if a process dies after sending but before acknowledgement. Management capabilities are not retained for later email recovery. Sender/provider/runner approval and retention policy are still setup work; no external confirmation has been sent.

## Backup and restore

`GET /api/agenda/v1/admin/export` is administrator-only and no-cache. It returns a versioned private snapshot from one transaction, including the stored configuration, bookings, blocks, idempotency, audit and outbox. It includes private customer data and capability hashes. Never commit it, put it in `dist`, attach it to public evidence or copy it to an unapproved destination.

Offline CLI examples, with source and destination files inside `.agenda-private`:

```sh
node agenda/tools/backup-cli.ts export .agenda-private/agenda.sqlite .agenda-private/backup-v1.json
node agenda/tools/backup-cli.ts restore .agenda-private/backup-v1.json .agenda-private/restored-new.sqlite
```

Use an actual private copy of the database as the CLI source; the example filename is not created by default. Restore refuses an existing target, validates format/table/column/configuration/hash, recreates the pinned schema in a new database and checks integrity, foreign keys and active overlap constraints. It never overwrites the source database. After a successful drill, independently verify the private restored database before selecting it for a local run or planning a host restore. Tested SQLite export/restore is not a claim that a D1 remote recovery operation was executed.

## Verification and extraction

```sh
npm run typecheck:agenda
npm run test:agenda
npm run test:agenda:e2e
npm run check
```

Concurrency tests use eight real SQLite worker connections, including one-slot races and identical-key races. Backup tests export while another connection writes. Browser tests run the actual local HTTP service with clearly fictional configuration and exercise owner/customer flows, authorization failures, collisions, retries and keyboard/reflow states. Failure-state network interceptions are identified as such.

For future extraction, copy this module's core/schema/adapters/contracts plus selected HTTP tooling and tests, then supply that project's configuration, host identity and UI. Exclude fixture/historical material and this business's images, reviews, fonts and branding. A standalone package/repository has not been created, and an open-source license is [proposed but not applied](../docs/agenda/license-proposal.md).
