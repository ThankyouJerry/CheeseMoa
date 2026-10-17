import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {bindDiscoveryPanel} from "../src/viewer/discovery-panel.js";
import {DISCOVERY_MAX_PAGES} from "../src/shared/channel-discovery.js";

const item = n => ({id: `live:${n.toString(16).padStart(32, "0")}`, streamerName: `스트리머 ${n}`, url: `https://chzzk.naver.com/live/${n.toString(16).padStart(32, "0")}`});
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const dom = new JSDOM("<section></section>");
  const container = dom.window.document.querySelector("section");
  const panel = bindDiscoveryPanel(container, {loadSaved: async () => [], saveSelected: async ({items}) => items, ...options});
  const get = role => container.querySelector(`[data-role="${role}"]`);
  const searchFor = keyword => {
    get("keyword").value = keyword;
    container.querySelector("form").dispatchEvent(new dom.window.Event("submit", {bubbles: true, cancelable: true}));
  };
  const choose = index => {
    const checkbox = container.querySelectorAll('[data-role="selection"]')[index];
    checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event("change", {bubbles: true}));
  };
  return {dom, container, panel, get, searchFor, choose};
}

test("selected-only add is explicit, persists names and invokes parent after storage succeeds", async () => {
  const saves = [], added = [];
  const ui = setup({search: async () => ({channels: [item(1), item(2)], next: null}),
    saveSelected: async operation => {saves.push(operation); return operation.items;}, onAdded: channels => added.push(channels)});
  ui.searchFor("채널"); await tick();
  assert.equal(saves.length, 0);
  ui.choose(1); ui.get("add").click(); await tick();
  assert.deepEqual(saves, [{type: "add", items: [item(2)]}]);
  assert.deepEqual(added, [[item(2)]]);
  assert.equal(ui.get("add").disabled, true);
  assert.equal(ui.container.querySelectorAll(".saved").length, 1);
  ui.panel.destroy(); ui.dom.window.close();
});

test("search pages deduplicate and retain earlier selections", async () => {
  const offsets = [];
  const ui = setup({search: async (_, {offset}) => {offsets.push(offset); return offset === 0
    ? {channels: [item(1)], next: 50} : {channels: [item(1), item(2)], next: null};}});
  ui.searchFor("채널"); await tick(); ui.choose(0); ui.get("more").click(); await tick();
  assert.deepEqual(offsets, [0, 50]);
  assert.equal(ui.container.querySelectorAll('[data-role="selection"]').length, 2);
  assert.equal(ui.container.querySelector('[data-role="selection"]').checked, true);
  assert.equal(ui.get("more").hidden, true);
  ui.panel.destroy(); ui.dom.window.close();
});

test("stale results and errors cannot replace a newer query", async () => {
  let resolveOld, oldSignal;
  const errors = [];
  const ui = setup({search: async (keyword, {signal}) => {
    if (keyword === "old") {oldSignal = signal; return new Promise(resolve => {resolveOld = resolve;});}
    return {channels: [item(2)], next: null};
  }, onError: error => errors.push(error)});
  ui.searchFor("old"); ui.searchFor("new"); await tick();
  assert.equal(oldSignal.aborted, true);
  resolveOld({channels: [item(1)], next: 50}); await tick();
  assert.equal(ui.container.querySelector('[data-role="selection"]').dataset.channelId, item(2).id);
  assert.equal(errors.length, 0);
  ui.panel.destroy(); ui.dom.window.close();
});

test("following label states live-only coverage and displays API failures", async () => {
  let fail = true;
  const errors = [];
  const ui = setup({following: async () => {
    if (fail) throw new Error("로그인해 주세요.");
    return {channels: [item(1)], next: null};
  }, onError: error => errors.push(error)});
  assert.equal(ui.get("following").textContent, "팔로잉 라이브");
  ui.get("following").click(); await tick();
  assert.match(ui.get("status").textContent, /로그인/);
  assert.equal(errors.length, 1);
  fail = false; ui.get("following").click(); await tick();
  assert.match(ui.get("status").textContent, /방송 중인 팔로잉만/);
  assert.equal(ui.container.querySelector("form").hidden, true);
  ui.panel.destroy(); ui.dom.window.close();
});

