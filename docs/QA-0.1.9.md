# 0.1.9 login-status follow-up isolation

## Evidence boundaries

The user asks about store reviews reporting repeated login after already signing in. The exact public listing and developer detail URLs were supplied, both containing item ID `opdjekfdjimddbnlamjgbpacpaldkoed`. Web retrieval could not access them, and Chrome navigation returned `Not allowed`. Therefore no review text, author, date, store version or review resolution was independently observed. No quoted review or claim that the reported real-world issue is solved is justified.

The item ID is recorded as user-provided in the release config. The publisher ID remains null and `verified` remains false. The UUID in the developer URL is not assumed to be the API publisher ID; official documentation directs verification in Publisher > Settings. Credentials and store operations remain unconfigured/unperformed.

## Reproduced extension issue

`bindLoginCheck` previously wrapped both the successful server login check and the subsequent optional screen-work callback in one catch. If login returned true but the callback threw or rejected, the UI replaced confirmed login with an unavailable-session message and exposed the login link. This could unnecessarily prompt another login even though the preceding session check succeeded.

The callback now has a separate catch. Confirmed login stays visible, the login link stays hidden, and a separate screen-work failure is shown without raw exception text. The button recovers; a later successful attempt clears the follow-up failure. This is a proven UI classification bug, not proof of the cause of any inaccessible store review.

The popup has no callback, so this particular bug cannot explain its login state. The viewer callback still asks the user before refreshing frames. There is no new automatic reload, login, logout or cookie/settings change.

## Existing protections retained

- Checks occur only after an explicit button click; network failures and malformed responses are not interpreted as logout.
- Requests use the browser's normal credentials and discard profile fields. No cookie values or session credentials are read, copied or stored.
- True server logout, session expiration, account changes and security reauthentication remain authoritative and are not bypassed.
- A successful top-level login check does not prove embedded frames share that session; profile, private-window and site cookie policy differences remain possible. No cookie/permission setting is automatically weakened.
- Reward identity/duplicate protection and actual broadcasts are untouched.

## Validation

Separate implementation and test agents owned the production module and tests. An independent reviewer checked the combined diff. Exact new tests against the old module reproduced one failure (5 pass / 1 fail); fixed focused suite passes all 6. Tests cover synchronous and asynchronous callback failure, subsequent recovery, hidden login link, error redaction, no cookie/storage access and discarded profile fields.

Full suite: 286 passed, 0 failed. Manifest and 32 assets validated; build passed. The independent reviewer separately passed 14 login/viewer/playback-wait tests and confirmed bundle byte equivalence. These are isolated tests. Actual store review reproduction, real-browser login persistence, embedded sessions and newly staged runtime activation remain unverified.
