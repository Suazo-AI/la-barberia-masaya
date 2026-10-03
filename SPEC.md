# Website specification

Version 0.4 · 2026-10-03 · Business timezone: America/Managua

## 1. Outcome and current increment

A Spanish-first, mobile-friendly website for La Barbería in Masaya. Help a visitor recognize the shop, contact it and, when the next section is approved, find it. This increment implements the user-selected round-two **option 2, contundente**, the subsequently selected tight monochrome **El local** grid, and a testable static foundation. It is a private visual review, not a launched official site or a complete end-to-end MVP.

The full website remains the goal. Subsequent sections are selected with the user using relevant Spanish/English website references. The gallery is explicitly selected and shows the premises only. Do not invent a service menu, prices, staff biographies, claims, reviews, haircut results or a booking system to fill space.

## 2. Approved hero

- Dark masthead: **LA BARBERÍA** on the left, a fine ivory rule, **MASAYA · CAILAGUA** on the right
- Desktop: frontal interior image left (~60%); ink surface and ivory text right (~40%)
- One H1, two visual lines: **TU ESTILO. / BIEN HECHO.**
- Supporting text: **Un espacio para tu próximo corte.**
- Exactly one hero action: **Llamar para consultar**, ordinary anchor with `tel:+50585482197`
- No extra hero navigation, badges, number chips, secondary directions action or social icons
- Real HTML text; the selected mockup is a composition reference, never a full-page image
- On a narrow viewport, headline and action precede the interior image, retaining comfortable type and touch size; the CTA is visible in the initial 320×568 and 390×844 viewports

The scene is the existing enhanced frontal interior, based on historical 2023 photos. Only loss-aware resizing/compression for web is allowed in this implementation; no additional scene generation or architecture changes. An unobtrusive, readable note below the hero discloses the historical/AI-enhanced image in the private draft. The user explicitly confirmed permission to use photos and create referenced derivatives for this project on 2026-10-03. Historical/AI-enhancement disclosure remains necessary.

## 3. Visual system and technical choice

| Token | Value | Use |
| --- | --- | --- |
| Ink | #111110 | Surface, CTA text |
| Ivory | #f4efe3 | Main text and CTA |
| Muted ivory | #bdb9af | Draft image note |
| Display | Anton, local OFL font | Closest licensed match to the selected condensed, heavy headline |
| Body | Barlow, local OFL font | Readable supporting text |
| Utility display | Barlow Condensed Bold, local OFL font | Call label and location |

Use plain static HTML/CSS with a small Node build/preview script and locked test dependencies already installed. A single-page brochure does not need Astro/React, a backend, database, hydration or a framework bundle. The subsequently requested microinteractions and optional Obsidian trial use small, local native JavaScript modules. This resolves the earlier stack proposal using its explicitly permitted simpler alternative. No new runtime dependency is required.

Build copies an explicit allowlist only. Private reference material, raw Maps screenshots, generated concepts and private review evidence stay excluded from Git and build inputs unless intentionally selected. After the user’s explicit photo permission on 2026-10-03, the selected optimized scene is included in `src/assets/images` for reproducible builds. Raw source screenshots, concept mockups and competitor references remain excluded. No fake business-photo fixture is used.

## 4. Visitor journeys and accessibility

- Recognize the shop → select the call action → hand off the approved telephone URI to the device. Never claim a successful call or appointment. Tests intercept the link; they never place a call
- Keyboard: visible skip link → main content → call action; no focus trap. A 404 page returns to the hero
- Touch targets at least 44×44 CSS px, readable at 320–1920 px and enlarged text; no horizontal overflow
- Spanish language metadata, semantic header/main/footer/figure, one H1, meaningful image alternative text
- Core content works with JavaScript disabled. No autoplay or motion-dependent information. Short optional entrance/reveal/wipe effects honor reduced motion; the requested Obsidian trial activates explicitly and can return to the static grid
- No forms, tracking, external embeds, location requests, cookies or initial third-party requests

## 5. Approved premises grid and remaining creative work

