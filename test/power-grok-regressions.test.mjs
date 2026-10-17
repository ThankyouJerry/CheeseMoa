import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerCollector, POWER_STORAGE_KEY } from '../src/shared/power-collector.js';
import { createPowerSession } from '../src/shared/power-session.js';
import { safePowerError } from '../src/background/power-coordinator.js';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const channel = 'a'.repeat(32), account = 'b'.repeat(64);
const reward = { claimId: 'mock-reward', claimType: 'WATCH_1_HOUR', state: 'COMPLIED', saveType: 'ACTIVE', amount: 10 };
const balance = claims => new Response(JSON.stringify({ code: 200, content: { amount: 100, active: true, claims } }), { status: 200 });
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ afterPut = 'normal', conflict = false, initialAttempts = [], accountSwitch = false, rewards = [reward] } = {}) {
  let state = { [POWER_STORAGE_KEY]: { version: 1, receipts: [], attempts: initialAttempts, balances: [] } };
  let puts = 0, gets = 0, timer;
  const statuses = [];
  const collector = createPowerCollector({ storage: { get: async () => structuredClone(state), set: async value => { state = structuredClone(value); } }, locks: { request: async (_name, _options, callback) => callback() }, fetcher: async (_url, options) => {
    if (options.method === 'PUT') {
      puts++;
      return new Response(JSON.stringify({ code: conflict ? 409 : 200 }), { status: conflict ? 409 : 200 });
    }
    gets++;
    if (puts && afterPut === 'pause') throw Object.assign(new Error('Playback paused'), { code: 'POWER_PLAYBACK_WAIT', method: 'GET', mutationDispatched: false });
    if (puts && afterPut === 'malformed') return new Response('{"code":200,"content":{}}', { status: 200 });
    return balance(rewards);
  } });
  const session = createPowerSession({ collector: { collect: async (...args) => { try { return await collector.collect(...args); } catch (error) { throw safePowerError(error); } } }, getChannels: () => [{ id: 'main', resourceId: channel, type: 'live' }], checkAccount: async () => accountSwitch && puts ? 'c'.repeat(64) : account, onStatus: status => statuses.push(status), schedule: callback => { timer = callback; return 1; }, cancel: () => { timer = undefined; } });
  return { collector, session, statuses, state: () => state[POWER_STORAGE_KEY], puts: () => puts, gets: () => gets, tick: async () => { assert.ok(timer); const callback = timer; timer = undefined; await callback(); await flush(); } };
}
test('Grok: pause after confirmed PUT keeps durable confirmation visible while waiting and never repeats PUT', async () => {
  const h = harness({ afterPut: 'pause' });
  h.session.start(); await flush();
  assert.equal(h.state().receipts.length, 1);
  assert.equal(h.state().attempts[0].status, 'confirmed');
  const status = h.statuses.at(-1);
  assert.equal(status.status, 'playback-wait');
  assert.equal(status.enabled, true);
  assert.equal(status.result?.collected, 1);
  assert.equal(status.result?.latestReceipt?.httpStatus, 200);
  assert.match(status.detail, /수령 확인/);
  await h.tick();
  assert.equal(h.puts(), 1);
  h.session.stop();
});
test('Grok: malformed post-success balance stops safely without describing durable PUT as uncertain', async () => {
  const h = harness({ afterPut: 'malformed' });
  h.session.start(); await flush();
  const status = h.statuses.at(-1);
  assert.equal(status.enabled, false);
  assert.equal(status.result?.collected, 1);
  assert.equal(h.state().receipts.length, 1);
  assert.equal(h.state().attempts[0].status, 'confirmed');
  assert.match(status.detail, /수령 확인/);
  h.session.start(); await flush();
  assert.equal(h.puts(), 1);
  h.session.stop();
});
test('Grok: manual claim HTTP409 records already-claimed, stays enabled, counts no success and never resends', async () => {
  const h = harness({ conflict: true });
  h.session.start(); await flush();
  assert.equal(h.state().attempts[0].status, 'already-claimed');
  assert.equal(h.state().receipts.length, 0);
  assert.equal(h.statuses.at(-1).enabled, true);
  assert.equal(h.statuses.at(-1).result?.collected, 0);
  await h.tick();
  assert.equal(h.puts(), 1);
  assert.equal(h.state().receipts.length, 0);
  h.session.stop();
});
test('Grok: post-PUT account mismatch remains unconfirmed, stops, and cannot invent a receipt', async () => {
  const h = harness({ accountSwitch: true });
  h.session.start(); await flush();
  assert.equal(h.puts(), 1);
  assert.equal(h.state().attempts[0].status, 'unconfirmed');
  assert.equal(h.state().receipts.length, 0);
  assert.equal(h.statuses.at(-1).enabled, false);
  assert.equal(h.statuses.at(-1).result?.latestReceipt, undefined);
  const retry = await h.collector.collect(channel, { enabled: true, accountId: account });
  assert.equal(retry.blocked, 1);
  assert.equal(h.puts(), 1);
});
test('Grok: 2000 deduplication guards stop before PUT, retain all guards and explain capacity', async () => {
  const attempts = Array.from({ length: 2000 }, (_, index) => ({ key: JSON.stringify([account, channel, `old-${index}`]), accountId: account, status: 'confirmed' }));
  const h = harness({ initialAttempts: attempts });
  h.session.start(); await flush();
  assert.equal(h.puts(), 0);
  assert.equal(h.state().attempts.length, 2000);
  assert.equal(h.statuses.at(-1).enabled, false);
  assert.match(h.statuses.at(-1).detail, /중복 방지.*(?:2000|2,000)/);
  await h.collector.clearHistory(account);
  assert.equal(h.state().attempts.length, 2000);
  await assert.rejects(h.collector.collect(channel, { enabled: true, accountId: account }), /중복 방지/);
  assert.equal(h.puts(), 0);
});

