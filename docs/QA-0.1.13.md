# 0.1.13 playback status and diagnosis

Base: `aaec75f321d7f2eb82776dec7087d0ff69a556a1` (0.1.12). Build: `power-20261017.10`.

## Scope

Opened iframe count is not playback proof. The host now samples media time/frame progression, invalidates old samples on navigation/media replacement, and separates buffering, pause, errors, ended and unconfirmed progress. Official error/age overlays use narrowly scoped observed DOM signals; hidden error templates and unrelated login/chat/recommendation text must not match. Unknown pages remain unverified.

The existing reward eligibility, HTTP failure budget, at-most-once ledger and saved OFF behavior are unchanged. No real reward collection was attempted in this verification.

## Reproduce locally

Use the complete source checkout, not the installation ZIP:

```sh
npm ci
npm test
npm run validate
npm run build
```

The source archive includes package.json, package-lock.json, test/ and scripts/build-power-page.mjs.

## Actual matched live comparison, base 0.1.12

Grok ran three separate fresh Chromium profiles. Processes started 2026-10-17 22:09:35 KST (within 64 ms); setup completed A22:09:41, B22:09:52, C22:09:58. Aligned observations were 22:10:49–22:12:49 KST, 13 samples over 120 seconds. This is a bounded comparison, not a three-hour soak or current local-profile validation. Chromium used an autoplay test flag, and no authenticated profile was used.

- A, official Mashiro with no extension: currentTime0, frames0, readyState0 throughout; visible official error. HLS connection closed.
- B, same Mashiro in single-view CheeseMoa: currentTime70.568553→189.769611, frames2384→9537, dropped25→97, readyState4,1920×1080. Actual video progress confirmed.
- C, original four channels: all four iframe elements existed, including Mashiro slot3. Mashiro displayed a failed-document icon. The script incorrectly called this noFrame because it located frame contexts by their final URL. The document request failure was ERR_CONNECTION_CLOSED; attribution to the exact Mashiro request is inferred from timing/screenshots, not directly proven by a frame ID. POPO/HaSiyo had no video; Shibuki showed an age gate.

No HTTP403 (or other HTTP>=400) was recorded in this run. Observed connection failures across conditions do not prove a cloud-network root cause, nor do they prove an extension defect. A failed while B played, so a blanket embedding-origin diagnosis is unsupported. Four-channel stable playback remains unverified/failed in this environment. No access restriction was bypassed. The age gate was not submitted.

Both extension profiles had `{enabled:false}` set and verified before live navigation and at the end. Observed non-GET log-power requests:0. No receipt success is claimed. Temporary contexts were closed and the active five-minute check routine deleted.

Raw evidence is retained outside this public repository in `aaec75f-mashiro-abc.zip`: scripts, run_A/B/C.json, aligned samples, sanitized errors, DOM evidence and screenshots. The archive's noFrame wording must be interpreted with the correction above.

## Source collaboration

Actual Chzzk-Platter1.60.0 source at commit3fec7e1df0bed504d003e897c983054dec97306a was reviewed. See the comparison document for exact files, lines and MIT attribution. Same-origin hosting was already implemented. Wildcard permissions, stream extraction, referrer changes and repeated reloads were not justified by the evidence.

Gemini received the actual bounded diagnostics source section and authored a read-only numeric snapshot helper. GPT integration adds containing-buffer-range handling and independent exception boundaries; no whole-module copying or network behavior was introduced. Media counters cannot distinguish advertisements from programme content or establish the cause of a network failure.

## Local verification

- Full Node suite:368/368 pass; manifest/32 assets validated; build pass.
- New regression cases:8 playback-state,14 official-overlay,6 manual-diagnostic tests. Independent reviewer directly ran31 relevant cases before the final extra throwing-getter case; root then ran the complete368 suite.
- Synthetic local media fixture only:1024×768 and1280×800 four cards and right panel fit. At1280, all card bottoms<=792 and action rows have no horizontal overflow. At1024, all card bottoms<=760. Manual diagnostic dialog opened/closed and displayed only allowed fields. This fixture does not prove real CHZZK playback.
- No original installed extension/profile was changed. Temporary local fixture server and browser tab were closed.
