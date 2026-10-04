# Presentation and barber portfolio verification

Application source: `4bc86aa49839eb1f9e644899545fbbdd8493744a`. Before source: `df506167b67381be285220680ce2346101bae5b9`. [Requirements P-01 through P-07](../barber-portfolios.md) and [real PNG/WebM evidence](barber-portfolios/README.md).

## Actual execution

2026-10-04, repository root, local Node 24.18.0 (declared toolchain remains 24.19.0), locked Playwright 1.63.0 and installed Chrome 154.0.8037.93:

- `npm run check`: exit 0; lint/HTML validation/build/budgets, 15/15 static/model and 32/32 browser checks, no skips. This run was immediately before the sole final source change: a gallery instruction explaining that it repeats the same two photos and three reviews.
- After that source clarification: lint/HTML validation/build/static/budgets and `playwright test tests/motion.spec.mjs --grep "authentic Obsidian interaction"`: exit 0; 15/15 static and 2/2 affected real-gallery browser checks, including axe, at mobile/desktop.
- The four new profile checks cover 390x844 and 1440x900 selection/back/Escape/close/reopen, same-professional slot preservation versus different-professional invalidation, 320x568 at 200% text with reduced motion and keyboard confinement, and on-demand loading of a synthetic SVG test fixture. No real business image is assigned to an example individual. No cookies, storage or network submission was observed.
- Real capture commands for both source builds: exit 0; 26 selected PNGs and four WebMs. Their SHA-256 values are recorded in the public manifests. The captured states are the actual pending-profile UI, not the test's synthetic portfolio fixture.

Budgets: initial bootstrap 6,093 bytes (6 KiB limit); optional booking/model 20,113 bytes (24 KiB limit); modeled core gzip 393,522 bytes (400 KiB limit); modeled full page including lazy booking/photos 523,276 bytes (550 KiB limit). No dependency or ceiling was added/raised.

## Independent review

The independent read-only reviewer compared the exact committed source with the reviewed working tree, and the three rendered review quotes, author names and href values with the real `df50616` baseline. It verified actual Chrome behavior at 390x844, 1440x900 and 320x568/200% text/reduced motion: portfolio focus and returning-button focus remain visible and unobscured, keyboard boundaries stay in the single dialog, Escape returns before closing, changing to another barber clears the slot, choosing the same barber preserves it, and closing within the portfolio/reopening resets the service. It observed only local GET requests, no errors and no cookies/storage. No functional blockers were observed in that scope.

One concrete review finding was fixed before commit: the shortened static work note had removed the disclosure that Obsidian repeats its five sources. A concise equivalent now appears in the instructions visible when opening the gallery. Quote text, real author names, individual scores, aggregate snapshot and original source URLs remain unchanged.

The reviewer measured the 320px/200% portfolio heading within y136.39–430.77 and the returning action within y223.81–343.19, with no overlay. Automatic portfolio axe audits report zero violations; incomplete contrast items and the known limits below remain. Human visual approval is separate from technical independent review.

The reviewer also inspected all 26 selected screenshots, independently verified SHA-256 and sizes for all 30 artifacts against the manifests and original private captures, and decoded all four videos. Total selected artifact bytes: 17,571,644. Recording dimensions remain 390x844 and 1440x900; before durations are 8.12/8.76 seconds and after durations 9.96/10.52 seconds. No visible blockers were observed in those captured states.

## Remaining dependencies

Real names/portraits/attributed work have not been supplied; the new profile/portfolio examples remain honestly labeled. The user requests that only those details be mock eventually, but confirmed there is no agenda and WhatsApp is inactive. The parent is resolving real service prices/durations and the booking strategy. The existing reservation simulation/disclosures are therefore retained; it never creates or sends an appointment. No backend/provider, merge, public deployment or production-readiness claim is part of this increment.

Actual Safari/iOS and a screen reader were not tested locally. Lighthouse remains the existing Chrome ownership/permission verification blocker, not a performance pass. The parent owns the private preview update and the user-facing review.
