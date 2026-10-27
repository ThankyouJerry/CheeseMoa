import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotePlayer} from '../src/vod/note-player.js';
import {parseVodSource} from '../src/vod/source.js';

const source = parseVodSource('https://chzzk.naver.com/video/000123');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function harness(t, options = {}) {
  const listeners = new Set(), sent = [], timers = new Map(); let id = 0, token = 0;
  const chromeApi = {runtime: {id: 'extension-id', onMessage: {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn)}},
    tabs: {query: options.query || (() => Promise.resolve([{id: 1}, {id: 2}])),
      sendMessage: (...args) => { sent.push(args); return options.send ? options.send(...args) : Promise.resolve({ignored: 'first responder'}); }}};
  const api = createNotePlayer({chromeApi, uuid: () => `request-${++token}`, discoveryMs: 6, timeoutMs: 40,
    schedule: (fn, delay) => { const timer = ++id; timers.set(timer, {fn, delay}); return timer; }, cancel: id => timers.delete(id)});
  const sender = {id: 'extension-id', tab: {id: 1}, frameId: 0, documentId: 'document-a', url: source.canonicalUrl};
  function emit(data, from = sender) { for (const fn of listeners) fn({type: 'cheesemoa-vod-player-result', version: 1,
    source, generation: 'generation-1', ...data}, from); }
  function tick(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } }
  async function discover(registrations = [{}]) {
    const promise = api.discover(); await flush();
    const discoveryId = sent.at(-1)?.[1].discoveryId;
    for (const registration of registrations) emit({action: 'register', discoveryId, ...registration.data}, {...sender, ...registration.sender});
    tick(6); return promise;
  }
  t.after(() => api.dispose());
  return {api, sender, emit, sent, timers, tick, discover, listeners};
}

test('discovery collects all matching tabs and frames with same VOD, never first response', async t => {
  const h = harness(t);
  const players = await h.discover([{}, {sender: {frameId: 3, documentId: 'document-b'}},
    {sender: {tab: {id: 2}, frameId: 2, documentId: 'document-c'}}]);
  assert.equal(players.length, 3);
  assert.deepEqual(players.map(p => [p.tabId, p.frameId]), [[1, 0], [1, 3], [2, 2]]);
  assert.equal(h.sent.length, 2);
  assert.ok(Object.isFrozen(players[0])); assert.ok(Object.isFrozen(players[0].source));
});

test('discovery rejects spoofed, unrelated, non-VOD and wrong-session registrations', async t => {
  const h = harness(t), promise = h.api.discover(); await flush();
  const discoveryId = h.sent[0][1].discoveryId;
  const registration = {action: 'register', discoveryId};
  for (const from of [{id: 'foreign'}, {tab: {id: 8}}, {frameId: -1}, {documentId: ''},
    {url: 'https://evil.example/video/000123'}, {url: 'https://chzzk.naver.com/video/999'},
    {url: 'https://chzzk.naver.com/live/' + 'a'.repeat(32)}]) h.emit(registration, {...h.sender, ...from});
  h.emit({...registration, discoveryId: 'different-session'});
  h.emit({...registration, generation: 'bad'});
  h.emit({...registration, source: {...source, sourceKey: 'chzzk:vod:999'}});
  h.tick(6); assert.deepEqual(await promise, []);
});

test('new generation from same frame replaces earlier registration', async t => {
  const h = harness(t);
  const players = await h.discover([{}, {data: {generation: 'generation-2'}}]);
  assert.equal(players.length, 1); assert.equal(players[0].generation, 'generation-2');
});

test('snapshot pins tab frame document source generation request and action', async t => {
  const h = harness(t), [player] = await h.discover();
  const pending = h.api.snapshot(player); let done = false; pending.then(() => { done = true; }); await flush();
  const [tabId, command, target] = h.sent.at(-1);
  assert.equal(tabId, 1); assert.deepEqual(target, {frameId: 0, documentId: 'document-a'});
  const response = {action: 'snapshot', requestId: command.requestId, ok: true, positionMs: 1234567};
  for (const wrong of [{tab: {id: 2}}, {frameId: 3}, {documentId: 'document-b'}]) h.emit(response, {...h.sender, ...wrong});
  for (const wrong of [{generation: 'generation-2'}, {requestId: 'unrelated-request'}, {action: 'seek'},
    {source: parseVodSource('https://chzzk.naver.com/video/999')}]) h.emit({...response, ...wrong});
  await flush(); assert.equal(done, false);
  h.emit(response); assert.deepEqual(await pending, {source, positionMs: 1234567}); assert.equal(h.timers.size, 0);
});

