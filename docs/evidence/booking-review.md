# Reservation demo evidence

Baseline: `0755fce62688e380a737db9e267bad22e35acf25`, the real approved app on PR #2. This replaces prior screenshot baselines for the booking increment only. The implementation is in a fresh clone on `feat/reservation-demo`; the older local checkout was inspected read-only and left unchanged.

Working directory: repository root. Date: 2026-10-03. Local environment: Windows, Node v24.18.0, npm 11.17.0, installed Chrome 154.0.8037.93 driven by locked Playwright 1.63.0. Node's version is slightly below the repository's 24.19.0 pin; record this local limitation rather than changing the runtime contract. CI retains the pinned version.

## Commands and observed results

- `npm ci --ignore-scripts`: exit 0, 126 locked packages installed, no dependency changes. Engine warning for local Node patch level.
- `npm run lint`: exit 0 after formatting; HTML validation passed.
- `npm run build`: exit 0; explicit allowlist contains both booking modules and unchanged approved assets.
- `npm test`: exit 0, 15/15 static/model tests passed.
- `npm run check:budgets`: exit 0 after reducing bootstrap text; the same 6 KiB initial-script ceiling and 400/550 KiB transfer ceilings remain.
- First restricted baseline recording: failed in Playwright video finalization with `browserContext.close: spawn EPERM`. Retried with ordinary reviewed execution permission; no browser security setting was weakened.
- Baseline capture retry with `CHROMIUM_PATH` and `UI_BASELINE_URL=http://127.0.0.1:4174`: exit 0, both real baseline browser cases passed.
- `npm run check` with `SOURCE_COMMIT=75a055ef86cc419937aa591d25fa673a65c6d950`, `CHROMIUM_PATH` and the real baseline URL: exit 0, 15/15 static/model and 28/28 browser cases, no skips. Full regression included responsive, keyboard/history, no-JS, 200% text, real photo loading, Obsidian/context loss, visit facts and all booking panels.
- Mobile Editar sizing and motion/visit manifest baseline corrected in `7f11699`; lint/build/budgets and the 16 affected booking/motion/visit cases passed, exit 0.
- Independent review found focused stage headings outside the viewport at 320px/200% text. Source `5fdedba2500cda2227a087f74c57138f37c9d010` reveals them when needed and adds actual heading bounds assertions. Lint/build/budgets and all 7 final booking cases passed, exit 0. Separate real-baseline recapture: 2/2 passed, exit 0.
- Final selected [PNG/WebM evidence and sanitized results](booking/README.md) are publicly reviewable. After captures identify source `5fdedba`; before identifies `0755fce`. Final follow-up changes only evidence/documentation, preserving the tested application source.
- Lighthouse: not run for this increment. The existing environment/browser-verification blocker remains outside task scope and is not called green.

## Capture procedure

The baseline is a separate detached checkout at the SHA above, built with its own original script and served at `http://127.0.0.1:4174`. The implementation build is served at `http://127.0.0.1:4173`. Playwright uses the actual pages, waits for local fonts, scrolls authentic cards into view, asserts the photos are loaded, returns to the hero, and captures full-page PNGs. No generated/reconstructed before image is used.

After captures include the hero/full page, service selection, time selection, editable review, closed Tuesday, fully occupied example Thursday and final simulation outcome. Main journey tests use 390×844 and 1440×900. Reflow checks also use 320×568 at 100% and 200% text, with reduced motion. PNGs and real Playwright WebM recordings are stored in `.private-evidence` and `test-results`; CI uploads these as commit-bound artifacts. Intentionally selected originals are also committed in [booking/](booking/README.md), with SHA-256 manifests. Videos may be scaled by Playwright but depict the real viewport and interactions.

The deterministic demo clock in booking tests is `2026-10-03T15:00:00Z`, 09:00 in America/Managua. Production UI instead uses the actual business-local current day/time. The fixture includes no personal data. Telephone/directions are inspected or intercepted during tests; no call or message is sent.

## Independent review and limits

A separate agent reviewed `0755fce..75a055e`, then the corrections through `5fdedba`, using read-only source/evidence inspection and its own real Chrome browser check. Three concrete findings were addressed: stale baseline metadata, narrow Editar label, and focused heading outside the 320px/200% viewport. It observed no remaining functional blockers in the reviewed scope. Its final 320px/200% check, exit 0, measured headings fully inside the 568px viewport without an overlay; next-date focus was also visible. This is independent technical review, not the user's visual approval.

Automated axe reports contain zero violations; incomplete contrast checks and actual Safari/iOS/screen-reader testing remain limitations. The declared palette was independently checked (ivory/ink about 16.47:1, muted/ink about 9.65:1), not every possible composite pixel. Asset report: initial bootstrap 6,093 bytes within 6 KiB; booking modules 16,484 bytes, loaded on demand; modeled core gzip 393,420 bytes within 400 KiB; modeled full page including booking gzip 522,238 bytes within 550 KiB. Browser request tests separately verify the original initial/full-page transfer bounds and same-origin-only requests.

Remaining acceptance: current exact-head CI outcomes and the user's visual review of the private preview, including their actual iOS device. Lighthouse remains the inherited blocker rather than a pass. The parent owns private preview updates. No merge or public site deployment occurs.
