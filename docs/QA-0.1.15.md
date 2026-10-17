# 0.1.15 official quality menu and unobstructed diagnostics

## Behavior

Global quality selection and synthetic quality-option clicks are removed. Each card's `화질 메뉴` button keeps the existing iframe, switches its presentation to the whole official page, and attempts Settings then Resolution at most once each within a bounded watchdog sequence. The user chooses the final quality in the official player and returns with `영상 맞춤`. This helper has not yet been verified against live broadcasts.

The playback row displays measured positive integer video dimensions, not a requested quality. Detailed diagnostics are absent until explicitly requested. They appear in a reusable normal-flow section after the video workspace; there is no modal, backdrop, or diagnostic overlay. Closing hides that section. The existing video workspace height is retained.

## Authorship and review

Gemini's local desktop app received the concrete new design on 2026-10-17 around15:38 UTC and returned its review around15:39 UTC. It authored `formatVideoDims(w,h)`, which Codex adapted to use `×` and integrated into `src/viewer/site-host.js`. Its positive-integer checks reject zero, negative, fractional, NaN, Infinity and nonnumeric values. Codex agents implemented the menu state machine, diagnostics layout and regression tests; these are not attributed to Gemini.

Gemini recommended checking document/route identity, respecting already-open menus, keeping an explicit return to video fit, and bounding attempts. Those checks are implemented. Its assertion that isTrusted caused the previous failures remains unproven and was not adopted as a diagnosis. A proposed global mutex was unnecessary for independent card-local menu state and was not added.

## Reproduction

Use a complete Git checkout containing package.json, package-lock.json, scripts/ and test/. Run `npm ci`, `npm test`, `npm run validate`, and `npm run build`. Installation ZIPs intentionally contain extension assets only and cannot reproduce source tests.

The new menu, diagnostic, playback and layout focused suite passes28 tests. The clean canonical-source snapshot passed377/377 tests, npm ci, validate(32 assets), and build. Independent Codex review directly reran the28 focused tests successfully. Existing untracked duplicate files in the user's working directory are excluded from the clean source snapshot and preserved locally.

## Live evidence is from installed0.1.14, not this patch

The existing logged-in Chrome profile `Samuel (Jerry mouse)` was directly checked: extension `cmjephhcfceokeljjhpdmaiojhmolieh` enabled, version0.1.14, marker power-20261017.10, unpacked path `~/Applications/CheeseMoa-unpacked-0.1.3`. The actual extension host URL was `https://chzzk.naver.com/lives#cheesemoa-multiview`. No Guest or extension-free browser was used for these measurements.

POPOPOPO, Arahashi Tabi, Blair Rose and Midomido Mayo were measured. Auto-claim remained OFF. Native official selections had set all four videos to1920×1080; the failed external controls did not accomplish those changes.

The original15:09:30–15:39:30UTC window was interrupted: Rose was observed stalled with readyState1 and zero buffer around15:25, then recovered without reload. A renewed15:29–15:49UTC observation window was requested. At the baseline and15:35–15:36, all four media times and decoded-frame counts advanced at1920×1080, readyState4, mediaError null. Diagnostic popup sampling stopped when the user reported obstruction. Later UI observations temporarily reported all four unverified, returned to four playing, and around15:43 showed two stalled/two unverified. Therefore the renewed window is not an uninterrupted-playback pass; no network cause was established. Later observations are UI evidence, not equivalent to sampled media counters or proof of uninterrupted playback.

No new real reward receipt, three-hour soak, or live validation of0.1.15 is claimed. Existing MIT licensing and public comparator attribution remain unchanged.
