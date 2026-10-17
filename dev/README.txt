CheeseMoa standalone auto-collection harness — standalone-power-harness-20261011.1

No extension install/reload/login required. Uses the existing injectable collector/session/response core, with an in-memory storage, virtual clock, cancellable lock, and simulated server. It makes no CHZZK requests and does not access existing user storage.

From this repair directory:
  node dev/run-power-harness.mjs
  node --test test/power-standalone.test.mjs
  npm test
  python3 -m http.server 8893 --bind 127.0.0.1

Open http://127.0.0.1:8893/dev/power-harness.html in Chrome.
Select a server condition, click New simulated session, then Auto collection ON/OFF. Next scheduled time executes the virtual timer. Run all scenarios reports PASS/FAIL with request/receipt counts and a privacy-safe event journal.

Machine results: dev/power-harness-results.json
Generated reports are local test artifacts and are not committed.

Validated: eligible claim once, GET recovery, 403 stop, uncertain PUT preservation, OFF cancellation, account/channel changes, lifecycle OFF, response deadline, lock deadline/restart, concurrent deduplication.
Known limitation: this is simulated-server validation, not real CHZZK reward success. Production uses a page-owner coordinator. These harness results do not prove live-service claims.
