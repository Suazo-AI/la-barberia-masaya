# Implementation evidence: hero + El local

Updated 2026-10-03 UTC. This is an implementation increment, not the completed website or an authorization to launch it.

## Current verified application

- Draft [PR #2](https://github.com/Suazo-AI/la-barberia-masaya/pull/2)
- Application head `38fa3a0dd54b885aebb53437938ca1f67bfc356e`; exact tree `ee37803debb4803d2f3494e6e2e5fb851fc7d056` matches local reviewed source `e35f3d00b519e63a0a891e3eba66e776c66dbf4d`
- [CI run 37111313294](https://github.com/Suazo-AI/la-barberia-masaya/actions/runs/37111313294): clean install, lint/HTML validation, build, **5 static tests and 12 browser tests passed**. No unexpected, skipped or flaky browser result
- [Actual screenshots, videos and reports](https://github.com/Suazo-AI/la-barberia-masaya/actions/runs/37111313294/artifacts/11269957639), archive SHA-256 `2bec2a1790b6e6bd1db29fad5e4f9f8991a9f553b3f0e6dfd4a008013277f59d`. CI artifacts expire; retain approved review evidence before expiry
- Screenshots were delivered for human review from this exact application head. Subsequent documentation/performance-test changes do not alter the pictured application; the latest PR head must still pass its own CI

## Baseline

Main `e74e58622c715b1618c543496b5b680d1bd875f6` was independently read and contains README only. There is no previous application or legitimate “before” screenshot. A design mockup is not an implementation baseline. The working result uses semantic HTML/CSS, not a rasterized page.

## Evidence coverage

| Check | Actual result |
| --- | --- |
| Locked clean install | Passed locally in a separate directory and in GitHub CI, Node 24.19.0 |
| Prettier + html-validate | Passed |
| Explicit-allowlist static build | Passed with selected authorized media and font licenses |
| Static tests | 5 passed: Spanish semantics/copy/tel, privacy/unsupported integrations, exact images, font licenses, truthful four-tile gallery |
| Responsive browser checks | Passed at 320×568, 390×844, 768×1024, 1024×768, 1440×900, 1920×1080 |
| Core flows | Passed: skip link/focus, repeated intercepted tel activation, Back/Forward, no JS, 200% root text at 320/390/720, reduced motion, missing image and 404 return |
| Gallery | All images load; 4 columns on desktop/tablet and 2 on phones; distinct interior/detail crops; no fictional client-work claims |
| Accessibility | Axe returned zero violations at mobile and desktop. One mobile contrast item was incomplete: transformed-but-clipped imagery confused background overlap detection for the footer. Independent screenshot inspection found readable muted text on solid ink; measured contrast is 9.65:1. Main ivory/ink contrast is 16.47:1. This does not claim full WCAG conformance or a screen-reader manual audit |
| Requested-resource budget | Actual 1920×1080 DPR1 and DPR2 resource lists both total **383,835 gzip bytes** (Node gzip level 9) against 409,600. Each requests one shared frontal image and one overview. HTML+CSS: 3,335 bytes; fonts: 64,465; frontal: 223,558; overview: 92,302; favicon: 175 |
| Privacy | Browser checks found no initial third-party requests, cookies or storage; source has no forms, trackers, embeds or application JavaScript |
| Visual review | Independent reviewer inspected actual desktop 1440 and mobile 390/320 captures and found no remaining source/visual blocker. User’s final visual acceptance is still required |
| Video | Actual WEBM recordings of responsive and keyboard/history/call-link test flows retained. No animation exists; no synthetic animation video is fabricated |
| Dialer | Correct telephone URI asserted and activation intercepted. No call was placed, and no answered call or appointment is claimed |
| R-12 mobile lab performance | Pinned Lighthouse 13.5.0 stage added after browser infrastructure succeeded. Three fresh profiles, official installed Chrome pinned to 154.0.8037.57 (independent of the Playwright browser), 390×844/DPR1, simulated 150ms RTT, 1638.4 Kbps and 4× CPU slowdown. Medians must meet LCP ≤2500ms, CLS ≤0.1 and performance ≥90. Read the latest exact-head CI and saved JSON for the actual result; no unexecuted pass is asserted here |

## Source and permission

The user confirmed permission on 2026-10-03 to use photos and create referenced images of these premises for this project. Only selected optimized derivatives and licensed local fonts are included. Raw Maps screenshots, competitor references and raster concepts remain excluded. Images remain historically grounded, AI-enhanced views from 2023; the site discloses this and does not claim current untouched documentation. The gallery reuses two room views with two explicitly described details.

## Resolved verification history

1. Authoring-executor Chromium launch was blocked by AF_UNIX restrictions, even after approved escalation. The documented internal preview gateway was unavailable. No security bypass or external tunnel was used
2. Authorized GitHub CI provided a working browser without deploying the website. Hero-only run `37110859234` passed 9/10 browser checks and caught 200% text overflow. The skip link was constrained and reflow diagnostics added
3. Gallery run `37111073014` passed 10 browser checks. Artifact collection was corrected to include only explicit hidden evidence paths
4. Independent review caught a high-DPI undercount: two selected frontal variants could total 531,919 bytes. Matching picture breakpoints removed duplicate downloads; actual DPR1/DPR2 resource tests passed on run `37111313294`
5. Three pinned mobile Lighthouse runs are added as a separate verification stage. UI source remains unchanged while this release gate is measured

## Remaining gates

- Human acceptance of the delivered working desktop/mobile views
- Latest exact-head checks, including the new Lighthouse stage, and investigation of any failure
- Selection/implementation of remaining visit/contact content; no speculative services or prices
- Host/domain and explicit release authorization, followed by deployed-artifact verification and rollback instructions

No merge, auto-merge or public website deployment has occurred. No Mistakes remains inactive. This record and PR narrative supplement actual CI logs; they do not replace them or establish “zero bugs”.

### Lighthouse runner compatibility

The first separate launcher could not start pinned downloaded Chromium under Ubuntu 24.04 AppArmor (`No usable sandbox`). Diagnostics also showed chrome-launcher automatically appending `--disable-setuid-sandbox`. The bounded compatibility fix omits that disabling flag and uses the already-installed official `/opt/google/chrome/chrome-sandbox` helper only after verifying it is root-owned, setuid and not group/world-writable. It changes no host policy, AppArmor/sysctl configuration, credentials or permissions. This follows [Chromium’s documented sandbox-helper route](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md). If the existing helper is unavailable, the check fails rather than weakening isolation. No `--no-sandbox` workaround is added.


The helper guard correctly stopped run [37112463629](https://github.com/Suazo-AI/la-barberia-masaya/actions/runs/37112463629) before measurement because the existing helper did not satisfy its security requirements. Ordinary checks still passed (5 static + 12 browser). No file permissions were altered. The revised route uses the already-installed official Chrome binary and its existing Ubuntu AppArmor allowance, documented by Chromium on the same page. Chrome **154.0.8037.57** is pinned from [runner image ubuntu24/20260927.320](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/Ubuntu2404-Readme.md); a different version fails instead of silently changing lab conditions. The script verifies root-owned, non-writable browser/policy files, checks the existing policy permits this exact browser path, and records its hash and runner image version. No browser binary is copied into an allowed path, no policy is created or modified, and no sandbox-disabling flag is used. Actual scores remain pending the resulting run.
