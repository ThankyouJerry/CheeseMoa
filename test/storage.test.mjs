import test from "node:test";
import assert from "node:assert/strict";

let data = {};
let fail = false;
const queues = new Map();
Object.defineProperty(globalThis, "navigator", { value: { locks: { request(key, callback) {
  const result = (queues.get(key) || Promise.resolve()).then(callback);
  queues.set(key, result.catch(() => {}));
  return result;
} } }, configurable: true });
globalThis.chrome = { storage: { local: {
  get: async () => structuredClone(data),
  set: async (value) => { if (fail) throw new Error("disk full"); data = structuredClone(value); },
} } };
const { updateChannels, loadChannels, normalizeChannels } = await import("../src/shared/storage.js");
const item = (id) => ({url: `https://chzzk.naver.com/video/${id}`});

test("concurrent adds and remove preserve other documents' changes", async () => {
  data = {};
  await Promise.all([1, 2, 3].map((id) => updateChannels({type: "add", items: [item(id)]})));
  await Promise.all([
    updateChannels({type: "remove", id: "video:2"}),
    updateChannels({type: "add", items: [item(4)]}),
  ]);
  assert.deepEqual((await loadChannels()).map((channel) => channel.id), ["video:1", "video:3", "video:4"]);
});
test("duplicate addition preserves custom name", async () => {
  await updateChannels({type: "rename", id: "video:1", name: "포포포포"});
  await updateChannels({type: "add", items: [item(1)]});
  assert.equal((await loadChannels())[0].name, "포포포포");
});
test("failed write leaves persisted data unchanged and releases lock", async () => {
  const before = await loadChannels();
  fail = true;
  await assert.rejects(updateChannels({type: "remove", id: "video:1"}));
  assert.deepEqual(await loadChannels(), before);
  fail = false;
  await updateChannels({type: "add", items: [item(5)]});
  assert.ok((await loadChannels()).some((channel) => channel.id === "video:5"));
});
test("invalid stored data is filtered", () => {
  assert.deepEqual(normalizeChannels([null, {}, {url: "https://example.com"}]), []);
  assert.deepEqual(normalizeChannels({}), []);
});

test("last streamer name survives reload, blank metadata and duplicate add", async () => {
  data = {};
  await updateChannels({type: "add", items: [item(9)]});
  await updateChannels({type: "metadata", id: "video:9", streamerName: "포포포포"});
  await updateChannels({type: "metadata", id: "video:9", streamerName: ""});
  await updateChannels({type: "add", items: [item(9)]});
  assert.equal((await loadChannels())[0].streamerName, "포포포포");
  const { createDisplayName } = await import("../src/shared/chzzk-url.js");
  assert.equal(createDisplayName((await loadChannels())[0], 0), "채널 1 · 포포포포");
  await updateChannels({type: "metadata", id: "video:9", streamerName: "새 이름"});
  assert.equal((await loadChannels())[0].streamerName, "새 이름");
  await updateChannels({type: "remove", id: "video:9"});
  await updateChannels({type: "metadata", id: "video:9", streamerName: "늦게 온 응답"});
  assert.deepEqual(await loadChannels(), []);
});
