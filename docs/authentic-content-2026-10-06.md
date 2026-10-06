# Authentic content candidate, 2026-10-06

This source-only increment keeps the approved hero, premises, mixed gallery and exact review excerpts. It replaces one process photograph with one finished-cut story frame and adds optional team introductions inside the existing reservation dialog. It does not configure the agenda, assign real people to fixture identities, change services/prices or publish a Site.

## Sources and boundaries

- `finished-fade-highlight-2026-10-06.jpg`: unchanged screenshot bytes from the business’s [Clientes highlight](https://www.instagram.com/stories/highlights/18015487450805665/). Inspected visually: the selected adult-appearing bearded client has a finished side fade and shaped beard. No viewer name, inbox avatar, comment or private-account identifier occurs anywhere in this source screenshot. The surrounding pixels contain only Instagram controls and the business’s story. Display crop is x=373, y=90, width=404, height=580 within 1165×747. CSS and the optional gallery canvas render the same source rectangle without changing the image file. The cutoff excludes story controls and retains the whole visible haircut boundary. The caption explicitly says this is a story frame, observed on October 6; the original date is unknown. SHA-256: `b6c8b4f12fc693f2430fedf2eff4c6d18ef197e78d5c86ea739baf0001d1d219`
- `jonatan-at-work-2026-09-16.jpg`: unchanged image downloaded from the [fourth slide of the business’s September 16 carousel](https://www.instagram.com/labarberia.ni/p/DdXBwrqCfEQ/?img_index=4). The caption names Jonatan. This is a portrait during work, not a finished-cut claim. His [intro reel](https://www.instagram.com/labarberia.ni/reel/Dco9f0oJaR_/) also names him. SHA-256: `203d7fc6a8031c9a97e747d8f216a34fb05c1418bc925a630144de11e83982ed`
- Manuel is named only through the business’s [intro reel](https://www.instagram.com/labarberia.ni/reel/DcZFDmoJ8sB/). His profile links to the source, with honest pending photo/portfolio wording. No image of another barber is mapped to Manuel.
- The [third interview](https://www.instagram.com/labarberia.ni/reel/DcjqIB5pHjB/) remains unnamed. No invented name is attached to a face.
- The three interview screenshots are excluded from the public assets because their surrounding UI includes comments/inbox avatars. Other finished-cut frames whose clients’ ages were uncertain are not used. No generative photo edit or new identity is introduced.

The business introductions remain separate from the service catalog. Opening “Conocé al equipo” or a profile cannot select a reservable professional. Portfolios of attributable finished work are still honestly pending. The portrait is fetched only when Jonatan’s own disclosure is opened. Closing/resetting the reservation closes the disclosures and removes the portrait element.

## Verification

Baseline application source: `5bcaac53aafddd204ea9634d0b75c17140904b4e`. The original release checkout’s 11 staged setup/configuration changes were copied into an isolated candidate and left untouched. Those baseline staged changes do not affect the UI source.

Passed on October 6 in the isolated cloud candidate:

- `npm run lint`
- `npm run typecheck:agenda`
- `npm run build`
- `npm test`: 17 tests
- `npm run test:agenda`: 151 tests
- `npm run test:sites`: 4 tests; byte-exact public packaging, private paths excluded, agenda still fails closed
- `npm run check:budgets`: pre-profile page cap stays 550 KiB; one opt-in intact portrait has a separate enforced 160 KiB allowance, with a combined 710 KiB model cap. Initial/core limits are unchanged

Browser checks were attempted but did not run: Chromium exits at launch with `socket() failed: Operation not permitted`, including one reviewed escalation retry. The supported cloud browser blocks localhost with `ERR_BLOCKED_BY_CLIENT`. No browser restriction was bypassed, and no screenshot, video, visual pass or a11y pass is claimed from this executor.

`tests/authentic-content.spec.mjs` prepares 390×844, 1440×900 and 320×568/200%-text checks for source viewport geometry, photo demand loading, explicit pending portfolio content, no booking writes, no overflow, accessibility, keyboard navigation, close/reopen/reset and unchanged closed booking state. CI uses a separate `AUTHENTIC_BASELINE_URL` on port 4176 to capture the exact pre-change gallery/dialog, preserving the other historical baselines. A separate no-preference-motion case asserts the Canvas drawImage source rectangle. The default Playwright video capture records the exercised flow. Screenshots and source/viewport metadata are uploaded with the exact-head check artifact.

Actual browser results, image inspection and independent review remain release gates. Parent integration coordinates the draft PR and any later Site preview. This document does not establish publication or booking activation.
