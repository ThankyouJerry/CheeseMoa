import test from "node:test";
import assert from "node:assert/strict";
import { parseChzzkUrl, parseChzzkUrls } from "../src/shared/chzzk-url.js";

test("라이브 링크를 정규화한다", () => {
  assert.deepEqual(parseChzzkUrl("https://chzzk.naver.com/live/abc123?foo=bar"), {
    id: "live:abc123",
    type: "live",
    typeLabel: "라이브",
    resourceId: "abc123",
    url: "https://chzzk.naver.com/live/abc123",
  });
});

test("VOD 링크를 허용한다", () => {
  assert.equal(parseChzzkUrl("chzzk.naver.com/video/14046440")?.id, "video:14046440");
});

test("외부 도메인과 지원하지 않는 경로를 거부한다", () => {
  assert.equal(parseChzzkUrl("https://example.com/live/abc"), null);
  assert.equal(parseChzzkUrl("https://chzzk.naver.com/search"), null);
});

test("여러 줄 입력을 중복 제거하고 실패 항목을 분리한다", () => {
  const result = parseChzzkUrls(`
    https://chzzk.naver.com/video/14046440
    https://chzzk.naver.com/video/14046440
    invalid.example
    https://chzzk.naver.com/video/14056205
  `);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.rejected, ["invalid.example"]);
});
