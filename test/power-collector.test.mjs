import test from "node:test";
import assert from "node:assert/strict";
import { createPowerCollector, POWER_STORAGE_KEY } from "../src/shared/power-collector.js";

const channel = "a".repeat(32);
const account = "b".repeat(64);
const otherAccount = "c".repeat(64);
function harness() {
  let data = {};
  let tail = Promise.resolve();
  let writes = 0;
  const calls = [];
  const h = { calls, failWrite: 0, putError: null, active: true };
  h.storage = {
    get: async () => structuredClone(data),
    set: async update => {
      if (++writes === h.failWrite) throw new Error("disk full");
      data = structuredClone(update);
    },
  };
  h.locks = { request(name, options, callback) {
    callback ||= options;
    const result = tail.then(callback);
    tail = result.catch(() => {});
    return result;
  } };
  h.fetcher = async (url, options) => {
    calls.push(options.method);
    if (options.method === "PUT" && h.putError) throw h.putError;
    return {ok: true, json: async () => ({code: 200, content: options.method === "PUT" ? {} : {
      amount: 1000, active: h.active,
      claims: [{claimId: "one", claimType: "WATCH_1_HOUR", state: "COMPLIED", saveType: "ACTIVE", amount: 100}],
    }})};
  };
  h.create = () => createPowerCollector({...h, now: () => 123456});
  return h;
}

test("disabled collection makes no requests; inactive channel never claims", async () => {
  const h = harness();
  await h.create().collect(channel);
  assert.deepEqual(h.calls, []);
  h.active = false;
  await h.create().collect(channel, {enabled: true, accountId: account});
  assert.deepEqual(h.calls, ["GET"]);
});

test("two viewers and a reopened viewer claim once and retain one receipt", async () => {
  const h = harness();
  await Promise.all([h.create(), h.create()].map(c => c.collect(channel, {enabled: true, accountId: account})));
  await h.create().collect(channel, {enabled: true, accountId: account});
  assert.equal(h.calls.filter(method => method === "PUT").length, 1);
  const state = await h.create().history(account);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0].confirmedAt, 123456);
});

test("uncertain request survives restart without fake success or blind retry", async () => {
  const h = harness();
  h.putError = new Error("connection lost");
  await assert.rejects(h.create().collect(channel, {enabled: true, accountId: account}));
  h.putError = null;
  await h.create().collect(channel, {enabled: true, accountId: account});
  const state = await h.create().history(account);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.attempts[0].status, "unconfirmed");
  assert.equal(h.calls.filter(method => method === "PUT").length, 1);
});

test("storage failure before claim prevents mutation; after claim prevents duplicate retry", async () => {
  for (const failWrite of [1, 2]) {
    const h = harness();
    h.failWrite = failWrite;
    await assert.rejects(h.create().collect(channel, {enabled: true, accountId: account}), /disk full/);
    assert.equal(h.calls.filter(method => method === "PUT").length, failWrite - 1);
    if (failWrite === 2) {
      await h.create().collect(channel, {enabled: true, accountId: account});
      assert.equal(h.calls.filter(method => method === "PUT").length, 1);
      assert.equal((await h.create().history(account)).attempts[0].status, "pending");
    }
  }
});

test("history deletion does not erase deduplication guards", async () => {
  const h = harness();
  const c = h.create();
  await c.collect(channel, {enabled: true, accountId: account});
  await c.clearHistory(account);
  await c.collect(channel, {enabled: true, accountId: account});
  assert.equal((await c.history(account)).receipts.length, 0);
  assert.equal(h.calls.filter(method => method === "PUT").length, 1);
});

test("channel removal during read prevents later reward requests", async () => {
  const h = harness();
  await h.create().collect(channel, {enabled: true, accountId: account, isCurrent: () => h.calls.length === 0});
  assert.deepEqual(h.calls, ["GET"]);
});

test("corrupt storage fails closed without overwriting records", async () => {
  const h = harness();
  await h.storage.set({[POWER_STORAGE_KEY]: {version: 99}});
  await assert.rejects(h.create().collect(channel, {enabled: true, accountId: account}));
  assert.deepEqual(h.calls, []);
});

