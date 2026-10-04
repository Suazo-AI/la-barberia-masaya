# La Barbería Masaya

Website-only pilot. Canonical public repository: https://github.com/Suazo-AI/la-barberia-masaya.

Current authorized increment, 2026-10-04: [persistent portable agenda MVP](docs/agenda/spec.md), from `181bc7e1f379d195aea0c06e6d56e2ac75d5886e`. Standard TypeScript/SQLite domain with Node and Workers/D1 adapters, persistent booking/walk-in/block flows, scoped authorization, atomic conflict prevention, disabled notifications and a tested private backup path. Business configuration and host administrator identity remain prerequisites for activation. No merge/backend deployment or actual notification is authorized. Earlier historical no-backend statements below are superseded for this implementation only.

Earlier verified application source: `f321ab9c0db256fed92682ccad08ae15b552a628`. [Verification/review](docs/evidence/agenda-review.md), [actual before/after PNGs and videos](docs/evidence/agenda/README.md), [remaining hosted-backend integration](docs/agenda/hosting-handoff.md). Local full check passed; the exact application-source CI retains the documented Lighthouse/Chrome environment failure. PR #2 stays draft, with no backend activation or merge.

Cloud-only continuation from `f321ab9c0db256fed92682ccad08ae15b552a628`: [source-only Sites integration candidate](docs/agenda/sites-candidate.md) adds a separate Worker/assets build and generated D1 migration package. Reload guards prevent blind new writes after a document loses an unresolved mutation; administrative fetches have a deadline. No PC work, remote branch replacement, owner grant, actual business configuration or deployment is part of this candidate. Live D1 recovery and exact-browser visual acceptance remain separate gates.

1. Read [AGENTS.md](AGENTS.md) for scope and publication boundaries
2. Read [SPEC.md](SPEC.md) v0.6 and the [current agenda spec](docs/agenda/spec.md); section 10 describes the historical reservation demo
3. Read [docs/decisions.md](docs/decisions.md) and [docs/sources.md](docs/sources.md) for decisions and asset rights
4. See [README.md](README.md) for current commands and [docs/evidence/hero-review.md](docs/evidence/hero-review.md) for actual verification status

## State, 2026-10-03

Latest presentation/profile increment, 2026-10-04: the marked masthead is removed; the three exact review excerpts keep their source, attribution, dated observation and selection qualification. Anonymous example barber profiles expose an optional portfolio inside the existing dialog. Real identities/photos/work are absent and no general business photograph is attributed to an individual. [Profile requirements](docs/barber-portfolios.md) record the pending reservation-production decision; fictional prices and slots retain their existing disclosure.

Latest increment: [reservation demo](docs/booking-demo.md), implemented from the exact approved app at `0755fce62688e380a737db9e267bad22e35acf25`, rather than README-only main. Hero **Reservar cita** opens three accessible steps with fictional services/prices/professionals/slots and an unequivocal simulation outcome. Real contact stays secondary. No personal data, backend, payment, storage or actual reservation. [Booking evidence](docs/evidence/booking-review.md) records checks and review limits. PR #2 remains draft; the parent controls private preview updates. Historical states below describe previous increments.

- The user selected the contundente hero and authorized continuing the website end to end with creative explanations and human-guided references for unresolved sections
- That choice supersedes the old hero03/docs-only hold from draft PR #1
- Baseline `main` is `e74e58622c715b1618c543496b5b680d1bd875f6`, independently read on 2026-10-03: README only, no prior app. There is no legitimate “before” app screenshot
- Work is isolated on `feat/approved-contundent-hero`; previous uncommitted research and concepts are preserved and excluded from public Git
- This increment includes the approved hero, the subsequently selected monochrome “El local” grid, and the static foundation. Visit/contact treatment remains pending
- The user confirmed permission to use the photos and create referenced derivatives for this project on 2026-10-03; only the selected optimized scene is included
- Hero + gallery application at remote `38fa3a0dd54b885aebb53437938ca1f67bfc356e` passed exact-head CI and independent source/visual review. Later changes are verification/documentation only unless explicitly recorded; user visual acceptance remains separate
- No merge, deployment, official-launch claim, CRM or booking backend. No Mistakes remains inactive

## Current component trial

Requested 2026-10-03: editorial entrance, blur reveal, wipe CTA and a real Obsidian Art Gallery trial. Integration is described in [docs/ui-components.md](docs/ui-components.md). The pre-component baseline is now the real app at `3dbff80204c72754959b39966620146704b5233b`; new before/after evidence must use it, not the initial README-only baseline.

## Visit panel increment, 2026-10-03

The next private increment adds the selected Stockers-inspired visit panel with the exact Maps place ID, observed address and seven-day weekly hours. The source is explicitly dated 2026-10-03; no live opening status or owner-confirmation claim. Local photographs remain a static grid. The approved Obsidian engine is retained but disabled in the page until authentic haircut photographs and reviews are available, per the user's latest content direction. No fabricated content is substituted.

Current before/after baseline: `a2bf856af6d57775ee1750a58a8ff6a95b7f1745`. See [visit review](docs/evidence/visit-review.md) for checks and outstanding gates.

## Authentic content increment, 2026-10-03

Latest working section: “Cortes y reseñas”, two original business Instagram photos and three short attributed Maps review excerpts. The approved Obsidian effect now uses those five sources, while the premises grid and visit panel are unchanged. Baseline is `c5dd0b9e1cc16f23ec00e0123ce91d4b291438cb`. See SPEC section 9 and the latest sources entry; these supersede the content-pending status above. Exact-head CI/render review is required; Lighthouse's existing environment blocker is not being debugged and must not be called green.
