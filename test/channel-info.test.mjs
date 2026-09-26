import test from "node:test";
import assert from "node:assert/strict";
import { loadChannelInfo, channelHeading } from "../src/shared/channel-info.js";

test("live and VOD metadata produce channel, streamer and title headings", async () => {
  for (const type of ["live", "video"]) {
    const channel = { type, resourceId: "123" };
    const info = await loadChannelInfo(channel, async (url, options) => {
      assert.ok(url.includes(type === "live" ? "/live-detail" : "/videos/123"));
      assert.equal(options.credentials, "omit");
      return { ok: true, json: async () => ({ content: {
        channel: { channelName: "포포포포" },
        [type === "live" ? "liveTitle" : "videoTitle"]: "오늘 방송",
      } }) };
    });
    assert.equal(channelHeading(channel, 0, info), "채널 1 · 포포포포 · 오늘 방송");
  }
});

test("missing and failed metadata are rejected", async () => {
  const channel = { type: "video", resourceId: "1" };
  await assert.rejects(loadChannelInfo(channel, async () => ({ ok: false })));
  await assert.rejects(loadChannelInfo(channel, async () => ({ ok: true, json: async () => ({ content: null }) })));
});

test("malformed API fields do not overwrite cached streamer names", async () => {
  const channel = { type: "video", resourceId: "1", streamerName: "저장된 이름" };
  const info = await loadChannelInfo(channel, async () => ({ ok: true, json: async () => ({
    content: { channel: {channelName: { unexpected: true }}, videoTitle: 42 },
  }) }));
  assert.equal(info.name, "");
  assert.equal(channelHeading(channel, 0, info), "채널 1 · 저장된 이름 · 방송 정보 없음");
});
