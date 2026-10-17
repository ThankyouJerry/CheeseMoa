import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("layout, rename, add, storage notifications and remove retain untouched iframes", async () => {
  const dom = new JSDOM(await readFile(new URL("../src/viewer/viewer.html", import.meta.url), "utf8"), {url: "https://test.invalid"});
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.fetch = async () => { throw new Error("offline test"); };
  let notify;
  let data = {"cheesemoa.channels": [{url: "https://chzzk.naver.com/video/1"}]};
  let queue = Promise.resolve();
  Object.defineProperty(globalThis, "navigator", {value: {locks: {request(_, options, fn) {
    const result = queue.then(fn||options); queue = result.catch(() => {}); return result;
  }}}, configurable: true});
  globalThis.chrome = {storage: {
    local: {get: async () => structuredClone(data), set: async (value) => { data = {...data, ...value}; }},
    onChanged: {addListener: (fn) => {notify = fn;}},
  }};
  await import("../src/viewer/viewer.js");
  const frame = document.querySelector("iframe");
  document.querySelector('[data-columns="2"]').click();
  assert.equal(document.querySelector("iframe"), frame);
  assert.equal(localStorage.getItem("cheesemoa.columns"), "2");
  const emit = (items) => notify({"cheesemoa.channels": {newValue: items}}, "local");
  emit([{url: "https://chzzk.naver.com/video/1", name: "포포포포"}, {url: "https://chzzk.naver.com/video/2"}]);
  assert.equal(document.querySelector("iframe"), frame);
  assert.match(document.querySelector(".viewer-card strong").textContent, /^채널 1 ·/);
  const allFrames = [...document.querySelectorAll("iframe")];
  const focusButton = document.querySelector('[data-action="focus"]');
  focusButton.click();
  assert.equal(focusButton.textContent, "채널 화면 복원");
  const wrap = frame.parentElement;
  Object.defineProperty(wrap, "clientWidth", {value: 640});
  Object.defineProperty(wrap, "clientHeight", {value: 360});
  let request;
  frame.contentWindow.postMessage = (data) => { request = data; };
  const message = (data, origin = "https://chzzk.naver.com") => window.dispatchEvent(new dom.window.MessageEvent("message", {
    origin, source: frame.contentWindow, data,
  }));
  message({type: "cheesemoa-player-ready"});
  assert.equal(request.enabled, true);
  const mute = document.querySelector('[data-action="mute"]');
  assert.equal(mute.disabled, true);
  message({type: "cheesemoa-audio-state", available: true, muted: false, volume: .5}, "https://untrusted.invalid");
  assert.equal(mute.disabled, true);
  message({type: "cheesemoa-audio-state", available: true, muted: false, volume: .5});
  mute.click();
  assert.deepEqual(request, {type: "cheesemoa-set-audio", muted: true, volume: .5});
  assert.equal(mute.textContent, "음소거 해제");
  message({type: "cheesemoa-audio-state", available: true, muted: true, volume: .5, rawMuted: true, reason: "native"});
  assert.equal(mute.textContent, "음소거 해제");
  assert.equal(document.querySelectorAll('[data-action="mute"]')[1].disabled, true);
  frame.dispatchEvent(new dom.window.Event("load"));
  assert.equal(mute.disabled, true);
  message({type: "cheesemoa-audio-state", available: true, muted: true, volume: .5, rawMuted: true, reason: "native"});
  mute.click();
  assert.equal(request.muted, false);
  message({type: "cheesemoa-player-bounds", rect: {x: 100, y: 50, width: 800, height: 450}});
  assert.equal(frame.style.transform, "scale(0.8)");
  assert.equal(frame.style.left, "-80px");
  const clipped = frame.style.clipPath;
  message({type: "cheesemoa-player-bounds", rect: null}, "https://untrusted.invalid");
  assert.equal(frame.style.clipPath, clipped);
  message({type: "cheesemoa-player-bounds", rect: null});
  assert.equal(frame.style.clipPath, "none");
  assert.equal(frame.style.left, "0px");
  assert.equal(document.querySelectorAll(".viewer-card:not([hidden])").length, 2);
  assert.equal(document.querySelector("#viewer-grid").style.getPropertyValue("--columns"), "2");
  assert.equal(document.querySelector("#viewer-grid").style.getPropertyValue("--rows"), "1");
  assert.deepEqual([...document.querySelectorAll("iframe")], allFrames);
  emit([1, 2, 3, 4].map((id) => ({ url: `https://chzzk.naver.com/video/${id}` })));
  const fourFrames = [...document.querySelectorAll("iframe")];
  document.querySelector('[data-action="focus"]').click();
  assert.equal(document.querySelectorAll(".viewer-card:not([hidden])").length, 4);
  assert.equal(document.querySelector("#viewer-grid").style.getPropertyValue("--rows"), "2");
  assert.equal(document.querySelector("#viewer-grid").style.getPropertyValue("--columns"), "2");
  assert.deepEqual([...document.querySelectorAll("iframe")], fourFrames);
  emit([{url: "https://chzzk.naver.com/video/1"}, {url: "https://chzzk.naver.com/video/2"}]);
  focusButton.click();
  assert.equal(document.querySelectorAll(".viewer-card:not([hidden])").length, 2);
  assert.deepEqual([...document.querySelectorAll("iframe")], allFrames);
  document.querySelectorAll('[data-action="focus"]')[1].click();
  emit([{url: "https://chzzk.naver.com/video/1"}]);
  assert.equal(document.querySelector(".viewer-card").hidden, false);
  assert.equal(document.querySelectorAll("iframe").length, 1);
  assert.equal(document.querySelector("iframe"), frame);
  document.querySelector("#sidebar-toggle").click();
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Escape"}));
  assert.equal(document.querySelector("#sidebar").inert, true);
  emit([1, 2, 3, 4].map((id) => ({url: `https://chzzk.naver.com/video/${id}`})));
  globalThis.fetch = async () => ({ok: true, json: async () => ({code: 200, content: {loggedIn: true}})});
  const reloads = [];
  for (const iframe of document.querySelectorAll("iframe")) {
    Object.defineProperty(iframe, "src", {set: (url) => reloads.push(url)});
  }
  window.confirm = () => false;
  document.querySelector("#login-button").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reloads.length, 0);
  window.confirm = () => true;
  document.querySelector("#login-button").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(reloads, [1, 2, 3, 4].map(id => `https://chzzk.naver.com/video/${id}`));
  assert.equal(document.querySelectorAll("iframe").length, 4);
  dom.window.close();
});
