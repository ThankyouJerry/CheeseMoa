# 0.1.14 quality controls: verification and limitations

## Final status

**External quality changes failed in the real local browser.** Both attached LI.click and the final standard pointer/mouse sequence timed out while all four videos remained 640x360. Normal native clicks on the same official1080p options changed all four videos to1920x1080. This source update is experimental; it is not a completed quality-control feature or a store release.

Official menu discovery passed after allowing opacity0 for the exact official settings entry (including the button itself). Other visibility checks remain intact. Quality options must be visible. The implementation pins the active frame/document, uses one bounded attempt, checks ownership before every event, and stops on cancellation. It does not clone/detach official nodes, spoof trusted events, call private player APIs, or reload on a quality request.

Requested quality, recent official menu selection, and decoded video dimensions are separate observations. Menu confirmation is not proof of decoded resolution. Timeout means confirmation was not obtained. The selector currently prioritizes the last request; the separate observations must be used to assess the result.

## Reproduction and code verification

Use the complete Git source, not the extension installation ZIP. The source includes package.json, package-lock.json, test/, and scripts/build-power-page.mjs.

Run npm ci, npm test, npm run validate, and npm run build.

- Local canonical-source snapshot:386/386 tests passed; validate and build passed.
- Quality regressions:18/18 passed, including sequence order/coordinates/realm, stale frame/document, cancellation, hidden options, and no retry/network/storage/navigation side effects.
- Independent Codex review:18/18 directly executed and no additional blocking code defect found. This did not prove live quality changes.
- GitHub main a3439fc72067b6010a623ef7cdde194832bbce75: CI passed. Source tree789b4d537b9b37c40569009e5a984b78b28ece9e matches reviewed branch538e46632ee458b7938adc0feaaf1be92842b0dc.
- Grok Bot actually cloned/checked out both commits, confirmed version0.1.14 and the required source files, then independently ran all four commands successfully. Its log records386/386 tests,0 failures, manifest and32 assets validated.

## External review and authorship

Gemini provided actual review and draft snippets/pseudocode. Its suggestions informed asynchronous menu phase guards, fresh checked-state confirmation, the narrow settings opacity exception, and one standard pointer/mouse sequence. Codex wrote and integrated qualityDocumentNow, qualityRejection, updateQuality, requestQuality, activateQualityOption, and test/site-quality.test.mjs. Gemini explicitly confirmed this attribution; it did not execute tests or author the final integrated functions.

Grok reviewed the final source and provided logs. Its review raised cancellation semantics, exact event target, detail/focus/hover differences, isolated-world behavior, and trusted-input gating as hypotheses. None is established as the actual cause. It also identified contradictory historical QA wording, corrected in this document. Its initial coverage assessment used test names rather than every test body, so that claim is limited.

The public MIT Chzzk-Platter comparator describes clone/replace/detached-click/restore for quality changes in src/audioMixer.js5692-5760. We did not copy that mechanism. Existing licensing and comparison attribution are preserved in CHZZK_PLATTER_COMPARISON.md.

## Actual playback boundaries

Previous0.1.13 measurements showed four-channel currentTime and decoded-frame progression over approximately57 seconds, and native menu1080p selections. Those observations do not prove the new external controls work.

On2026-10-17 the user first requested closing all Chrome tabs except extensions management; six other tabs were closed. The user subsequently authorized another30-minute playback test, so only one necessary test tab was reopened.

Mashiro's official page displayed the next-live message, confirming the broadcast had ended. The user-authorized replacement was Arahashi Tabi(a6c4ddb09cdb160478996007bff35296). The measured set is POPOPOPO, Tabi, Blair Rose, and Midomido Mayo. Auto-claim remains OFF.

During setup, frames remained blank while browser debugging was attached and loaded after detachment. This is an observed association, not a proven browser-internal cause. Setup and quality changes are excluded from the stability window. The30-minute window started2026-10-17T15:09:30Z but was interrupted: Rose was observed stalled with readyState1 and zero buffer around15:25, then recovered without reload. It is not a passed30-minute run. The user requested a renewed20-minute window15:29–15:49UTC; see QA-0.1.15.md for its separate evidence. No new reward receipt or three-hour stability claim is made.
