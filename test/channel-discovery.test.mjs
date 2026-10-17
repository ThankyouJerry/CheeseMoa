import test from "node:test";
import assert from "node:assert/strict";
import {searchChannels, loadFollowingChannels, DiscoveryError} from "../src/shared/channel-discovery.js";

const id = "a".repeat(32);
const channel = {channelId: id, channelName: "스트리머", openLive: true};
const response = content => ({ok: true, status: 200, json: async () => ({code: 200, content})});

test("search uses observed endpoint, encoded name, credentials and canonical live rows", async () => {
  let called;
  const result = await searchChannels(" 한 글& ", {fetchImpl: async (url, options) => {
    called = {url: new URL(url), options};
    return response({data: [{channel}, {channel}], page: {next: {offset: 50}}});
  }});
  assert.equal(called.url.origin, "https://api.chzzk.naver.com");
  assert.equal(called.url.pathname, "/service/v1/search/channels");
  assert.equal(called.url.searchParams.get("keyword"), "한 글&");
  assert.equal(called.url.searchParams.get("size"), "50");
  assert.equal(called.options.credentials, "omit");
  assert.equal(called.options.redirect, "error");
  assert.equal(result.next, 50);
  assert.equal(result.channels.length, 1);
  assert.equal(result.channels[0].url, `https://chzzk.naver.com/live/${id}`);
  assert.equal(result.channels[0].streamerName, "스트리머");
});

test("search follows only increasing observed offsets and treats zero/missing cursor as complete", async () => {
  for (const content of [{data: []}, {data: [], page: {next: {offset: 0}}}])
    assert.equal((await searchChannels("x", {fetchImpl: async () => response(content)})).next, null);
  for (const offset of [1, "51", -1])
    await assert.rejects(searchChannels("x", {offset: 50, fetchImpl: async () => response({data: [{channel}], page: {next: {offset}}})}), {code: "schema"});
});

test("malformed rows, invalid identifiers, too many rows and API schemas fail without dropping results", async () => {
  const contents = [
    {}, {data: [channel]}, {data: [{channel: {...channel, channelId: "../../attack"}}]},
    {data: [{channel: {...channel, channelName: ""}}]}, {data: Array.from({length: 51}, () => ({channel}))},
    {data: [], page: {next: {offset: 50}}},
  ];
  for (const content of contents)
    await assert.rejects(searchChannels("x", {fetchImpl: async () => response(content)}), {code: "schema"});
  await assert.rejects(searchChannels("x", {fetchImpl: async () => ({ok: true, json: async () => ({content: {data: []}})})}), {code: "schema"});
});

test("invalid name does not request API", async () => {
  for (const keyword of [" ", "x".repeat(101), null])
    await assert.rejects(searchChannels(keyword, {fetchImpl: () => assert.fail("unexpected request")}), {code: "input"});
});

test("HTTP and envelope authentication/rate errors preserve useful error category", async () => {
  for (const [status, code] of [[401, "auth"], [403, "auth"], [429, "rate"], [500, "api"]]) {
    await assert.rejects(searchChannels("x", {fetchImpl: async () => ({ok: false, status})}), {code});
    await assert.rejects(searchChannels("x", {fetchImpl: async () => ({ok: true, json: async () => ({code: status})})}), {code});
  }
  await assert.rejects(searchChannels("x", {fetchImpl: async () => {throw new Error("offline");}}), {code: "network"});
});

test("caller cancellation rejects even if the transport ignores abort", async () => {
  const controller = new AbortController();
  let release;
  const result = searchChannels("x", {signal: controller.signal, fetchImpl: () => new Promise(resolve => {release = resolve;})});
  controller.abort(); release(response({data: []}));
  await assert.rejects(result, {name: "AbortError"});
});

test("timeout aborts transport and returns timeout category", async () => {
  await assert.rejects(searchChannels("x", {timeoutMs: 1, fetchImpl: (_, {signal}) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true});
  })}), {code: "timeout"});
});

test("following calls observed live-only endpoint without fabricated pagination", async () => {
  let url;
  const result = await loadFollowingChannels({fetchImpl: async (value, options) => {
    assert.equal(options.credentials, "include");
    url = value; return response({followingList: [{channel: {...channel, openLive: undefined}}]});
  }});
  assert.equal(url, "https://api.chzzk.naver.com/service/v1/channels/followings/live");
  assert.equal(result.channels[0].openLive, true);
  assert.equal(result.next, null);
  await assert.rejects(loadFollowingChannels({page: 1}), {code: "schema"});
});

test("following accepts more than fifty live channels and rejects explicit incomplete lists", async () => {
  const list = Array.from({length: 51}, (_, n) => ({channel: {...channel, channelId: n.toString(16).padStart(32, "0")}}));
  assert.equal((await loadFollowingChannels({fetchImpl: async () => response({followingList: list})})).channels.length, 51);
  await assert.rejects(loadFollowingChannels({fetchImpl: async () => response({followingList: list, totalCount: 60})}), {code: "partial"});
  await assert.rejects(loadFollowingChannels({fetchImpl: async () => response({followingList: [] , totalCount: "0"})}), {code: "schema"});
  assert.ok(new DiscoveryError("schema", "x") instanceof Error);
});
