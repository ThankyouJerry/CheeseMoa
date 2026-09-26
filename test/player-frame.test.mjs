import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("player measurement accepts only the owning extension parent and stops on restore", async () => {
  let handler, poll;
  const reports = [];
  const parent = { postMessage: (...args) => reports.push(args) };
  const win = { parent, top: parent, addEventListener: (_, callback) => { handler = callback; } };
  const context = {
    window: win, chrome: { runtime: { id: "test-owner" } },
    document: { querySelectorAll: () => [{ getBoundingClientRect: () => ({ x: 120, y: 60, width: 900, height: 506 }) }] },
    setInterval: (fn) => { poll = fn; return 1; }, clearInterval: () => { poll = null; },
  };
  vm.runInNewContext(await readFile(new URL("../src/viewer/player-frame.js", import.meta.url), "utf8"), context);
  assert.equal(reports[0][0].type, "cheesemoa-player-ready");
  reports.length = 0;
  const event = { source: parent, origin: "https://chzzk.naver.com", data: { type: "cheesemoa-measure-player", enabled: true } };
  handler(event);
  assert.equal(reports.length, 0);
  handler({ ...event, origin: "chrome-extension://test-owner" });
  assert.equal(reports[0][0].rect.width, 900);
  assert.equal(reports[0][1], "chrome-extension://test-owner");
  assert.equal(typeof poll, "function");
  handler({ ...event, origin: "chrome-extension://test-owner", data: { ...event.data, enabled: false } });
  assert.equal(poll, null);
});
