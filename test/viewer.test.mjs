import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("layout, rename, add, storage notifications and remove retain untouched iframes", async () => {
  const dom = new JSDOM(await readFile(new URL("../src/viewer/viewer.html", import.meta.url), "utf8"), {url: "https://test.invalid"});
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.localStorage = dom.window.localStorage;
  let notify;
  let data = {"cheesemoa.channels": [{url: "https://chzzk.naver.com/video/1"}]};
  let queue = Promise.resolve();
  Object.defineProperty(globalThis, "navigator", {value: {locks: {request(_, fn) {
    const result = queue.then(fn); queue = result.catch(() => {}); return result;
  }}}, configurable: true});
  globalThis.chrome = {storage: {
    local: {get: async () => structuredClone(data), set: async (value) => { data = value; }},
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
  assert.equal(document.querySelector(".viewer-card strong").textContent, "포포포포");
  emit([{url: "https://chzzk.naver.com/video/1"}]);
  assert.equal(document.querySelectorAll("iframe").length, 1);
  assert.equal(document.querySelector("iframe"), frame);
  document.querySelector("#sidebar-toggle").click();
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Escape"}));
  assert.equal(document.querySelector("#sidebar").inert, true);
  dom.window.close();
});
