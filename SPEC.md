# Website specification

Version 0.2 · 2026-10-03 · Business timezone: America/Managua

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

Use plain static HTML/CSS with a small Node build/preview script and locked test dependencies already installed. A single-page brochure does not need Astro/React, a backend, database, hydration or a client JavaScript bundle. This resolves the earlier stack proposal using its explicitly permitted simpler alternative. No new runtime dependency is required.

Build copies an explicit allowlist only. Private reference material, raw Maps screenshots, generated concepts and private review evidence stay excluded from Git and build inputs unless intentionally selected. After the user’s explicit photo permission on 2026-10-03, the selected optimized scene is included in `src/assets/images` for reproducible builds. Raw source screenshots, concept mockups and competitor references remain excluded. No fake business-photo fixture is used.

## 4. Visitor journeys and accessibility

- Recognize the shop → select the call action → hand off the approved telephone URI to the device. Never claim a successful call or appointment. Tests intercept the link; they never place a call
- Keyboard: visible skip link → main content → call action; no focus trap. A 404 page returns to the hero
- Touch targets at least 44×44 CSS px, readable at 320–1920 px and enlarged text; no horizontal overflow
- Spanish language metadata, semantic header/main/footer/figure, one H1, meaningful image alternative text
- Core content works with JavaScript disabled. No autoplay, transitions, animation, smooth scrolling, or motion-dependent information
- No forms, tracking, external embeds, location requests, cookies or initial third-party requests

## 5. Approved premises grid and remaining creative work

On 2026-10-03 the user selected the Stockers tight monochrome work-grid reference. Adapt its visual rhythm as **EL LOCAL**, with four portrait tiles in one desktop row, thin 4px black gutters, and two columns on mobile. Use the two existing enhanced historical interior views plus two distinct, honestly labeled CSS detail crops. No fabricated customers, services, haircut results or new scene generation. Image grayscale and crops are presentational CSS only, with no hover animation, modal or new CTA. The provenance note covers all images. Keep the reference screenshot private and copy no Stockers photography, branding or text.

This selection is a separate increment after the hero-only source baseline. User acceptance of actual rendered gallery and responsive layout remains required.


Next: user-selected visit/contact treatment, with verified map destination, approved address, telephone and weekly hours. Directions belong below the hero, preserving its single action. Use the confirmed source ledger; omit any unverified service or price information. Unknown holiday hours must not become a live “open now” claim.

Metadata now includes a truthful draft title/description, local favicon and `noindex`. Canonical URL, social card, sitemap and production indexing await the approved host/domain and final content. Noindex is not access control. There is no deployment configuration or automatic deployment in this increment.

Excluded: CRM, Forja, WhatsApp, payments, accounts, calendars, appointment confirmation, customer databases, reviews, analytics, advertising pixels and unrelated client projects.

## 6. Gates

Concept selection and implementation authorization are complete for this hero only. The exact working desktop/mobile result still needs human visual acceptance. Photo permission is recorded; remaining section selections, independent review, exact-commit CI and host/release authorization remain separate gates. No merge or public deploy until all applicable gates pass.

See [acceptance](docs/acceptance.md), [sources](docs/sources.md), [decisions](docs/decisions.md), [tasks](docs/tasks.md) and [reconciliation](docs/reconciliation.md).
