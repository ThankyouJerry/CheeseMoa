# 0.1.12 viewport and startup regression checks

Base main: `f378d57b2dbb6ff82e8e8c898704702ea6ea7b71`. Build marker: `power-20261017.9`.

## Changes and checks

- Height-constrained 2×2 multiview with compact controls and collapsed help; the existing automatic-receipt panel occupies a separate rail. At narrow widths the layout scrolls and reserves 280px for the panel.
- The same iframe retains its 1280×720 logical viewport. Valid, ready same-channel video bounds are contained without cropping the video. Unready/login/invalid bounds show the whole official page; the user can explicitly toggle the view. Resizing does not navigate or replace the iframe.
- The same panel, receipt nodes and owner survive synchronous host cleanup and BFCache re-entry. Docking does not overwrite floating coordinates or ON/OFF state.
- New/unset automatic-receipt preference defaults to ON only when no session owner state exists. An explicit OFF preference and existing runtime OFF/pending/error state are preserved. Concurrent fresh pages recheck eligibility under the existing owner lock. OFF cancels runtime before attempting preference persistence, including slow/failed local writes.

Independent implementation, test and review agents checked the changes. The reviewer identified the detached-panel lifecycle problem and OFF-persistence ordering problem; both were corrected and regression-tested.

## Browser layout observations (not live broadcast evidence)

A local fixture used the actual host/floating-panel modules with a localhost origin substitution and a synthetic video labelled **LAYOUT TEST - NO LIVE VIDEO**. It used no login or reward endpoints. The disabled receipt controls and panel content in that fixture are visual test content; real panel lifecycle is separately tested with the generated bundle.

| Viewport | Observation |
| --- | --- |
| 1280×800 | Four cards at x=8/504, y≈97/449, width=488; bottom=792. Separate panel x=1000, width=272. No video overlap. |
| 1024×768 | Four cards at x=8/376, bottom=760. Selectors remain 120px wide; controls use two rows; screen height≈209px preserves contain scaling. |
| 390×844 | Four 300px cards scroll vertically; 280px panel remains reachable. Hide/restore works; document has no horizontal overflow. |

Actual screenshots were inspected by both the primary agent and the independent reviewer. Mobile panel collapse found during inspection was fixed before release.

## Gemini contribution

The local Gemini app reviewed the layout and authored the invalid-video-bounds regression added to `test/site-layout.test.mjs`. A separate GPT test agent independently inspected and integrated the supplied code, correcting the assertion target from the screen to the iframe and strengthening the navigation assertion. Gemini supplied code through its app; it did not edit local files or spawn independent agents.

Gemini's suggested minimum 240px video height was not treated as a requirement: the measured 1024px layout fits 16:9 video at the available width and keeps all four cards visible. Its optional latched crop during buffering was not adopted because whole-page fallback keeps official error/login content accessible. Dock-state and lifecycle concerns are covered by regressions.

## Limits

Unit/integration tests use mocked reward responses; they do not establish actual reward receipt. The earlier real test of base `f378d57` played only one of four channels, and the failed channels' cause remains unconfirmed. A separate real four-channel retest must record the exact final main SHA, screenshots and advancing media metrics; neither layout fixtures nor a mock PUT count is evidence of real receipt. No store publication, security bypass or user-profile reload is part of this release.