test('seek validates time before dispatch and preserves integer milliseconds', async t => {
  const h = harness(t), [player] = await h.discover(), count = h.sent.length;
  for (const ms of [-1, Infinity, 1.5]) await assert.rejects(h.api.seek(player, ms));
  assert.equal(h.sent.length, count);
  const pending = h.api.seek(player, 1234567); await flush();
  const command = h.sent.at(-1)[1]; assert.equal(command.positionMs, 1234567);
  h.emit({action: 'seek', requestId: command.requestId, ok: true, positionMs: 1234567});
  assert.equal((await pending).positionMs, 1234567);
});

test('failed and malformed results reject; timeout never retries', async t => {
  const h = harness(t), [player] = await h.discover();
  for (const data of [{ok: false}, {ok: true, positionMs: -1}, {ok: true, positionMs: 2.3}]) {
    const pending = h.api.snapshot(player), rejected = assert.rejects(pending, {code: data.ok ? 'INVALID' : 'UNAVAILABLE'});
    await flush(); h.emit({action: 'snapshot', requestId: h.sent.at(-1)[1].requestId, ...data}); await rejected;
  }
  const pending = h.api.snapshot(player), rejected = assert.rejects(pending, {code: 'TIMEOUT'}); await flush();
  const count = h.sent.length; h.tick(40); await rejected; await flush(); assert.equal(h.sent.length, count);
});

test('rediscovery cancels pending commands and makes old selections stale', async t => {
  const h = harness(t), [player] = await h.discover();
  const command = h.api.snapshot(player), rejected = assert.rejects(command, {code: 'STALE'});
  const discovery = h.api.discover(); await rejected; await flush();
  assert.equal(h.sent.filter(([, data]) => data.action === 'snapshot').length, 0);
  h.tick(6); assert.deepEqual(await discovery, []);
  await assert.rejects(h.api.snapshot(player), {code: 'STALE'});
});

test('overlapping discovery and disposal reject once and clean listeners/timers', async t => {
  const h = harness(t), first = h.api.discover(), rejected = assert.rejects(first, {code: 'STALE'});
  const second = h.api.discover(), closed = assert.rejects(second, {code: 'CLOSED'});
  h.api.dispose(); await Promise.all([rejected, closed]); await flush();
  assert.equal(h.sent.length, 0); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  await assert.rejects(h.api.discover(), {code: 'UNAVAILABLE'});
});

test('dispose cancels queued seek before it can be sent', async t => {
  const h = harness(t), [player] = await h.discover();
  const pending = h.api.seek(player, 4000), rejected = assert.rejects(pending, {code: 'CLOSED'});
  h.api.dispose(); await rejected; await flush();
  assert.equal(h.sent.filter(([, data]) => data.action === 'seek').length, 0);
});

test('query and message transport failures reject without retry', async t => {
  const q = harness(t, {query: () => Promise.reject(new Error('tabs denied'))});
  await assert.rejects(q.api.discover(), {code: 'UNAVAILABLE'}); assert.equal(q.timers.size, 0);
  const h = harness(t, {send: (_tab, data) => data.action === 'discover' ? Promise.resolve() : Promise.reject(new Error('removed tab'))});
  const [player] = await h.discover(); await assert.rejects(h.api.snapshot(player), {code: 'UNAVAILABLE'}); assert.equal(h.timers.size, 0);
});

test('malformed query result fails without an unhandled rejection', async t => {
  const h = harness(t, {query: () => Promise.resolve(null)});
  await assert.rejects(h.api.discover(), {code: 'UNAVAILABLE'});
  assert.equal(h.timers.size, 0);
});
