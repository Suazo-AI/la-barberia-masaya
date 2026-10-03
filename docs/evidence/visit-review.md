# Visit section review — 2026-10-03

Baseline: real app `a2bf856af6d57775ee1750a58a8ff6a95b7f1745`.

## Implementation

Original dark two-column visit panel, Anton/Barlow typography, semantic address and seven-day definition list. One verified outbound Maps link; no embed, location request, API or third-party load on entry. One hero call action retained unchanged. The premises grid is static; approved Obsidian engine remains in source but inactive until authentic review/cut material is supplied. Four historical Obsidian browser cases are explicitly skipped, not counted as current passes.

## Evidence

At `/workspace/scratch/14cff504045e/la-barberia-ui-components` on 2026-10-03:

- `npm run lint`: exit 0, Prettier and semantic HTML validation
- `npm run build`: exit 0, allowlist static build
- `npm test`: exit 0, 8/8 static tests
- `npm run check:budgets`: exit 0; initial asset estimate 387729 gzip bytes, under 409600
- `npm run test:e2e`: exit 1 before browser checks, Chromium process singleton `socket() failed: Operation not permitted`. This is a local runner block, not successful rendering evidence
- Exact-head CI browser screenshots, WebM and independent visual review: pending. Workflow captures the real pre-visit baseline and current version at 390×844 and 1440×900. Test manifests retain source commit, viewport, route and capture procedure
- Lighthouse retains the previously documented environment limitation; do not report a measurement where none exists

Human visual acceptance and public release remain separate gates. No merge or public deployment performed.
