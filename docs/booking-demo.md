# Reservation demo requirements and rationale

Authorized by the user on 2026-10-03: improve the existing reservation process so visitors can choose what they want and a suitable time, implementing mock information. Source baseline is the actual PR #2 app, `0755fce62688e380a737db9e267bad22e35acf25`. README-only main is not a UI baseline. The previous local documentation checkout is preserved; implementation uses a new isolated clone.

## Decisions and sources

| Decision | Owner / status | Reason and source |
| --- | --- | --- |
| Service first, professional inside date/time, review last | User + implementer / implemented | [Booksy's official journey](https://biz.booksy.com/blog/how-to-book-an-appointment) documents service, staff, date, time and confirmation. We group these into three stages and omit personal fields for the authorized demo. |
| Duration and professional occupations determine slots | Implementer / implemented | [Booksy service settings](https://support.booksy.com/hc/en-us/articles/21028092250258-How-do-I-customize-my-service-settings) documents per-service rules and staff assignment. [Square's official booking example](https://github.com/square/connect-api-examples/blob/master/connect-examples/v2/node_bookings/README.md) is an additional research reference supplied by the parent. No SDK/API is used. |
| Show progress, allow editing, preserve applicable choices | Implementer / implemented | [W3C multi-page form guidance](https://www.w3.org/WAI/tutorials/forms/multi-page/) recommends logical stages, progress indicators and access to earlier choices. Native fieldsets/radios support keyboard navigation. |
| Explain errors and the final result explicitly | Implementer / implemented | [W3C notification guidance](https://www.w3.org/WAI/tutorials/forms/notifications/) supports descriptive notifications and accessible feedback. Stage headings receive focus and changes use a live status. |
| Examples only; no collection or real appointment | User / required | Prices, professionals and occupied intervals are fixtures. Persistent disclosure and the final outcome prevent interpreting the demo as a real booking. |
| Keep approved style and content | User / required | Ink `#111110`, ivory `#f4efe3`, muted `#bdb9af`, Anton headings, Barlow copy and Barlow Condensed controls. Selected options invert the same palette. Existing photographs/reviews and weekly visit panel remain intact. |

The parent reported that the business social profile links to WhatsApp rather than a visible booking calendar. This implementation relies on the inspected source app's call-only CTA as its verified before state; it does not claim to have inspected a private business booking system. The parent owns that external research. No messages or requests are sent to the business.

## Observable requirements

| ID | Behavior | Verification |
| --- | --- | --- |
| B-01 | One hero action opens the demo; phone is secondary real contact | Existing responsive/keyboard suite, no-JS fallback and screenshot comparison |
| B-02 | Three clearly named stages, service duration and NIO example price, optional professional | Browser journey at 390×844 and 1440×900; native radio keyboard checks |
| B-03 | Only starts that fit duration, hours and fictional occupations; no past or out-of-window starts | Model invariants across all 21 dates/services/professionals; timezone boundary test; expired-slot browser case |
| B-04 | Tuesday closed differs from no suitable mock slots; next available demo date | Browser Tuesday/Thursday cases and model tests |
| B-05 | Service/professional/date change clears slot; editing and back preserve applicable selections | Browser edits/back/reset cases |
| B-06 | Modal focus, Escape, repeated opening, reset and restored opener focus | Native dialog keyboard test and repeated-opening regression |
| B-07 | Final state says no appointment was created/sent; no personal fields/storage/network submission | Static checks, real browser requests/cookies/storage assertions, completion screenshot |
| B-08 | Reflow, 44px targets, reduced motion, automated accessibility | 320px/200% text checks; mobile/desktop axe for all four panels; existing responsive scans |
| B-09 | Preserve static local images, authentic five-source gallery and location/hours | Existing asset hash, content, WebGL/reduced-motion/context-loss and visit tests |
| B-10 | Real mobile/desktop before/after screenshots and workflow video with commit/viewport procedure | [Evidence record](evidence/booking-review.md), Playwright PNG/WebM artifacts |

Mock catalog: Corte clásico 30 min / C$ 200; Barba 20 min / C$ 150; Corte + barba 50 min / C$ 300. Professionals A/B are anonymous examples. Occupied intervals are half-open ranges in local minutes; Thursday is fully occupied for both to demonstrate an empty day. Neither professional names nor prices describe the real shop. The schedule shows a rolling 21-day window. “Any” assigns one available mock professional and never duplicates the same start.

Closing or restarting discards the in-memory selection; completing does not change the fixture. No names, contacts, reservation codes, accounts, payment, WhatsApp, API, cookies or browser persistence. A production booking system is a separate task requiring approved real services, durations, prices, staff schedules and transactional availability.

Independent review and human visual acceptance remain separate. No merge or public site deployment occurs. The parent updates the authorized private preview.
