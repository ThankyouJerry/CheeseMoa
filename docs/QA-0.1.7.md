# 0.1.7 playback-readiness race fix

Build marker: `power-20261017.4`. This report covers code and mock runtime tests, not live reward collection.

## Reproduced defect

If playback stops after eligibility GET succeeds but before PUT dispatch, the page agent used to return a generic transport failure. The adapter classified it as a retryable GET failure, consuming the HTTP failure budget. The added production-runtime regression failed before the patch (`waiting` rather than `playback-wait`).

## Fix

Both page agents now return an explicit local-readiness envelope at the readiness checks. Invalid channel input remains a schema failure. The adapter requires the matching build, status zero, explicit readiness code, eligibility phase and `mutationDispatched === false` before entering local playback wait. A failed local playback probe before a requested PUT also proves that no mutation was dispatched. Generic network errors are never reclassified by their message or concurrent playback state.

The collector's existing locked rollback removes only a proven-unsent reservation. Dispatched or unknown PUT outcomes retain the existing duplicate guard. Real HTTP backoff and fatal schema behavior remain unchanged.

## Verification

- `npm ci --ignore-scripts --no-audit --no-fund`
- `npm test`: 231 passed, 0 failed locally.
- `npm run validate`: manifest and 32 assets passed.
- `npm run build`: installation ZIP generated.
- New runtime regression repeatedly interrupts playback after eligibility GET (more than eight cycles): ON remains enabled, zero PUTs/receipts, zero HTTP failure budget, no stranded reservation, one timer. Recovery claims once; repeated polling does not duplicate it.
- Additional tests cover the legacy host, invalid channel, pre-request readiness loss, network/schema/JSON failures, post-PUT uncertainty, and adapter envelope guard rejection.
- Gemini desktop reviewed the proposed fix and the concrete implementation/test results. It emphasized reservation rollback and strict unsent boundaries, then reported no concrete blockers. Its suggestion to retry schema failures was not adopted: existing fatal schema policy is preserved. This is advisory review, not independent execution by Gemini.
- Actual playback, real reward collection and three-hour soak: **not run for this patch**. No live auto-claim was enabled and no broadcast page was reloaded.

## Complete source for independent validation

Clone this repository and record `git rev-parse HEAD` before running the commands above. GitHub's source ZIP for that commit includes package.json, package-lock.json, test/, dev/ and scripts/build-power-page.mjs. `dist/CheeseMoa-v0.1.7.zip` is only the installable extension and intentionally excludes development tools.
