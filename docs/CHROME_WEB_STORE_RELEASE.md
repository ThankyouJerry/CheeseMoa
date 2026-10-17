# CheeseMoa Chrome Web Store automation

This automation is restricted to `ThankyouJerry/CheeseMoa`. It does not manage other repositories or store items. It is **not activated**: the publisher and item IDs are explicitly user-confirmed and their identity has not been independently verified, no credentials or GitHub environments have been configured, and no store requests have been made.

## Release boundaries

The manual `Chrome Web Store` workflow defaults to a local dry run. Tests, manifest validation, build, exact ZIP validation and artifact creation run without Chrome Web Store credentials. The workflow checks out one commit and passes the same artifact/digest to later jobs; mutation jobs do not rebuild it.

- `dry-run`: verify the local artifact; zero store/OAuth requests.
- `upload`: upload only, never submit or publish.
- `submit`: upload, wait for the separate `cws-submit` protected environment approval, revalidate and reupload the identical artifact, then request review with `STAGED_PUBLISH`, `skipReview: false`, `blockOnWarnings: true`. This does not automatically release to users after review. Final publication remains a manual developer-dashboard action with user approval; the wrapper has no public-release operation.

A job environment name alone is not a security gate. Credential-free preflight must positively verify the configured reviewer's required approval, prevent self-review, disallow administrator bypass, and restrict deployment to main. Missing/inaccessible/unprotected environments fail closed. The user must review the commit, version, SHA-256 and store item before approving. Do not enable approval bypasses to make a run pass.

## Current target verification blocker

Read-only navigation to `https://chrome.google.com/webstore/devconsole` was refused by the computer-use tool (`Not allowed`). No alternative credential/cookie access was attempted. The unpacked extension ID is **not** evidence of the published item ID. The user subsequently supplied item ID `opdjekfdjimddbnlamjgbpacpaldkoed` and matching public/developer URLs. Both exact URLs remained inaccessible to the tools. The user subsequently explicitly confirmed publisher ID `e0f34a53-0c19-4943-8fdf-3d6bb9534075` and item ID `opdjekfdjimddbnlamjgbpacpaldkoed`. The config records both as user-confirmed identifiers, not identities independently verified through the dashboard or API. `verified: false` and `reviewerLogin: null` remain unchanged, so recording these values does not activate store requests. A UUID appearing in a dashboard URL alone is not treated as verified API publisher identity.

Before enabling, inspect the CheeseMoa item in the real developer dashboard and confirm its title, item ID and publisher ID. Record only the non-secret identifiers in the config via a reviewed commit. `reviewerLogin` must be the user's verified GitHub login, not an invented identity. Do not populate these values from a different extension.

## Approval required before authentication setup

Code preparation is not authorization to create access. Separate, specific user approval is still required before each security-sensitive configuration action:

1. On the user's chosen Google Cloud project and the publisher that owns **CheeseMoa**, enable/configure the CWS OAuth client and grant only `https://www.googleapis.com/auth/chromewebstore`. This is the minimum documented write scope, but it is **not an item-scoped Google permission**; an account/publisher may own other extensions. The code's fixed item allowlist limits this workflow, not the underlying OAuth credential. Never imply otherwise. Do not add Drive/Gmail or other scopes, replace existing credentials, or grant a service account access without separate approval.
2. In `ThankyouJerry/CheeseMoa` only, configure protected environments `cws-upload` and `cws-submit` with the user's reviewer login, self-review prevention, administrator bypass disabled and main-only deployment. The submit environment is the per-run submission approval boundary; upload approval is deliberately conservative too.
3. The user supplies `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` directly through each approved GitHub environment's secret UI. Do not paste values into chat, read them back, log them, or share them with an AI. No credential values belong in repository files, artifacts, command-line arguments or workflow inputs. The wrapper exchanges a refresh token only inside the authorized mutation step and keeps the short-lived access token in memory.

With self-review prevention and one configured reviewer, that reviewer cannot also initiate the run. An independently authorized initiator must dispatch it; for a sole-account workflow, keep manual dashboard submission instead of weakening the gate.

The current official GET-environment documentation does not show `can_admins_bypass` in its response example. The policy checker requires an explicit `false`; if the real API omits it, activation remains blocked even after the UI is configured. This compatibility check is **unverified**, not solved by adding credentials. Keep manual dashboard submission until a supported, independently reviewed proof of non-bypassable approval is available; do not set a fake response field or remove the guard to proceed.

If the account cannot enforce the required GitHub environment protections, keep automation disabled and use manual dashboard upload/submission. Do not weaken the checks. The optional access-token code path is for controlled integrations, not a request to paste tokens into chat.

## Exact artifact checks

The validator requires the expected SHA-256 and compares every package file against the checked-out source. It rejects extra/missing files, unsafe paths, duplicates, symlinks, invalid ZIP records, excessive expansion, mismatched manifest/package/lock versions and a stale generated page bundle. It verifies a frozen copy and returns those exact bytes for upload, avoiding file-path replacement between check and send. No new npm runtime dependency is used.

```sh
npm ci --ignore-scripts
npm test
npm run validate
npm run build
node scripts/cws-api.mjs upload --artifact dist/CheeseMoa-v0.1.8.zip --sha256 <SHA256SUMS-value> --dry-run
```

Use the actual package version instead of the example when it changes. Missing mode is an error; no implicit upload-and-publish behavior exists. Unknown/duplicate options are rejected. This deliberately avoids the third-party CLI's documented combined operation when its command is omitted.

## Failure handling and limitations

Mutation requests are never retried automatically: a timeout may mean the server accepted the request. Check the dashboard and seek a new user decision before retrying. Only upload-status GET polling is retried, with a fixed bound. Credentials, raw HTTP bodies and underlying exceptions are omitted from diagnostics; preserve the sanitized result and run URL.

CWS API v2 does not expose an atomic draft digest/compare-and-swap guard. Submission reuploads the approved bytes immediately before the staged-submission request, but an out-of-band dashboard/API upload in between cannot be ruled out. Avoid concurrent manual uploads, including while an approval is pending. The workflow serializes its own releases. If upload completes asynchronously, fetchStatus does not prove the uploaded draft version; submission fails closed and requires dashboard inspection instead of inferring it from an older submitted revision.

Tests are mocks and local ZIP checks. They do not prove credentials, store permissions, review eligibility or real upload success. Existing extension version/runtime files and live playback are not changed by this automation setup.

## Sources

- [Official CWS API v2](https://developer.chrome.com/docs/webstore/api)
- [Upload method](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [Fetch status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
- [Publish types and staged review](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [OAuth setup and scope](https://developer.chrome.com/docs/webstore/using-api)
- [Service-account access is publisher-wide](https://developer.chrome.com/docs/webstore/service-accounts)
- [Third-party CLI default behavior](https://github.com/fregante/chrome-webstore-upload-cli)

## Verification of this setup change

Full suite: 284 tests passed; manifest/assets validation and build passed. The independent security reviewer ran 47 automation tests and a real-package dry run with no credentials or network requests. Three implementation agents handled the API wrapper, artifact verifier, and workflow/policy gate; a separate reviewer inspected their combined change. New Actions references were resolved from official action repositories and pinned to full commits. Store upload/submission/publication and credential/environment setup remain unperformed.