test("storage rejection retains selection and does not report success", async () => {
  const added = [];
  const ui = setup({search: async () => ({channels: [item(1)], next: null}),
    saveSelected: async () => {throw new Error("저장 공간이 부족합니다.");}, onAdded: value => added.push(value)});
  ui.searchFor("x"); await tick(); ui.choose(0); ui.get("add").click(); await tick();
  assert.match(ui.get("status").textContent, /저장 공간/);
  assert.equal(ui.container.querySelector('[data-role="selection"]').checked, true);
  assert.equal(added.length, 0);
  ui.panel.destroy(); ui.dom.window.close();
});

test("saved refresh disables duplicates and renders API names as text", async () => {
  const dangerous = {...item(1), streamerName: '<img src=x onerror="alert(1)">'};
  const ui = setup({loadSaved: async () => [item(1)], search: async () => ({channels: [dangerous], next: null})});
  ui.searchFor("x"); await tick();
  assert.equal(ui.container.querySelector("img"), null);
  assert.match(ui.container.querySelector(".discovery-row span").textContent, /<img/);
  assert.equal(ui.container.querySelector('[data-role="selection"]').disabled, true);
  ui.panel.destroy(); ui.dom.window.close();
});

test("bounded pagination tells user the list is partial", async () => {
  const ui = setup({search: async (_, {offset}) => ({channels: [item(offset + 1)], next: offset + 50})});
  ui.searchFor("x"); await tick();
  for (let page = 1; page < DISCOVERY_MAX_PAGES; page++) {ui.get("more").click(); await tick();}
  assert.equal(ui.get("more").disabled, true);
  assert.match(ui.get("status").textContent, /전체 목록이 아닙니다/);
  ui.panel.destroy(); ui.dom.window.close();
});

test("cancel and destroy stop pending work", async () => {
  let signal, release;
  const ui = setup({search: (_, options) => {signal = options.signal; return new Promise(resolve => {release = resolve;});}});
  ui.searchFor("x"); ui.get("cancel").click();
  assert.equal(signal.aborted, true);
  ui.panel.destroy(); release({channels: [item(1)], next: null}); await tick();
  assert.equal(ui.container.querySelector('[data-role="selection"]'), null);
  ui.dom.window.close();
});

test("search selection can save beyond four without starting players", async () => {
  const ui = setup({loadSaved: async () => [item(10), item(11), item(12), item(13), item(14)],
    search: async () => ({channels: [item(1), item(2)], next: null})});
  ui.searchFor("x"); await tick(); ui.choose(0); ui.choose(1);
  assert.equal(ui.container.querySelectorAll('[data-role="selection"]:checked').length, 2);
  ui.get('add').click(); await tick();
  assert.match(ui.get('status').textContent, /동시 재생은 최대 4개/);
  ui.panel.destroy(); ui.dom.window.close();
});

test("editing the query invalidates old pagination and tab switch clears old selection", async () => {
  const ui = setup({search: async () => ({channels: [item(1)], next: 50})});
  ui.searchFor("x"); await tick(); ui.choose(0);
  ui.get("keyword").value = "y";
  ui.get("keyword").dispatchEvent(new ui.dom.window.Event("input", {bubbles: true}));
  assert.equal(ui.get("more").hidden, true);
  ui.get("search").click();
  assert.equal(ui.get("add").disabled, true);
  assert.equal(ui.container.querySelector('[data-role="selection"]'), null);
  ui.panel.destroy(); ui.dom.window.close();
});

test('following additions preserve all choices when four channels are already saved',async()=>{
 let stored;
 const ui=setup({loadSaved:async()=>[1,2,3,4].map(item),following:async()=>({channels:[item(5),item(6)],next:null}),saveSelected:async ({items})=>{stored=[...[1,2,3,4].map(item),...items];return stored;}});
 ui.get('following').click();await tick();ui.choose(0);ui.choose(1);ui.get('add').click();await tick();
 assert.equal(stored.length,6);assert.match(ui.get('status').textContent,/동시 재생은 최대 4개/);
 ui.panel.destroy();ui.dom.window.close();
});
