import test from "node:test";
import assert from "node:assert/strict";
import { createPowerSession } from "../src/shared/power-session.js";
const flush = () => new Promise(resolve => setImmediate(resolve));
const account = "b".repeat(64);
const otherAccount = "c".repeat(64);

function harness() {
  const h = {calls: [], status: [], channels: [{id: "live:a", type: "live", resourceId: "a"},
    {id: "video:1", type: "video", resourceId: "1"}], accountId: account, timer: null};
  h.session = createPowerSession({
    collector: {collect: async (id, options) => {
      assert.equal(options.enabled, true);
      assert.equal(await options.isCurrent(), true);
      assert.equal(options.accountId, h.accountId);
      h.calls.push(id);
      if (h.error) throw h.error;
      return {collected: 1};
    }},
    getChannels: () => h.channels, checkAccount: async () => h.accountId,
    onStatus: s => h.status.push(s),
    schedule: (fn, delay) => { assert.equal(delay, 60000); h.timer = fn; return 1; },
    cancel: () => { h.timer = null; },
  });
  return h;
}

test("opt-in only, live channels only, one recurring timer, stop cancels", async () => {
  const h = harness();
  assert.deepEqual(h.calls, []);
  h.session.start(); h.session.start();
  await flush();
  assert.deepEqual(h.calls, ["a"]);
  assert.ok(h.timer);
  h.channels = [];
  await h.timer();
  assert.deepEqual(h.calls, ["a"]);
  h.session.stop();
  assert.equal(h.timer, null);
  assert.equal(h.status.at(-1).enabled, false);
});

test("logout or request failure stops automatic requests without repeated polling", async () => {
  for (const failure of ["logout", "network", "rate-limit"]) {
    const h = harness();
    h.accountId = failure === "logout" ? null : account;
    if (failure !== "logout") h.error = Object.assign(new Error("failed"), {status: failure === "rate-limit" ? 429 : 500});
    h.session.start();
    await flush();
    assert.equal(h.timer, null);
    assert.ok(["error", "auth-required"].includes(h.status.at(-1).status));
    assert.equal(h.status.at(-1).enabled, false);
    if (failure === "logout") assert.deepEqual(h.calls, []);
  }
});

test("stop during login check prevents claims", async () => {
  let resolve;
  let called = false;
  const session = createPowerSession({
    collector: {collect: () => {called = true;}},
    getChannels: () => [{id: "live:a", type: "live", resourceId: "a"}],
    checkAccount: () => new Promise(r => {resolve = r;}),
    onStatus: () => {}, schedule: () => assert.fail("unexpected timer"), cancel: () => {},
  });
  session.start(); session.stop(); resolve(account);
  await flush();
  assert.equal(called, false);
});

for (const [status, expected] of [[401, /로그인/], [403, /거부/], [409, /이미 처리/], [429, /요청 제한/]]) {
  test(`HTTP ${status} stops with an actionable status`, async () => {
    const h = harness();
    h.error = Object.assign(new Error("request failed"), {status});
    h.session.start();
    await flush();
    assert.ok(["error", "auth-required"].includes(h.status.at(-1).status));
    assert.match(h.status.at(-1).detail, expected);
    assert.equal(h.timer, null);
  });
}

test("timeout stops and explains that a claim cannot be retried automatically", async () => {
  const h = harness();
  h.error = Object.assign(new Error("timed out"), {name: "TimeoutError"});
  h.session.start();
  await flush();
  assert.match(h.status.at(-1).detail, /시간이 초과.*자동 재시도하지 않습니다/);
});

test("account switch between recurring checks stops collection before another claim", async () => {
  const h = harness();
  h.session.start();
  await flush();
  assert.deepEqual(h.calls, ["a"]);
  h.accountId = otherAccount;
  await h.timer();
  assert.deepEqual(h.calls, ["a"]);
  assert.equal(h.timer, null);
  assert.match(h.status.at(-1).detail, /계정 변경/);
  h.session.start();
  await flush();
  assert.deepEqual(h.calls, ["a", "a"]);
});


test("refuses several main channels without sending reward requests", async () => {
  const h = harness();
  h.channels.push({id: "live:b", type: "live", resourceId: "b"});
  h.session.start();
  await flush();
  assert.deepEqual(h.calls, []);
  assert.equal(h.status.at(-1).enabled, false);
  assert.match(h.status.at(-1).detail, /주 채널을 하나/);
});

test('reward hints cannot restart a stopped or failed session',async()=>{
 const h=harness();h.session.checkNow();await flush();assert.equal(h.calls.length,0);
 h.error=Object.assign(new Error('denied'),{status:403,method:'PUT'});
 h.session.start();await flush();assert.equal(h.status.at(-1).enabled,false);
 h.error=null;h.session.checkNow();await flush();assert.equal(h.calls.length,1);assert.equal(h.timer,null);
});
