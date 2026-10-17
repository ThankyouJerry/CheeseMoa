# 0.1.11 multiview audio review

Base main: `b9054c9a6af0424923bec75508c3914f9ad2f204`. Build marker: `power-20261017.8`.

## Reproduced and fixed

The same-origin host changed its mute label immediately but did not apply mute or volume to the selected player until the next one-second watchdog tick. The watchdog also overwrote volume changes made inside the official player.

Host controls now apply immediately to their own card. Native player volume changes update that card's preferences, and periodic checks apply preferences only to newly discovered media. Removed and stopped media lose their listeners; stale and secondary-media events cannot overwrite the authoritative current player's preferences. Default mute, frame identities, origin checks, playback readiness and reward logic remain unchanged.

Independent regression tests failed on the old implementation and passed on the fix. Coverage includes two-card isolation, native-state persistence, zero media writes over 30 unchanged ticks, replacement and stale events, listener cleanup after the loading deadline, queued programmatic events and secondary media.

Gemini desktop reviewed the proposal and actual event-handler code. Its initial asynchronous stale-event concern was withdrawn after verifying that the handler reads current DOM properties rather than historical payloads. A targeted queued-event regression confirms that a later volume of 0.2 is retained. Gemini and an independent reviewer found no blocking issue in the bounded audio change. Gemini also reviewed the route cleanup proposal and found no concrete blocker; the independent reviewer verified the final route and Start-button guards.

## Verification commands

Run `npm ci --ignore-scripts`, `npm test`, `npm run validate`, and `npm run build` from a full source checkout, not the install-only extension ZIP. The source includes the lockfile, tests and build scripts. Pin the exact Git commit when sharing a checkout for reproduction.

## Live evidence and limits

Grok compared the same two public channels on base main in isolated cloud Chromium profiles on 2026-10-17, 21:06–21:10 KST. The extension-free official baseline also failed: one page disconnected; the other remained at currentTime 0, zero decoded frames and readyState 0 with a CDN request failure/CORS console error. Extension-enabled direct playback and multiview also had zero advancing frames. The direct-page condition is not a single-card same-origin host test. These observations block a clean extension-specific playback diagnosis; they do not prove that every failure has one cause. No security policy or access restriction was bypassed.

Two simultaneous decoded streams, real audio output, real add/remove/reload behavior and long-duration live playback remain unverified. No real reward claim was performed for this release. Unit tests and diagnostic screenshots are not live playback evidence.

A second reproduced issue is fixed: leaving the multiview route through SPA navigation previously stopped its watchdog but left mounted frames and a legacy playback probe alive. Exact route checks now immediately reject legacy playback eligibility; the next existing watchdog tick or a hashchange/popstate event removes only this host's frames, timers, audio listeners, overlay and message listener. A stale Start button checks the route before allocating a frame. Eight focused lifecycle regressions cover invalid path/hash/query, unrelated page preservation, valid-route behavior zero frame allocation after a silent idle route change, and zero HTTP requests for balance/claim after route exit before cleanup. Existing BFCache coverage remains passing.

An idle overlay can remain after an eventless history.replaceState when no frame/watchdog exists; its Start button safely cleans up instead of loading media. No perpetual polling or history API patching was added. UI readiness labels alone do not demonstrate advancing decoded video.
