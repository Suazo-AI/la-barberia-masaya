# Hero implementation evidence

Observation date: 2026-10-03 UTC. Current scope: selected round-two option 2 hero and static foundation only.

## Baseline and actual result

- Remote `main` independently read through the GitHub connector: `e74e58622c715b1618c543496b5b680d1bd875f6`, README only
- No previous application exists. No “before” implementation screenshot is available or fabricated
- Existing concept mockup is a design reference, not an implementation baseline
- Actual source is semantic HTML/CSS, not a screenshot used as a page
- Source identity: see the isolated branch's latest commit; the private source manifest records SHA-256 for exact application and optimized media bytes
- No public push, merge or deployment performed for this increment

## Commands actually run

Working directory: project checkout unless noted. Node `v24.19.0`.

| Command | Result | Details |
| --- | --- | --- |
| `npm ci --ignore-scripts --cache /tmp/barber-npm-cache --fetch-retries=0 --fetch-timeout=15000` | PASS, exit 0 | Clean temporary directory with exact package.json + lockfile; 19 packages installed. Does not claim a clean application build outside that temporary package-only install directory |
| `npm run lint` | PASS, exit 0 | Prettier and html-validate, final source |
| `npm run build` | PASS, exit 0 | Explicit allowlist; selected local media required and present |
| `npm test` | PASS, exit 0 | 4 static tests: Spanish semantic/copy/tel fixture, no integration/privacy leaks, exact asset bytes, font licenses |
| `npm run check:budgets` | PASS, exit 0 | HTML+CSS gzip 2,659 bytes; fonts 64,465; largest responsive image 223,558; initial worst-case 290,857 bytes vs 409,600 budget. Zero application client JavaScript |
| `npm run test:e2e` | BLOCKED, exit 1 | All 10 tests unable to launch Chromium because AF_UNIX socket creation returns EPERM. No page opened, so these are not application failures or passing tests |
| Approved escalated browser retry with writable temporary Chromium config/cache | BLOCKED, exit 1 | Same AF_UNIX restriction; no security bypass attempted |
| Cloud-browser internal preview | BLOCKED | Documented `http://terminal.local:4173/` route returns 502 connection refused; preview server cannot be reached through that runtime route |
| `npm run check` aggregate | NOT PASSED | Static stages passed; browser stage blocked |
| GitHub workflow | NOT RUN | Workflow prepared with pinned official actions, read-only token permissions and no deployment. Selected media is now included after explicit user permission; remote execution is pending |
| Lighthouse three-run mobile profile | NOT RUN | Not installed; browser runtime unavailable. R-12 remains open |

Initial linter issues (doctype normalization and telephone-label false positive) and static-test metadata duplication were corrected and rerun. Independent review caught the exact research-directory ignore path and a CSP-incompatible test style injection; both are corrected. See current source diff, not these historical failure logs, for final behavior.

## Accessibility and interaction coverage

- Calculated color contrast, using WCAG relative luminance: ivory/ink **16.47:1**, muted/ink **9.65:1**. This is a token calculation, not a browser/axe pass
- Tests are implemented for 320×568, 390×844, 768×1024, 1024×768, 1440×900, 1920×1080; initial CTA visibility, heading overflow, image load, no cookies/storage/external requests, no page errors
- Implemented test routes also cover skip link/focus, repeated intercepted telephone activations, Back/Forward, JavaScript disabled, 200% root text enlargement, reduced motion, missing image and 404 return
- Axe scans at mobile and desktop are implemented but **not run successfully**
- Real desktop/mobile screenshots and keyboard video are **not captured** because no working browser runtime has rendered this source yet. No synthetic mockups are passed off as screenshots
- There is no animation; animation video is not applicable
- No telephone call was placed; a real target-device dialer handoff remains a manual acceptance check

## Remaining gates

1. Reach this exact build in an authorized browser/owner-private review surface; run the prepared browser and axe tests and capture genuine desktop/mobile evidence
2. Independent review of final source and evidence, then user acceptance of actual responsive rendering
3. Photo permission is confirmed; verify source assets and exact-commit CI before accepting the draft PR
4. Select the remaining website sections with the user, then implement/verify them
5. Approve host/domain, final content and release route before merge/public deployment

This is useful implemented work with explicit verification limits. It is not a completed website, a full WCAG conformance assessment, or a passing remote CI run.

## Permission update

2026-10-03: the user explicitly confirmed permission to use the photos and create referenced images for this project. Selected optimized WebP assets are now included; original source screenshots and competitor research remain excluded. The earlier rights hold is resolved for this project, while website deployment and visual acceptance remain open.

## Actual remote browser verification, hero-only baseline

Draft PR: https://github.com/Suazo-AI/la-barberia-masaya/pull/2. Head `a8c874232ed3b44bbbb96f34e68ec5690faad6ff`, tree identical to local reviewed `97e0ac4`. Real GitHub Actions run `37110859234` reached Chromium and executed all tests: **9 passed, 1 failed**. All six standard viewport tests, mobile/desktop axe scans, keyboard/repeated intercepted call links/history and 404 return passed. The enlarged-text case exposed overflow; the following increment constrains the offscreen skip link and adds diagnostic bounds checks. The original aggregate is not considered passed.

Artifact collection initially excluded the dot-prefixed evidence directory; the workflow now enables hidden files only for explicit evidence paths, includes real test videos and failure screenshots, and checks out the exact PR head. No photo mockup is substituted for browser evidence.

## Selected gallery increment

The approved “El local” section uses four portrait monochrome tiles, two authentic-reference enhanced views and two explicitly described CSS details; no customer-work claims or new scene generation. It is a separate change after the hero-only baseline. Five static tests now pass locally. Conservative combined asset budget includes the largest hero image and additional gallery view; actual browser re-verification remains pending for this increment.
