import test from "node:test";
import assert from "node:assert/strict";
import { readLogPower, claimAvailableReward, PowerRequestError } from "../src/shared/log-power.js";

const channel = "a".repeat(32);
const reward = {claimId: "reward/one", claimType: "WATCH_5_MIN", state: "COMPLIED", saveType: "ACTIVE", amount: 100};
const response = content => ({ok: true, json: async () => ({code: 200, content})});

test("reads balance and filters non-watch rewards without collecting", async () => {
  const data = await readLogPower(channel, async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "include");
    assert.equal(options.headers, undefined);
    assert.ok(options.signal);
    assert.equal(url, `https://api.chzzk.naver.com/service/v1/channels/${channel}/log-power`);
    return response({amount: 1000, active: true, claims: [reward,
      {...reward, claimType: "PREDICTION"}, {...reward, claimType: "FOLLOW", state: "IN_PROGRESS"}, {}]});
  });
  assert.deepEqual(data, {balance: 1000, active: true, claims: [reward], diagnostics: {received:4, eligible:1, excluded:3, reasons:{invalidEntry:0,invalidId:1,unsupportedType:1,notReady:1,inactiveSave:0}}});
});

test("claim records successful receipt time, not an assumed server timestamp", async () => {
  const result = await claimAvailableReward(channel, reward, async (url, options) => {
    assert.ok(url.endsWith("/claims/reward%2Fone"));
    assert.equal(options.method, "PUT");
    assert.equal(options.credentials, "include");
    return response({amount: 1100});
  }, () => 123456);
  assert.equal(result.confirmedAt, 123456);
  assert.equal(result.amount, 100); // Response balance is not the earned amount.
  const unknown = await claimAvailableReward(channel, {...reward, amount: undefined}, async () => response(null));
  assert.equal(unknown.amount, null);
});

test("failed and ambiguous responses never produce success records", async () => {
  for (const fetcher of [
    async () => ({ok: false, status: 401}),
    async () => ({ok: false, status: 409}),
    async () => ({ok: false, status: 429}),
    async () => ({ok: true, json: async () => ({code: 500})}),
    async () => ({ok: true, json: async () => { throw new Error("not json"); }}),
    async () => { throw new Error("offline"); },
  ]) await assert.rejects(claimAvailableReward(channel, reward, fetcher));
});

for (const status of [401, 403, 409, 429]) {
  test(`claim preserves HTTP ${status} for a precise stop message`, async () => {
    await assert.rejects(claimAvailableReward(channel, reward, async () => ({ok: false, status})),
      error => error instanceof PowerRequestError && error.status === status);
    await assert.rejects(claimAvailableReward(channel, reward, async () => ({
      ok: true, json: async () => ({code: status}),
    })), error => error instanceof PowerRequestError && error.status === status);
  });
}

test("invalid channels and non-watch claims never reach the network", async () => {
  const noNetwork = () => { assert.fail("unexpected request"); };
  await assert.rejects(readLogPower("../other", noNetwork));
  await assert.rejects(claimAvailableReward(channel, {...reward, claimType: "PREDICTION"}, noNetwork));
});

test("unknown schemas fail closed rather than resetting balance to zero", async () => {
  for (const content of [null, {}, {amount: 0, active: true},
    {amount: -1, active: true, claims: []}, {amount: "100", active: true, claims: []}]) {
    await assert.rejects(readLogPower(channel, async () => response(content)));
  }
});
