import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { checkLoginSession, bindLoginCheck } from "../src/shared/login-session.js";

test("session check uses browser credentials and returns only login boolean", async () => {
  for (const loggedIn of [true, false]) {
    const result = await checkLoginSession(async (url, options) => {
      assert.equal(new URL(url).hostname, "comm-api.game.naver.com");
      assert.equal(options.credentials, "include");
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers, undefined);
      assert.ok(options.signal);
      return {ok: true, json: async () => ({code: 200, content: {loggedIn, nickname: "ignored"}})};
    });
    assert.equal(result, loggedIn);
  }
});

test("session errors and unknown schemas are not treated as logout", async () => {
  for (const data of [null, {}, {code: 500, content: {loggedIn: true}}, {code: 200, content: {loggedIn: "true"}}]) {
    await assert.rejects(checkLoginSession(async () => ({ok: true, json: async () => data})));
  }
  await assert.rejects(checkLoginSession(async () => ({ok: false})));
  await assert.rejects(checkLoginSession(async () => { throw new Error("offline"); }));
});

test("button checks only on demand and authenticates only on confirmed success", async () => {
  const dom = new JSDOM('<div class="topbar"></div><button id="login"></button>');
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  globalThis.document = dom.window.document;
  let calls = 0;
  let authenticated = 0;
  let state = true;
  globalThis.fetch = async () => {
    calls++;
    if (state === null) throw new Error("offline");
    return {ok: true, json: async () => ({code: 200, content: {loggedIn: state}})};
  };
  try {
    const button = document.querySelector("button");
    bindLoginCheck(button, () => { authenticated++; });
    assert.equal(calls, 0);
    for (state of [true, false, null]) {
      button.click();
      assert.equal(button.disabled, true);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(button.disabled, false);
      assert.equal(authenticated, 1);
      assert.equal(document.querySelector(".login-status a").hidden, state === true);
    }
    assert.match(document.querySelector(".login-status").textContent, /로그아웃으로 판단한 것은 아닙니다/);
  } finally {
    dom.window.close();
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test("reward identity is hashed, stable, logout-aware and unavailable identity fails closed", async () => {
  const {checkPowerAccount}=await import('../src/shared/login-session.js');
  const fetcher=content=>async()=>({ok:true,json:async()=>({code:200,content})});
  const a=await checkPowerAccount(fetcher({loggedIn:true,userIdHash:'account_A_12345678'}));
  assert.match(a,/^[a-f0-9]{64}$/);
  assert.equal(a,await checkPowerAccount(fetcher({loggedIn:true,userIdHash:'account_A_12345678'})));
  assert.notEqual(a,await checkPowerAccount(fetcher({loggedIn:true,userIdHash:'account_B_12345678'})));
  assert.equal(await checkPowerAccount(fetcher({loggedIn:false})),null);
  await assert.rejects(checkPowerAccount(fetcher({loggedIn:true})),/계정 식별/);
});
