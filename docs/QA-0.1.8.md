# 0.1.8 panel preferences reliability

Build marker: `power-20261017.5`. Based on main's 0.1.7 (merge `d5a3dd6264c248f9a1a331db0333a3fcdfcdf644`).

## Bounded changes

- Both panel visibility controls expose the actual expanded state after hide, show and startup preference restoration.
- Viewport and panel resizing persist coordinates only if clamping changes the position.
- Preference storage keeps at most one operation in flight and one latest pending snapshot. Intermediate UI preferences are coalesced, including combined visibility/position changes. Synchronous and asynchronous storage failures do not poison later writes.
- The collector, network/eligibility rules, receipts, frame-loading policy and playback controls are unchanged. Generated page bundle rebuilt from source. The build marker changes to distinguish installed versions.

## Independent work and evidence

Three Codex agents had separate ownership: production floating-panel implementation, regression tests, and read-only independent review. The coordinating agent inspected the diff and ran the full suite. Independent review requested a combined position/visibility case; it was added along with synchronous storage failure coverage.

- Focused panel tests: 12 passed.
- The first 10 regression tests were independently replayed against the old production code: 5 passed / 5 failed. With unchanged panel coordinates, 100 resize events generated 100 old writes, versus 0 with the fix.
- Slow storage: one active operation and only the latest pending preference; final mixed position/visibility is preserved.
- Existing early-user-interaction hydration guards, pointer cancellation, keyboard controls, focus and offscreen clamping still pass.
- `npm test`: 237 passed, 0 failed locally.
- `npm run validate`: manifest and 32 assets passed.
- `npm run build`: installation ZIP built.

Gemini desktop (not its API) reviewed concrete code and reproducible cases from accessibility, async/resource and regression perspectives. These were explicitly single-model review perspectives, not actual Gemini subagents. Pending-snapshot clearing before await, error recovery, focus/ARIA and hydration were cross-checked against code and tests. Suggested extra hydration persistence was not adopted because the existing restore path already clamps; the claimed hidden-section sizing issue did not apply because measurement uses the visible holder, including its restore button.

## Limits

The user reports approximately two hours of successful real collection by Grok. This is user-reported success, not independently inspected receipt logs and not validation of this new patch. No new live collection, extended monitoring, broadcast reload or settings change was performed. Actual screen-reader behavior, real-window resizing and long-running production behavior remain unverified for 0.1.8. Tests use isolated DOM/runtime fixtures.

A storage operation that never settles still blocks later storage operations; the queue stays bounded to its latest pending preference. No timeout races or overlapping writes were introduced.

## Reproduce

Use the complete GitHub source at the desired commit (record `git rev-parse HEAD`), then run:

```sh
npm ci
npm test
npm run validate
npm run build
```

Installation ZIPs intentionally omit development dependencies and tests. Source archives include package files, tests and build scripts.
