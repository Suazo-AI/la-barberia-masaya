# Acceptance criteria and evidence

Latest increment, 2026-10-03: the explicitly authorized reservation demo changes the call-only/no-booking UI assumptions below. [B-01 through B-10](booking-demo.md) define the current behavior; [booking evidence](evidence/booking-review.md) records its actual checks and baseline. No personal-data collection, backend, payment, storage or real appointment is permitted. Existing asset/content/privacy requirements remain in force. Native modal focus confinement is intentional while open; Escape and closing restore focus.

Status updated 2026-10-03: full-MVP requirements below remain stable. This hero increment checks the relevant subset; exact outcomes are in [hero review evidence](evidence/hero-review.md). Unimplemented directions/hours, production metadata and release are explicitly pending, never claimed passed. R-02 visible phone display is assigned to the future contact section; the approved hero has exactly one textual CTA and no extra number chip. Automated checks do not establish human visual acceptance or image provenance.

The baseline is README-only main at `e74e58622c715b1618c543496b5b680d1bd875f6`; no previous app exists to screenshot. Capture genuine after evidence. There is no animated interaction: motion video is not applicable, and no fake video may be created. A short real keyboard/link recording can document the interaction. The user confirmed this project’s photo permission on 2026-10-03; only selected authorized image derivatives and implementation evidence may enter public CI/Git. Raw Maps/competitor references remain excluded.

## Requirement-to-check matrix

| ID | Requirement / observable acceptance | Check and evidence | Owner / task |
| --- | --- | --- | --- |
| R-01 | Correct business: name, address, phone and Maps destination all match the approved candidate | Source-ledger review; signed-off content diff with source IDs; independent destination inspection | Content reviewer / T-01, T-04 |
| R-02 | Call action uses the approved E.164 `tel:` URL and visible readable number; selecting it never claims an appointment was made | Deterministic DOM/URL assertion on every call link; manual mobile affordance check without placing a call | QA / T-05, T-06 |
| R-03 | Directions action targets the approved business pin/listing; textual address/phone remain usable without Maps | Deterministic exact destination/URL assertion; separate manual Maps target inspection; no live external click required in CI | QA / T-05, T-08 |
| R-04 | Spanish page has `lang="es"`, one clear H1, semantic landmarks, logical headings, working section links, and no unsupported marketing claims | Build/DOM assertions, Spanish content review, all internal href/asset paths resolve | Reviewer / T-04 through T-06 |
| R-05 | Hours render the seven-day approved schedule in local time, including Tuesday closed; otherwise the entire schedule is absent and the approved fallback appears | Unit/fixture tests for confirmed and omitted hours; content snapshot; no date-dependent “open now” state | QA / T-04, T-06 |
| R-06 | Core content and actions work without JavaScript, at 320–1440 px, at 200% zoom, and without horizontal overflow | Browser tests at 320×568, 390×844, 768×1024, 1440×900; JS-disabled run; manual zoom/reflow check | QA / T-05, T-06 |
| R-07 | Keyboard-visible focus, skip link, meaningful link names, appropriate alternative text, accessible color contrast, and no blocked/obscured targets | Automated accessibility scan with zero serious/critical findings; manual keyboard and screen-reader spot check; contrast measurements | Independent reviewer / T-06 |
| R-08 | Touch targets at least 44×44 CSS px for primary/navigation controls; motion respects reduced-motion preference; no autoplay, focus trap or gesture-only action | Bounding-box assertions; reduced-motion browser run; manual tab sequence and touch review | QA / T-05, T-06 |
| R-09 | No data forms, tracking, cookies, third-party embeds, outbound requests on initial load, secrets or private records in build/source | Request interception with local-asset allowlist; storage/cookie assertions; repository and built-output secret/privacy scan plus human diff review | Independent reviewer / T-06 |
| R-10 | Every image/logo/font is original, owned or licensed for this use; no fabricated business photos/testimonials | Complete asset ledger and license/permission references; check built assets match approved entries | Content reviewer / T-04, T-06 |
| R-11 | Lean page: zero application client JS unless separately approved; HTML+CSS compressed total ≤75 KiB; initial-page local assets compressed total ≤400 KiB | Reproducible built-output size script; declared gzip method/tool versions; explicit dimensions for images | QA / T-02, T-06 |
| R-12 | Lab performance target: median mobile LCP ≤2.5 s, CLS ≤0.1, and Lighthouse performance ≥90 over three runs in pinned lab conditions | Store Lighthouse JSON with tool version, throttling, environment, and commit. Investigate misses; do not silently waive. Lab scores are diagnostic, not a field-speed guarantee | QA / T-06 |
| R-13 | Approved title/description, canonical, social card, favicon, robots and sitemap behavior; no fabricated structured business/review data | Built-output assertions for approved production URL/base path; metadata preview. Preview noindex only after host choice and never treated as access control | QA / T-06, T-08 |
| R-14 | Reproducible clean install/type-check/build/test pipeline and lockfile; no failing required checks | CI logs/artifacts bound to exact commit; validate config parsing and package scripts | Integrator / T-02, T-06 |
| R-15 | Independent reviewer reports no unresolved release-blocking issues; Jason approves mobile and desktop visuals at exact commit | Review record and dated visual approval with screenshots/preview reference | Reviewer + Jason / T-07 |
| R-16 | Release serves expected artifact/commit over HTTPS with functional links, no mixed content, and rollback instructions | Deployment provenance, smoke-test report, observed URL/time, rollback command/procedure tied to host | Release operator / T-08 |