On 2026-10-03 the user selected the Stockers tight monochrome work-grid reference. Adapt its visual rhythm as **EL LOCAL**, with four portrait tiles in one desktop row, thin 4px black gutters, and two columns on mobile. Use the two existing enhanced historical interior views plus two distinct, honestly labeled CSS detail crops. No fabricated customers, services, haircut results or new scene generation. Hero and gallery use matching picture sources per breakpoint (1672 desktop, 1200 tablet, 720 mobile) so the frontal image is downloaded once per view. Gallery overview is 1000 desktop/tablet or 720 mobile. Actual DPR1/DPR2 request budgets are tested. Image grayscale and crops are presentational CSS only, with no modal or added business CTA. A separate optional gallery-mode control enables the subsequently requested Obsidian trial. The provenance note covers all images. Keep the reference screenshot private and copy no Stockers photography, branding or text.

This selection is a separate increment after the hero-only source baseline. User acceptance of actual rendered gallery and responsive layout remains required.


Next: user-selected visit/contact treatment, with verified map destination, approved address, telephone and weekly hours. Directions belong below the hero, preserving its single action. Use the confirmed source ledger; omit any unverified service or price information. Unknown holiday hours must not become a live “open now” claim.

Metadata now includes a truthful draft title/description, local favicon and `noindex`. Canonical URL, social card, sitemap and production indexing await the approved host/domain and final content. Noindex is not access control. There is no deployment configuration or automatic deployment in this increment.

Excluded: CRM, Forja, WhatsApp, payments, accounts, calendars, appointment confirmation, customer databases, reviews, analytics, advertising pixels and unrelated client projects.

## 6. Gates

Concept selection and implementation authorization are complete for this hero only. The exact working desktop/mobile result still needs human visual acceptance. Photo permission is recorded; remaining section selections, independent review, exact-commit CI and host/release authorization remain separate gates. No merge or public deploy until all applicable gates pass.

See [acceptance](docs/acceptance.md), [sources](docs/sources.md), [decisions](docs/decisions.md), [tasks](docs/tasks.md) and [reconciliation](docs/reconciliation.md).

## 7. Requested component trial, 2026-10-03

Apply the previously shown UI references, with the later explicit selection to try Obsidian Art Gallery. Preserve the approved hero and static-grid fallback. See [implementation map](docs/ui-components.md) for real upstream reuse versus visual inspiration. Human visual acceptance remains pending. The current increment permits implementation and draft-PR verification, not merge or public release.

## 8. Visit and gallery content update, 2026-10-03

This increment supersedes the pending-visit status above: build the selected Stockers-inspired location/hours panel below the existing local grid, using original Anton/Barlow styling, the preserved Maps place ID and all seven days. The schedule must say it was observed on Google Maps on 2026-10-03, uses Nicaragua time, and may vary on holidays. Do not claim “open now”, guaranteed availability or owner confirmation. There is one outbound Maps link and still exactly one hero/call CTA. No embedded map, tracking API or new dependencies.

The user likes the Obsidian effect but now assigns it to genuine reviews and haircut photographs. Keep the engine source for that future integration; disable its local-photo controls while authentic content is pending. The existing premises grid remains static. This supersedes the active local-photo trial, not approval of the effect itself. Reviews/cuts require authentic sources and appropriate usage rights before integration; no invented testimonials or haircut results.

## 9. Authentic Obsidian content, 2026-10-03

The user approved the effect and requested business-social photos and genuine reviews. This supersedes the content-pending state in section 8. A distinct “Cortes y reseñas” section contains exactly two unchanged business-post photos of work in progress and three attributed positive review fragments. Show the dated overall rating (4.2/5, 10 reviews), source links, relative review dates and selection qualifier. No claim that photographed customers wrote the reviews. Disclose that the optional repeating wall repeats those five items. Source cards remain accessible while the canvas is open. Full photo containment preserves original overlaid branding; no generated results or crops.

The native upstream WebGL port remains opt-in, with keyboard, touch, motion preference and context-loss handling. No new dependencies or weaker browser security. Local grid and visit panel retain their approved treatment. New lazy photos have a separate 550 KiB full-page gzip budget; the existing 400 KiB above-fold/local-image budget is unchanged. Private preview still requires independent review and human visual acceptance; no merge or public launch.