for (const title of ['치지직', 'Loading - CHZZK', 'Old unrelated channel - CHZZK']) test(`Grok: unverified document title is not a channel identity (${title})`, async () => {
  const dom = new JSDOM('<title></title>', { url: `https://chzzk.naver.com/live/${channel}`, runScripts: 'outside-only' });
  dom.window.document.title = title;
  const entry = (await readFile(new URL('../src/viewer/power-page-entry.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  Object.assign(dom.window, { POWER_BUILD: 'mock', attachPowerReceiptPanel: () => ({ update() {} }), attachFloatingPowerPanel() {}, createPagePowerOwner: () => ({ restore() {}, stop() {}, suspend() {} }), createPagePowerAgent: () => () => {}, chrome: { runtime: { onMessage: { addListener() {}, removeListener() {} } }, storage: {} }, setInterval: () => 1, clearInterval() {} });
  try {
    dom.window.eval(entry);
    const option = dom.window.document.getElementById('cheesemoa-power-control').shadowRoot.querySelector('option');
    assert.equal(option.value, channel);
    assert.equal(option.textContent, `현재 방송 (${channel.slice(0, 8)}…)`);
    assert.notEqual(option.textContent, title.split(' - ')[0]);
  } finally { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close(); }
});

for (const mode of ['same-account', 'changed-account', 'lost-document']) test(`Grok: actual owner/coordinator/transport/page agent handles pause after PUT (${mode})`, async () => {
  const { createRuntimeSimulation } = await import('../dev/power-runtime-simulation.js');
  const { createPagePowerAgent } = await import('../src/shared/power-page-agent.js');
  const h = createRuntimeSimulation();
  let playing = true;
  const key = '1:document-1';
  const agent = createPagePowerAgent({ isPlaying: () => playing, fetcher: async (url, options) => {
    const response = await h.fetcher(url, options);
    if (options.method === 'PUT') {
      playing = false;
      if (mode === 'changed-account') h.identity('different_mock_account');
      if (mode === 'lost-document') h.agents.delete(key);
    }
    return response;
  } });
  h.agents.set(key, agent);
  try {
    await h.owner.start(); await h.flush();
    const ledger = h.local.snapshot()[POWER_STORAGE_KEY];
    assert.equal(h.calls.filter(call => call.kind === 'claim').length, 1);
    if (mode === 'same-account') {
      assert.equal(ledger.receipts.length, 1);
      assert.equal(ledger.attempts[0].status, 'confirmed');
      assert.equal(h.states.at(-1).status, 'playback-wait');
      assert.equal(h.states.at(-1).result?.collected, 1);
      const networkBefore = h.calls.length;
      await h.advance();
      assert.equal(h.calls.length, networkBefore, 'ordinary paused polls must remain network-free');
      playing = true;
      await h.advance();
      assert.equal(h.calls.filter(call => call.kind === 'claim').length, 1);
    } else {
      assert.equal(ledger.receipts.length, 0);
      assert.equal(ledger.attempts[0].status, 'unconfirmed');
      assert.equal(h.states.at(-1).enabled, false);
    }
  } finally { h.dispose(); }
});

test('Grok boundary: 409 at 1999 guards reaches 2000; next reward is blocked with typed capacity diagnostic', async () => {
  const attempts = Array.from({ length: 1999 }, (_, index) => ({ key: JSON.stringify([account, channel, `old-${index}`]), accountId: account, status: 'confirmed' }));
  const h = harness({ initialAttempts: attempts, conflict: true, rewards: [reward, { ...reward, claimId: 'next-new-reward' }] });
  let capacityError;
  try { await h.collector.collect(channel, { enabled: true, accountId: account }); } catch (error) { capacityError = error; }
  assert.equal(capacityError?.code, 'POWER_ATTEMPT_LIMIT');
  assert.equal(safePowerError(capacityError).code, 'POWER_ATTEMPT_LIMIT');
  assert.equal(h.puts(), 1);
  assert.equal(h.state().attempts.length, 2000);
  assert.equal(h.state().attempts.at(-1).status, 'already-claimed');
  assert.equal(h.state().attempts.at(-1).claimId, reward.claimId);
  assert.equal(h.state().receipts.length, 0);
  h.session.start(); await flush();
  assert.match(h.statuses.at(-1).detail, /중복 방지.*2,000/);
  assert.equal(h.statuses.at(-1).enabled, false);
  assert.equal(h.puts(), 1);
  assert.equal(h.state().attempts.length, 2000);
});
test('malformed balance confirmation survives serialized status rerender and later empty receipt updates', async () => {
  const { attachPowerReceiptPanel } = await import('../src/viewer/power-receipt-panel.js');
  const h = harness({ afterPut: 'malformed' });
  h.session.start(); await flush();
  const dom = new JSDOM('<section><p class="detail"></p></section>');
  try {
    const section = dom.window.document.querySelector('section');
    const panel = attachPowerReceiptPanel({ section, document: dom.window.document });
    const render = status => { section.querySelector('.detail').textContent = status.detail; panel.update(status, '현재 방송'); };
    const serialized = JSON.parse(JSON.stringify(h.statuses.at(-1)));
    render(serialized);
    const receipt = section.querySelector('.power-receipt').textContent;
    assert.match(section.querySelector('.detail').textContent, /1건 수령 확인 및 기록 저장 완료/);
    assert.match(receipt, /최근 서버 수령 확인.*HTTP 200/);
    render(JSON.parse(JSON.stringify(serialized)));
    assert.match(section.querySelector('.detail').textContent, /1건 수령 확인 및 기록 저장 완료/);
    assert.equal(section.querySelector('.power-receipt').textContent, receipt);
    panel.update({ enabled: false, status: 'off' }, '현재 방송');
    panel.update({ enabled: true, status: 'checked', result: { collected: 0 } }, '현재 방송');
    assert.equal(section.querySelector('.power-receipt').textContent, receipt);
    assert.equal(h.state().receipts.length, 1);
    assert.equal(h.puts(), 1);
  } finally { h.session.stop(); dom.window.close(); }
});
