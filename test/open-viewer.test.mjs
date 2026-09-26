import test from "node:test";
import assert from "node:assert/strict";
import { openViewerTab } from "../src/shared/open-viewer.js";

test("only extension contexts are inspected and existing tab is focused", async () => {
  const calls = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {locks: {request: (_, fn) => fn()}} });
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: async (filter) => {
        assert.deepEqual(filter, {contextTypes: ["TAB"], documentUrls: ["chrome-extension://test/src/viewer/viewer.html"]});
        return [{tabId: 5, windowId: 2}];
      },
    },
    tabs: {update: async (...args) => calls.push(args), create: async () => assert.fail("must reuse tab")},
    windows: {update: async (...args) => calls.push(args)},
  };
  await openViewerTab();
  assert.deepEqual(calls, [[5, {active: true}], [2, {focused: true}]]);
});

test("creates viewer only when no viewer context exists", async () => {
  chrome.runtime.getContexts = async () => [];
  let created;
  chrome.tabs.create = async (options) => {created = options;};
  await openViewerTab();
  assert.equal(created.url, "chrome-extension://test/src/viewer/viewer.html");
});
