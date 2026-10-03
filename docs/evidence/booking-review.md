# Reservation demo evidence

Baseline: `0755fce62688e380a737db9e267bad22e35acf25`, the real approved app on PR #2. This replaces prior screenshot baselines for the booking increment only. The implementation is in a fresh clone on `feat/reservation-demo`; the older local checkout was inspected read-only and left unchanged.

Working directory: repository root. Date: 2026-10-03. Local environment: Windows, Node v24.18.0, npm 11.17.0, installed Chrome driven by locked Playwright 1.63.0. Node's version is slightly below the repository's 24.19.0 pin; record this local limitation rather than changing the runtime contract. CI retains the pinned version.

## Commands and observed results

- `npm ci --ignore-scripts`: exit 0, 126 locked packages installed, no dependency changes. Engine warning for local Node patch level.
- `npm run lint`: exit 0 after formatting; HTML validation passed.
- `npm run build`: exit 0; explicit allowlist contains both booking modules and unchanged approved assets.
- `npm test`: exit 0, 15/15 static/model tests passed.
- `npm run check:budgets`: exit 0 after reducing bootstrap text; the same 6 KiB initial-script ceiling and 400/550 KiB transfer ceilings remain.
- First restricted baseline recording: failed in Playwright video finalization with `browserContext.close: spawn EPERM`. Retried with ordinary reviewed execution permission; no browser security setting was weakened.
- Baseline capture retry with `CHROMIUM_PATH` and `UI_BASELINE_URL=http://127.0.0.1:4174`: exit 0, both real baseline browser cases passed.
- Full browser verification and independent review: pending while this record is being prepared; exact outcomes will be recorded before delivery. Do not infer a pass from implementation or screenshots.
- Lighthouse: not run for this increment. The existing environment/browser-verification blocker remains outside task scope and is not called green.

## Capture procedure

The baseline is a separate detached checkout at the SHA above, built with its own original script and served at `http://127.0.0.1:4174`. The implementation build is served at `http://127.0.0.1:4173`. Playwright uses the actual pages, waits for local fonts, scrolls authentic cards into view, asserts the photos are loaded, returns to the hero, and captures full-page PNGs. No generated/reconstructed before image is used.

After captures include the hero/full page, service selection, time selection, editable review, closed Tuesday, fully occupied example Thursday and final simulation outcome. Main journey tests use 390×844 and 1440×900. Reflow checks also use 320×568 at 100% and 200% text, with reduced motion. PNGs and real Playwright WebM recordings are stored in `.private-evidence` and `test-results`; CI uploads these as commit-bound artifacts. Videos may be scaled by Playwright but depict the real viewport and interactions.

The deterministic demo clock in booking tests is `2026-10-03T15:00:00Z`, 09:00 in America/Managua. Production UI instead uses the actual business-local current day/time. The fixture includes no personal data. Telephone/directions are inspected or intercepted during tests; no call or message is sent.

Remaining acceptance: exact-head automated results, independent code/evidence review, then the user's visual review of the private preview. None of these authorize merge or public deployment.