test("account histories are isolated while legacy unknown-account guards remain global", async () => {
  const h = harness();
  const collector = h.create();
  await collector.collect(channel, {enabled: true, accountId: account});
  assert.equal((await collector.history(account)).receipts.length, 1);
  assert.equal((await collector.history(otherAccount)).receipts.length, 0);
  await collector.collect(channel, {enabled: true, accountId: otherAccount});
  assert.equal(h.calls.filter(method => method === "PUT").length, 2);
  await collector.clearHistory(account);
  assert.equal((await collector.history(account)).receipts.length, 0);
  assert.equal((await collector.history(otherAccount)).receipts.length, 1);
  assert.equal((await collector.history(account)).attempts.length, 1);

  const legacy = harness();
  await legacy.storage.set({[POWER_STORAGE_KEY]: {version: 1, receipts: [], attempts: [
    {key: JSON.stringify([channel, "one"]), channelId: channel, claimId: "one", status: "pending", attemptedAt: 1},
  ]}});
  await legacy.create().collect(channel, {enabled: true, accountId: account});
  await legacy.create().collect(channel, {enabled: true, accountId: otherAccount});
  assert.equal(legacy.calls.filter(method => method === "PUT").length, 0);
  assert.equal((await legacy.create().history(account)).attempts[0].accountId, undefined);
});

test("account missing or changed before PUT never sends a claim", async () => {
  const h = harness();
  const collector = h.create();
  await assert.rejects(collector.collect(channel, {enabled: true}), /계정 식별/);
  assert.deepEqual(h.calls, []);
  let checks = 0;
  await collector.collect(channel, {enabled: true, accountId: account,
    isCurrent: () => ++checks < 4});
  assert.deepEqual(h.calls, ["GET"]);
  assert.equal((await collector.history(account)).attempts.length, 0);
});

test("account switch after PUT keeps an uncertain guard without a success receipt", async () => {
  const h = harness();
  await assert.rejects(h.create().collect(channel, {enabled: true, accountId: account,
    isSameAccount: () => false}), /계정/);
  const state = await h.create().history(account);
  assert.equal(h.calls.filter(method => method === "PUT").length, 1);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.attempts[0].status, "unconfirmed");
  await h.create().collect(channel, {enabled: true, accountId: account});
  assert.equal(h.calls.filter(method => method === "PUT").length, 1);
});

test("stopping while PUT is in flight still records a confirmed server response", async () => {
  const h = harness();
  let release;
  const original = h.fetcher;
  h.fetcher = async (url, options) => {
    if (options.method === "PUT") await new Promise(resolve => { release = resolve; });
    return original(url, options);
  };
  let active = true;
  const pending = h.create().collect(channel, {enabled: true, accountId: account,
    isCurrent: () => active, isSameAccount: () => true});
  for (let i = 0; i < 20 && !release; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof release, "function");
  active = false;
  release();
  await pending;
  assert.equal((await h.create().history(account)).receipts.length, 1);
});

test("attempt cap stops before mutation and preserves all duplicate guards", async () => {
  const h = harness();
  await h.storage.set({[POWER_STORAGE_KEY]: {version: 1, receipts: [], attempts:
    Array.from({length: 2000}, (_, i) => ({key: `old:${i}`, accountId: account}))}});
  await assert.rejects(h.create().collect(channel, {enabled: true, accountId: account}), /중복 방지 기록 한도/);
  assert.equal(h.calls.filter(method => method === "PUT").length, 0);
  assert.equal((await h.create().history(account)).attempts.length, 2000);
});

for (const status of [401, 403, 409, 429]) {
  test(`HTTP ${status} leaves an account-scoped, non-success attempt`, async () => {
    const h = harness();
    const normalFetch = h.fetcher;
    h.fetcher = async (url, options) => {
      if (options.method !== "PUT") return normalFetch(url, options);
      h.calls.push("PUT");
      return new Response(null, {status});
    };
    await assert.rejects(h.create().collect(channel, {enabled: true, accountId: account}));
    const state = await h.create().history(account);
    assert.equal(state.receipts.length, 0);
    assert.equal(state.attempts[0].status, status === 409 ? "already-claimed" : "unconfirmed");
    h.fetcher = normalFetch;
    await h.create().collect(channel, {enabled: true, accountId: account});
    assert.equal(h.calls.filter(method => method === "PUT").length, 1);
  });
}

test('old uncertain claim blocks only that ID and reports the blocked reward',async()=>{
 const h=harness();h.putError=new Error('unknown');const c=h.create();
 await assert.rejects(c.collect(channel,{enabled:true,accountId:account}));h.putError=null;
 const blocked=await c.collect(channel,{enabled:true,accountId:account});
 assert.equal(blocked.blocked,1);assert.equal(blocked.status,'blocked');
 const original=h.fetcher;
 h.fetcher=async(u,o)=>o.method==='GET'?{ok:true,json:async()=>({code:200,content:{amount:1000,active:true,claims:[{claimId:'next-hour',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:100}]}})}:original(u,o);
 const next=await h.create().collect(channel,{enabled:true,accountId:account});
 assert.equal(next.collected,1);assert.equal((await c.history(account)).attempts.length,2);
});
