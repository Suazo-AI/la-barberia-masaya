# Real presentation and portfolio captures

Before: `df506167b67381be285220680ce2346101bae5b9`, built from its exact Git archive on local port 4175. After: `4bc86aa49839eb1f9e644899545fbbdd8493744a`, the published application source on port 4173. These are actual Chrome 154.0.8037.93 screenshots and recorded actions, not design mockups. Later evidence-only commits do not change the application. The [before manifest](before-manifest.json) and [after manifest](after-manifest.json) record source, viewport, URL, capture method and SHA-256 for every PNG/WebM.

| State | Before mobile, 390x844 | After mobile, 390x844 | Before desktop, 1440x900 | After desktop, 1440x900 |
| --- | --- | --- | --- | --- |
| Full page | [PNG](before-page-390.png) | [PNG](after-page-390.png) | [PNG](before-page-1440.png) | [PNG](after-page-1440.png) |
| Hero / removed masthead | [PNG](before-hero-390.png) | [PNG](after-hero-390.png) | [PNG](before-hero-1440.png) | [PNG](after-hero-1440.png) |
| Exact reviews / clearer sources | [PNG](before-reviews-390.png) | [PNG](after-reviews-390.png) | [PNG](before-reviews-1440.png) | [PNG](after-reviews-1440.png) |
| Review in optional gallery | [PNG](before-gallery-review-390.png) | [PNG](after-gallery-review-390.png) | [PNG](before-gallery-review-1440.png) | [PNG](after-gallery-review-1440.png) |
| Optional barber selection | [PNG](before-barbers-390.png) | [PNG](after-barbers-390.png) | [PNG](before-barbers-1440.png) | [PNG](after-barbers-1440.png) |
| Pending personal portfolio | No existing view | [PNG](after-portfolio-390.png) | No existing view | [PNG](after-portfolio-1440.png) |
| Choose this barber | No existing view | [PNG](after-barber-selected-390.png) | No existing view | [PNG](after-barber-selected-1440.png) |
| Escape returns from portfolio | No existing view | [PNG](after-portfolio-return-390.png) | No existing view | [PNG](after-portfolio-return-1440.png) |
| Actual actions / gallery motion | [WebM](before-flow-390.webm) | [WebM](after-flow-390.webm) | [WebM](before-flow-1440.webm) | [WebM](after-flow-1440.webm) |

The capture clock is 09:00 in Managua on 2026-10-03; the actual interface follows the current local date/time. The recorder uses the stated viewport and may scale its recording. No frames are synthesized. Photos in the page are the existing business photographs, with their sources and provenance preserved. Personal profiles use neutral icons and visible pending-photo labels; their actual portfolios are empty. The synthetic SVG used only by the lazy-loading test is excluded from these captures and the shipped application.

[Checks](checks.json) distinguish the full 15-static/32-browser run from the final repeat of lint/build/static/budgets and two affected gallery checks after the single review-driven instruction clarification. [Mobile portfolio axe](portfolio-axe-390.json) and [desktop portfolio axe](portfolio-axe-1440.json) show no automatic violations; incomplete items remain available for review. [Budgets](budgets.json) retain the original ceilings, including the 6 KiB bootstrap and 24 KiB optional booking modules. Full details: [independent-review and evidence record](../barber-portfolios-review.md).

Only the selected website UI, existing public business content and sanitized metadata are included. The user's marked screenshot and Library reference remain private. This evidence folder is excluded by the build allowlist. Actual Safari/iOS and a screen reader were not tested. Lighthouse retains its inherited Chrome permission-verification blocker. Real booking facts/integration and public launch remain pending; these captures do not establish production readiness, real appointment availability or full WCAG conformance.
