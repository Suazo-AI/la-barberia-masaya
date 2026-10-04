# Agenda evidence

Application source: [`f321ab9c0db256fed92682ccad08ae15b552a628`](https://github.com/Suazo-AI/la-barberia-masaya/commit/f321ab9c0db256fed92682ccad08ae15b552a628). Real before application: [`181bc7e1f379d195aea0c06e6d56e2ac75d5886e`](https://github.com/Suazo-AI/la-barberia-masaya/commit/181bc7e1f379d195aea0c06e6d56e2ac75d5886e). [Verification and review](../agenda-review.md), [requirements](../../agenda/spec.md), [hosting handoff](../../agenda/hosting-handoff.md).

These are actual Chrome screenshots and continuous browser recordings, with original image/video bytes preserved. Before is the previous static reservation simulation, served from its isolated pinned source at `http://127.0.0.1:4184`. After uses the persistent local fixture service at `http://127.0.0.1:4191`: create, move and cancel are real SQL-backed operations against a private synthetic database. The backend is not deployed, and these are not appointments, prices or availability of the business.

Capture viewports are 390×844 and 1440×900, with Spanish locale, Managua timezone and normal motion. Browser clock is fixed to `2026-10-04T15:00:00Z` for both sides; the after backend uses the same fixture clock. Public flow date is October 18, 2026; administrator flow date is October 16 with separate A/B fixture professionals. Narrow/200% text, reduced motion, keyboard, collisions and failure states have separate browser tests.

## Public reservation before and after

| State                      | Mobile before                                         | Mobile after                                              | Desktop before                                         | Desktop after                                              |
| -------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Hero                       | [PNG](public/before-hero-390.png)                     | [PNG](public/after-hero-390.png)                          | [PNG](public/before-hero-1440.png)                     | [PNG](public/after-hero-1440.png)                          |
| Service                    | [PNG](public/before-services-390.png)                 | [PNG](public/after-services-390.png)                      | [PNG](public/before-services-1440.png)                 | [PNG](public/after-services-1440.png)                      |
| Pending personal portfolio | [PNG](public/before-portfolio-390.png)                | [PNG](public/after-portfolio-390.png)                     | [PNG](public/before-portfolio-1440.png)                | [PNG](public/after-portfolio-1440.png)                     |
| Date/professional          | [PNG](public/before-schedule-390.png)                 | [PNG](public/after-schedule-390.png)                      | [PNG](public/before-schedule-1440.png)                 | [PNG](public/after-schedule-1440.png)                      |
| Available slots            | [PNG](public/before-available-slots-390.png)          | [PNG](public/after-available-slots-390.png)               | [PNG](public/before-available-slots-1440.png)          | [PNG](public/after-available-slots-1440.png)               |
| Editable review            | [PNG](public/before-review-390.png)                   | [PNG](public/after-review-390.png)                        | [PNG](public/before-review-1440.png)                   | [PNG](public/after-review-1440.png)                        |
| Result                     | [Simulation PNG](public/before-demo-complete-390.png) | [Persisted fixture receipt](public/after-receipt-390.png) | [Simulation PNG](public/before-demo-complete-1440.png) | [Persisted fixture receipt](public/after-receipt-1440.png) |
| Receipt details            | Did not exist                                         | [PNG](public/after-receipt-details-390.png)               | Did not exist                                          | [PNG](public/after-receipt-details-1440.png)               |
| Private management         | Did not exist                                         | [PNG](public/after-manage-390.png)                        | Did not exist                                          | [PNG](public/after-manage-1440.png)                        |
| Move selection             | Did not exist                                         | [PNG](public/after-manage-reschedule-390.png)             | Did not exist                                          | [PNG](public/after-manage-reschedule-1440.png)             |
| Moved reservation          | Did not exist                                         | [PNG](public/after-manage-rescheduled-390.png)            | Did not exist                                          | [PNG](public/after-manage-rescheduled-1440.png)            |
| Cancellation confirmation  | Did not exist                                         | [PNG](public/after-manage-cancel-confirm-390.png)         | Did not exist                                          | [PNG](public/after-manage-cancel-confirm-1440.png)         |
| Cancelled reservation      | Did not exist                                         | [PNG](public/after-manage-cancelled-390.png)              | Did not exist                                          | [PNG](public/after-manage-cancelled-1440.png)              |

| Continuous recording | Before                                       | After                                        |
| -------------------- | -------------------------------------------- | -------------------------------------------- |
| Mobile               | [WebM, 6.56 s](public/before-flow-390.webm)  | [WebM, 11.28 s](public/after-flow-390.webm)  |
| Desktop              | [WebM, 7.08 s](public/before-flow-1440.webm) | [WebM, 13.32 s](public/after-flow-1440.webm) |

The four public videos were checked against their original raw recordings and decoded at their midpoint in Chrome. Before creates no booking. Both after flows persist creation (201, version 1), reschedule (200, version 2) and cancellation (200, version 3). The capability is absent from request URLs and public metadata; the private management page clears its fragment before capture. No cookies or browser storage were observed. [Public manifest: 40 PNG + 4 WebM](public/manifest.json).

## Administrator first implementation

There was no administrator UI at the before revision. No before screenshot or video is fabricated. This first implementation has actual mobile/desktop evidence of a synthetic walk-in, block, conflicting move with rollback, valid move, explicit cancellation and block release. There are no response interceptions in these captures and no backup download.

| State                | Mobile                                                                        | Desktop                                                                        |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Walk-in form         | [PNG](admin/admin-forms-390.png)                                              | [PNG](admin/admin-forms-1440.png)                                              |
| Persisted schedule   | [PNG](admin/admin-overview-390.png)                                           | [PNG](admin/admin-overview-1440.png)                                           |
| Native manage dialog | [PNG](admin/admin-manage-dialog-390.png)                                      | [PNG](admin/admin-manage-dialog-1440.png)                                      |
| Actual 409 conflict  | [PNG](admin/admin-conflict-390.png)                                           | [PNG](admin/admin-conflict-1440.png)                                           |
| Cancelled walk-in    | [PNG](admin/admin-cancelled-390.png)                                          | [PNG](admin/admin-cancelled-1440.png)                                          |
| Full flow            | [WebM, 8.96 s](admin/admin-persisted-walkin-block-reschedule-cancel-390.webm) | [WebM, 9.36 s](admin/admin-persisted-walkin-block-reschedule-cancel-1440.webm) |

Both administrator recordings were fully decoded with FFmpeg (224/234 frames, exit 0), with unchanged original bytes, and independently midpoint-decoded in Chrome. [Administrator manifest: 10 PNG + 2 WebM](admin/manifest.json).

The selected collection contains **50 PNG and 6 WebM**. Manifests record source, route, viewport, procedure, SHA-256 and byte counts. Public source comparisons report CRLF normalization explicitly when raw served text differs from Git line endings. No generated frames, UI reconstructions, raw capability values, private backup exports or full private execution logs are included. Human visual acceptance is still required before merge or release.
