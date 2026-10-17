# 0.1.6 verification and cloud handoff

Release metadata: **0.1.6**. Internal build: **power-20261017.3**.
This source update is not a Chrome Web Store publication.

## Reproduce without a user account

Use Ubuntu, Node.js 22, npm and zip, matching `.github/workflows/validate.yml`:

```sh
npm ci
npm test
npm run validate
npm run build
```

Tests use node:test, jsdom, synthetic identities and injected fetch/storage/timers.
No CHZZK login, browser profile, cookie, token or real reward is needed. Restrict
outbound application traffic after dependency installation when running independent
cloud validation. Do not run the tag-triggered release workflow for validation.

The consolidated implementation passed 225 local regression tests. The metadata-only
0.1.6 change passed version consistency, manifest/assets validation and packaging.
GitHub Actions provides independent Linux/Node 22 results for the uploaded commit.

## Important cases

- Local playback waits do not consume HTTP failure budgets or send reward requests.
- OFF, owner transfer, slot removal and lifecycle changes cancel obsolete work.
- Server Retry-After deadlines and uncertain PUT protections remain intact.
- Reward counts satisfy raw = eligible + excluded; alreadyHandled is a subset of eligible.
- Receipts require validated responses, account checks and durable storage. Later
  zero-result polls or failures must not erase prior durable success.
- Blank-frame recovery requires 20 consecutive qualifying samples with a real body,
  retries once, and never retries a frame with real-document/media history.
- Panel movement/hiding cannot operate the collector; delayed hydration, serialized
  writes and viewport boundaries are covered.

## Optional long simulation

For an independently requested three-hour elapsed simulation:

```sh
node dev/soak-power.mjs --duration-ms=10800000 --scale=1
```

This uses simulated server responses, not CHZZK. Review its scheduled scenarios and
supplement coverage as needed. Record elapsed time, source hashes, failures and
cleanup. Accelerated clock hours are not elapsed hours. This command has not been
claimed as a completed three-hour run for this release.

## Limits

Installed-browser panel drag/hide, saved-state restoration and viewport clamping were
observed in the earlier active build. The new build's live reward claiming and real
blank-frame failure recovery remain unverified. Cloud mocks cannot prove them.
No real receipt records, account details or private computer logs are included here.
