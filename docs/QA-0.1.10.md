# 0.1.10 functional review

Base: main `5a5dd175802416220726cb6178becc5d5342e9ff`. Build marker: `power-20261017.7`.

## Changes

- Only post-PUT identity verification may query the same pinned document while playback is paused. It still requires a fresh matching account; ordinary paused polling makes no HTTP request, and reward requests remain playback-gated.
- A definitive 409 retains a durable already-claimed guard and continues without counting a successful receipt or resending the claim.
- Confirmed, durably saved receipts remain visible during subsequent playback waits or balance errors.
- The 2,000-record safety limit remains intact with a specific diagnostic. No uncertain records are deleted to make room.
- Direct-page labels use the canonical channel ID rather than misidentifying a generic page title as a broadcaster.
- Popup tests use a bounded elapsed-time wait instead of 100 event-loop spins; the same assertions also run with 25 ms storage latency.
- Store target identifiers are user-confirmed only; store execution remains disabled.

## Review and verification

Grok Bot's `[개발] 프로그램 리뷰` supplied isolated reproduction findings against the base SHA and diagnostic fixture screenshots. Independent implementation and test agents reproduced relevant failures and an independent reviewer checked the patches. Gemini desktop reviewed the concrete proposal and requested flag misuse, changed-document, 409/ledger-limit and receipt-rendering boundary checks; these are covered in the regression tests.

The test-wait issue reproduced with 25 ms mocked storage latency; the revised two-case popup suite passed 20 fresh-process repetitions (40 cases). This demonstrates test-wait resilience, not a live product defect.

Run `npm ci --ignore-scripts`, `npm test`, `npm run validate`, and `npm run build`. The generated page bundle must match its sources. Regression coverage includes actual coordinator/transport/page-agent integration with mocked HTTP, account mismatch, lost document, pause after PUT, zero-HTTP paused polling, no duplicate PUT after recovery, 409 at 1,999/2,000 records, and receipt preservation after malformed balance responses.

## Limits and deliberate differences from Grok's proposals

Malformed balance schemas and ledger exhaustion still stop safely. They are not repaired by continuing blindly or deleting duplicate-prevention records. A 409 is never represented as this extension's successful claim. The direct-page channel ID fallback is truthful but is not a resolved broadcaster name.

No live claims were performed for this release. The cause of the earlier 18:49 live stop remains unconfirmed. Fixture screenshots are diagnostic evidence, not live playback or store-ready marketing assets. Genuine multichannel capture must use the exact merged and CI-verified main commit. Store submission, credential setup and changes to the user's running browser are outside this release.
