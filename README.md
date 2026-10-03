# La Barbería Masaya

The approved **round-two option 2, contundente** hero and subsequently selected monochrome **El local** grid are implemented as semantic HTML/CSS. This is the first private working increment of the website, not the full website or a public launch.

Canonical repository: https://github.com/Suazo-AI/la-barberia-masaya.

Read [START-HERE](START-HERE.md), [AGENTS](AGENTS.md), [SPEC](SPEC.md), [decisions](docs/decisions.md), [asset provenance](docs/assets.md) and [actual evidence status](docs/evidence/hero-review.md).

## Run locally

Requires Node **24.19.0** (see `.nvmrc`) and the locked dev dependencies. No runtime framework or application JavaScript is shipped.

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

The preview serves `dist/` at `http://127.0.0.1:4173` by default. `HOST` and `PORT` can select an authorized internal review interface. This server is for local review, not a production host. It serves no source/research directories.

### Approved media

On 2026-10-03 the user explicitly confirmed permission to use the photos and create referenced images of the premises for this project. The five optimized WebP files for the two selected historical-photo-derived scenes are in `src/assets/images`, with provenance in [the asset ledger](docs/assets.md). Raw Maps screenshots, competitor references and raster concepts stay excluded from Git.

The build fails clearly if the approved assets are unavailable; it never replaces the selected room with fabricated content. `HERO_ASSET_DIR` can point to an authorized alternate local copy of the same assets. Permission to use images does not approve public website deployment.

## Checks

| Command | Purpose |
| --- | --- |
| `npm run lint` | Prettier + semantic HTML validation |
| `npm test` | Static built-page content/privacy/provenance/license assertions |
| `npm run build` | Explicit-allowlist build; requires authorized local scene |
| `npm run check:budgets` | Gzip budgets, largest responsive image, zero app JS |
| `npm run test:e2e` | Real Chromium responsive/navigation/no-JS/privacy checks |
| `npm run test:a11y` | Axe WCAG A/AA scan at mobile + desktop |
| `npm run check` | Static + browser/axe checks against the built output |
| `npm run test:performance` | Three cold-profile, pinned mobile Lighthouse lab runs (R-12) |
| `npm run format` | Format source/config/test files |

Tests intercept call activation and never place a call. Browser executable: `CHROMIUM_PATH` if set, otherwise installed `/usr/bin/chromium`, otherwise Playwright's installed browser. Browser installation is not assumed. The authoring executor blocks browser process sockets; the same tests run in the authorized GitHub Actions runner. Exact-head CI has passed 12 browser tests including accessibility, enlarged text, gallery loading and actual DPR1/DPR2 requested-resource budgets. See [evidence](docs/evidence/hero-review.md) for provenance and remaining gates.

The HTML validator's `tel-non-breaking` rule is disabled because the approved anchor label is a sentence, not a space-separated phone number. The exact `tel:` destination has a deterministic test. Lowercase doctype follows Prettier's HTML output.

## Scope and release

- Approved hero and premises grid, responsive styles, accessible core links, a local 404, truthful draft metadata and source/license records
- No speculative below-fold sections, pricing, booking backend, WhatsApp, forms, tracking or CRM
- The page is `noindex`; this is not access control. The internal review host is not shared publicly
- Human review of the actual desktop/mobile rendering is still required. Host/domain, final content, independent review and explicit release approval remain open
- Baseline main `e74e58622c715b1618c543496b5b680d1bd875f6` contained only a README. There is no prior app screenshot to fabricate
- The least-privilege GitHub check workflow has run successfully; the PR’s current exact-head status is authoritative. A separately pinned Lighthouse stage is now added to complete R-12. It uses the approved images at `src/assets/images`. No Mistakes remains inactive. No merge, automatic deployment or production workflow is enabled
