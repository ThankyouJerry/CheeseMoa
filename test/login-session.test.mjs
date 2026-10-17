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

test('confirmed login survives synchronous or asynchronous follow-up failure without suggesting relogin', async () => {
  for (const followUp of [() => {throw new Error('private callback details');}, async () => {throw new Error('private callback details');}]) {
    const dom = new JSDOM('<button id="login"></button>');
    const previous = {document: globalThis.document, fetch: globalThis.fetch};
    globalThis.document = dom.window.document;
    let requests = 0;
    globalThis.fetch = async () => {requests++; return {ok: true, json: async () => ({code: 200, content: {loggedIn: true}})};};
    try {
      const button = document.querySelector('button');
      let followUpCalls = 0;
      bindLoginCheck(button, () => {followUpCalls++; if (followUpCalls === 1) return followUp();});
      button.click();
      await new Promise(resolve => setImmediate(resolve));
      const panel = document.querySelector('.login-status');
      assert.match(panel.textContent, /로그인이 확인됐습니다/);
      assert.doesNotMatch(panel.textContent, /로그인 상태를 확인하지 못했습니다|로그아웃|private callback details/);
      assert.match(panel.textContent, /로그인 확인 후 화면 작업을 완료하지 못했습니다/);
      assert.equal(panel.querySelector('a').hidden, true);
      assert.equal(button.disabled, false);
      assert.equal(requests, 1);
      button.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(followUpCalls, 2);
      assert.equal(requests, 2);
      assert.match(panel.textContent, /로그인이 확인됐습니다/);
      assert.doesNotMatch(panel.textContent, /작업을 완료하지 못했습니다/);
      assert.equal(panel.querySelector('a').hidden, true);
      assert.equal(button.disabled, false);
    } finally {
      dom.window.close();
      Object.assign(globalThis, previous);
    }
  }
});

test('login check does not read cookies or persist session and profile data', async () => {
  const dom = new JSDOM('<button></button>', {url: 'https://test.invalid'});
  const previous = {document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch, chrome: globalThis.chrome};
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  let cookieReads = 0, cookieWrites = 0, storageAccesses = 0;
  Object.defineProperty(document, 'cookie', {get() {cookieReads++; return 'private_cookie_value';}, set() {cookieWrites++;}});
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(dom.window, name, {get() {storageAccesses++; throw new Error('Session checks must not access storage');}});
  globalThis.chrome = {get storage() {storageAccesses++; throw new Error('Session checks must not access extension storage');}};
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    return {ok: true, json: async () => ({code: 200, content: {loggedIn: true, nickname: 'private_profile_name', userIdHash: 'private_identity'}})};
  };
  try {
    bindLoginCheck(document.querySelector('button'));
    document.querySelector('button').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(document.querySelector('.login-status').textContent, /로그인이 확인됐습니다/);
    assert.doesNotMatch(document.body.textContent, /private_profile_name|private_identity|private_cookie_value/);
    assert.equal(cookieReads, 0); assert.equal(cookieWrites, 0); assert.equal(storageAccesses, 0);
  } finally {
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
