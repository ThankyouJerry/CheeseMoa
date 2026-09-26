import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("failed save preserves input, restores controls, and does not open viewer", async () => {
  const dom = new JSDOM(await readFile(new URL("../src/popup/popup.html", import.meta.url), "utf8"), {url: "https://test.invalid"});
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {configurable: true, value: {locks: {request: (_, fn) => fn()}}});
  globalThis.chrome = {
    storage: {local: {get: async () => ({}), set: async () => {throw new Error("quota");}}, onChanged: {addListener() {}}},
    tabs: {create: async () => assert.fail("must not open")},
    runtime: {getURL: () => "test", getContexts: async () => assert.fail("must not open")},
  };
  await import("../src/popup/popup.js");
  const input = document.querySelector("#url-input");
  input.value = "https://chzzk.naver.com/video/123";
  const button = document.querySelector("#add-button");
  button.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(input.value, "https://chzzk.naver.com/video/123");
  assert.equal(button.disabled, false);
  assert.match(document.querySelector("#message").textContent, /실패/);
  dom.window.close();
});
