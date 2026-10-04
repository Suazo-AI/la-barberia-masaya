# Real reservation demo captures

Before source: `0755fce62688e380a737db9e267bad22e35acf25`. After source: `5fdedba2500cda2227a087f74c57138f37c9d010`. These are actual Chrome 154.0.8037.93 renders, not design mockups. The later evidence-only commit does not change application code. See [before manifest](before-manifest.json) and [after manifest](after-manifest.json) for source, URL, viewport, capture method and SHA-256 hashes.

| State | Mobile, 390×844 | Desktop, 1440×900 |
| --- | --- | --- |
| Before, full real page | [PNG](ui-before-390.png) | [PNG](ui-before-1440.png) |
| After, full real page | [PNG](ui-after-booking-page-390.png) | [PNG](ui-after-booking-page-1440.png) |
| Service examples | [PNG](ui-after-booking-service-390.png) | [PNG](ui-after-booking-service-1440.png) |
| Time examples | [PNG](ui-after-booking-time-390.png) | [PNG](ui-after-booking-time-1440.png) |
| Editable review | [PNG](ui-after-booking-review-390.png) | [PNG](ui-after-booking-review-1440.png) |
| Closed Tuesday | [PNG](ui-after-booking-closed-390.png) | [PNG](ui-after-booking-closed-1440.png) |
| Fully occupied mock Thursday | [PNG](ui-after-booking-empty-390.png) | [PNG](ui-after-booking-empty-1440.png) |
| No real appointment outcome | [PNG](ui-after-booking-complete-390.png) | [PNG](ui-after-booking-complete-1440.png) |
| Before interactions / motion | [Real WebM](ui-before-booking-390.webm) | [Real WebM](ui-before-booking-1440.webm) |
| After complete/edit/reset flow | [Real WebM](ui-after-booking-390.webm) | [Real WebM](ui-after-booking-1440.webm) |

The recorder may scale the viewport. Both WebMs depict actual browser actions and have no synthesized frames. The baseline includes its original call CTA; there was no existing service/time selection flow. No telephone call or message was sent. The after test clock is 09:00 in Managua on 2026-10-03; the shipped interface instead follows the actual current local date/time.

The source build uses its explicit allowlist and excludes this evidence folder. Only the intentionally selected website UI, existing public business content and sanitized check metadata are published here. Raw private research, local execution paths and credentials are excluded.

[Seven final booking checks](booking-checks.json) passed on the after source. [Mobile axe](ui-booking-axe-390.json) and [desktop axe](ui-booking-axe-1440.json) contain zero automatic violations across four panels; incomplete contrast checks require human assessment. [Asset budget](budgets.json) retains the existing ceilings. These checks do not establish full WCAG conformance, real availability or human visual acceptance. Actual Safari/iOS and a screen reader were not tested locally.