Accessibility direction is WCAG 2.2 AA. Contrast must meet applicable text/non-text criteria (at least 4.5:1 for normal text, 3:1 for large text and required UI distinctions). The automated scan plus spot checks are useful evidence, not proof of full WCAG conformance. 44 px control targets are this project's usability target.

## Test implementation contract

After stack approval, define and document these scripts or equivalent commands in the README: `check`, `lint`, `test`, `build`, `test:e2e`, `test:a11y`, and `check:budgets`. Do not claim they exist before T-02 implements them. Keep dependency/toolchain versions pinned through the lockfile and a runtime version declaration; CI installs from the lockfile.

The deterministic suite covers approved content fixtures, omission states, rendered markup, URL destinations, size budgets, same-origin requests, and navigation. Freeze locale/timezone and known data. Avoid external network availability as a required CI dependency. Real Maps destination verification and the target-device call affordance are distinct manual checks, not simulated successful calls.

Run the production build under test, not only the development server. Cover repeated clicks, anchors, Back/Forward history, no-JS behavior, reduced motion, long text, omitted hours/media, unavailable external applications, and 404 navigation. There is no login, booking overlay, menu drawer, or submission flow to test unless scope changes.

## Evidence record for each task / PR

Every report supplies:

- `DONE`: requirement IDs actually met
- `FILES_CHANGED`: concise paths and purpose
- `TESTS_RUN`: exact commands and PASS / FAIL / BLOCKED / NOT RUN
- `EVIDENCE`: commit SHA, CI run/artifact URLs, screenshots and relevant logs
- `BLOCKERS`: failed checks, approvals, or verification limits
- `NEXT_RECOMMENDED_ACTION`: one concrete next step

Evidence belongs to the tested commit. New edits or conflict resolution invalidate affected checks and visual approvals until rerun. Preserve private credentials and personal information outside logs/artifacts. Agent assertions, PR-body attestations, and screenshots alone cannot prove CI executed.

## Release decision

Release is blocked by incorrect/unapproved identity or contact details; an unlicensed asset; broken primary actions; keyboard/touch failure; serious/critical accessibility findings; secret/privacy exposure; an unexplained performance-budget miss; missing required CI; or missing independent/human approval. Lower-severity deviations need an explicit recorded decision, impact, owner and follow-up, and may not waive privacy/rights requirements.

The release report distinguishes passed checks, failed checks, blocked checks and checks never run. It states the exact deployed commit and any remaining known limitations. No checklist establishes that the site has zero bugs.
