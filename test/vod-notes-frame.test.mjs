import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const code = readFileSync(new URL('../src/vod/vod-frame.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function frame(t, {url = 'https://chzzk.naver.com/video/001234', videos = 1} = {}) {
  const dom = new JSDOM('<!doctype html><title>VOD</title><body></body>', {url, runScripts: 'outside-only'});
  const w = dom.window, listeners = new Set(), replies = [], timers = new Map();
  let id = 0, epoch = 0, request = 0;
  w.crypto.randomUUID = () => `generation-${++epoch}`;
  w.setTimeout = fn => { timers.set(++id, fn); return id; };
  w.clearTimeout = id => timers.delete(id);
  const runtime = {id: 'extension-id', getURL: path => `chrome-extension://extension-id/${path}`,
    onMessage: {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn)},
    sendMessage: data => { replies.push(data); return Promise.resolve(); }};
  w.chrome = {runtime};
  function video(overrides = {}) {
    const el = w.document.createElement('video');
    for (const [key, value] of Object.entries({readyState: 4, currentTime: 12.3456, duration: 7200, seeking: false,
      paused: true, volume: 0.37, muted: true, error: null,
      seekable: {length: 1, start: () => 0, end: () => 7200}, ...overrides})) {
      Object.defineProperty(el, key, {value, writable: true, configurable: true});
    }
    el.play = () => { throw new Error('play must not be called'); };
    el.pause = () => { throw new Error('pause must not be called'); };
    w.document.body.append(el); return el;
  }
  for (let i = 0; i < videos; i++) video();
  w.eval(code);
  const sender = {id: runtime.id, url: runtime.getURL('src/vod/vod-tools.html')};
  function send(data, from = sender) { for (const fn of listeners) fn({type: 'cheesemoa-vod-player', version: 1, ...data}, from, () => {}); }
  function discover() { send({action: 'discover', discoveryId: 'discovery-0001'}); return replies.at(-1); }
  function command(registration, action = 'snapshot', extra = {}) {
    const data = {action, generation: registration.generation, sourceKey: registration.source.sourceKey,
      requestId: `request-${++request}`, ...extra}; send(data); return data;
  }
  t.after(() => { w.__cheesemoaVodFrameDispose(); w.close(); });
  return {w, replies, timers, listeners, sender, video, send, discover, command, reload: () => w.eval(code)};
}

test('frame accepts only exact tools sender and VOD identity, captures integer milliseconds', t => {
  const h = frame(t);
  for (const from of [{...h.sender, id: 'foreign'}, {...h.sender, url: 'https://chzzk.naver.com/video/001234'},
    {...h.sender, url: h.sender.url + '?spoof=true'}]) h.send({action: 'discover', discoveryId: 'discover-0001'}, from);
  assert.equal(h.replies.length, 0);
  const reg = h.discover();
  assert.equal(reg.source.videoId, '001234');
  h.command(reg);
  assert.equal(h.replies.at(-1).positionMs, 12346);
  const count = h.replies.length;
  h.command(reg, 'snapshot', {sourceKey: 'chzzk:vod:99'});
  h.command(reg, 'snapshot', {generation: 'different-epoch'});
  assert.equal(h.replies.length, count);
});

test('live, missing, ambiguous, advertising and invalid media never register', async t => {
  for (const options of [{url: 'https://chzzk.naver.com/live/' + 'a'.repeat(32)}, {videos: 0}, {videos: 2}]) {
    await t.test(JSON.stringify(options), t => { const h = frame(t, options); h.discover(); assert.equal(h.replies.length, 0); });
  }
  for (const overrides of [{duration: Infinity}, {duration: NaN}, {readyState: 0}, {error: {}}, {currentTime: -1}, {currentTime: 7201}]) {
    await t.test(JSON.stringify(overrides), t => { const h = frame(t, {videos: 0}); h.video(overrides); h.discover(); assert.equal(h.replies.length, 0); });
  }
  await t.test('known ad marker', t => {
    const h = frame(t); h.w.document.body.dataset.adPlaying = 'true'; h.discover(); assert.equal(h.replies.length, 0);
  });
});

test('seek verifies seeked, exact target and preserves paused/play and audio state', async t => {
  for (const paused of [true, false]) await t.test(`paused=${paused}`, t => {
    const h = frame(t), v = h.w.document.querySelector('video'); v.paused = paused;
    const reg = h.discover(), cmd = h.command(reg, 'seek', {positionMs: 1234567});
    assert.equal(v.currentTime, 1234.567);
    assert.equal(h.replies.length, 1);
    v.dispatchEvent(new h.w.Event('seeked'));
    assert.deepEqual([v.paused, v.volume, v.muted], [paused, 0.37, true]);
    assert.equal(h.replies.at(-1).requestId, cmd.requestId);
    assert.equal(h.replies.at(-1).ok, true);
    assert.equal(h.replies.at(-1).positionMs, 1234567);
    assert.equal(h.timers.size, 0);
  });
});

test('seek rejects invalid, outside-seekable, unsettled and duplicate commands', t => {
  const h = frame(t), v = h.w.document.querySelector('video'), reg = h.discover();
  for (const positionMs of [-1, 1.5, Infinity, 7200001]) {
    h.command(reg, 'seek', {positionMs}); assert.equal(h.replies.at(-1).ok, false); assert.equal(v.currentTime, 12.3456);
  }
  v.seekable = {length: 1, start: () => 100, end: () => 200};
  h.command(reg, 'seek', {positionMs: 50000}); assert.equal(h.replies.at(-1).ok, false);
  const cmd = h.command(reg, 'seek', {positionMs: 150000});
  const count = h.replies.length; h.send(cmd); assert.equal(h.replies.length, count);
  h.command(reg, 'seek', {positionMs: 175000}); assert.equal(h.replies.at(-1).ok, false);
  v.currentTime = 160; v.dispatchEvent(new h.w.Event('seeked')); assert.equal(h.replies.at(-1).ok, false);
  v.seeking = true; h.command(reg); assert.equal(h.replies.at(-1).ok, false);
});

test('seek timeout produces one failure and removes listener', t => {
  const h = frame(t), reg = h.discover(); h.command(reg, 'seek', {positionMs: 100000});
  for (const fn of [...h.timers.values()]) fn();
  assert.equal(h.replies.at(-1).ok, false); const count = h.replies.length;
  h.w.document.querySelector('video').dispatchEvent(new h.w.Event('seeked'));
  assert.equal(h.replies.length, count); assert.equal(h.timers.size, 0);
});

test('same-VOD media replacement invalidates pending seek and selection; unrelated DOM preserves generation', async t => {
  const h = frame(t), reg = h.discover(), old = h.w.document.querySelector('video');
  h.w.document.body.append(h.w.document.createElement('span')); await flush();
  assert.equal(h.discover().generation, reg.generation);
  h.command(reg, 'seek', {positionMs: 100000});
  old.remove(); const replacement = h.video(); await flush();
  assert.equal(h.timers.size, 0);
  const count = h.replies.length; h.command(reg, 'seek', {positionMs: 200000});
  old.dispatchEvent(new h.w.Event('seeked'));
  assert.equal(h.replies.length, count); assert.equal(replacement.currentTime, 12.3456);
  assert.notEqual(h.discover().generation, reg.generation);
});

test('media source reset, SPA navigation and ad changes invalidate epochs', async t => {
  const h = frame(t), v = h.w.document.querySelector('video');
  let reg = h.discover();
  v.setAttribute('src', '/new-media.mp4'); await flush(); assert.notEqual(h.discover().generation, reg.generation);
  reg = h.discover(); v.dispatchEvent(new h.w.Event('emptied')); assert.notEqual(h.discover().generation, reg.generation);
  reg = h.discover(); h.w.history.pushState({}, '', '/video/999');
  const count = h.replies.length; h.command(reg); assert.equal(h.replies.length, count);
  assert.equal(h.discover().source.sourceKey, 'chzzk:vod:999');
  reg = h.discover(); h.w.document.body.className = 'ad-showing'; await flush();
  h.w.document.body.className = ''; await flush(); assert.notEqual(h.discover().generation, reg.generation);
});

test('pagehide/pageshow and reinjection clean up and invalidate previous requests', t => {
  const h = frame(t), reg = h.discover(); h.command(reg, 'seek', {positionMs: 300000});
  h.w.dispatchEvent(new h.w.Event('pagehide'));
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  h.w.dispatchEvent(new h.w.Event('pageshow'));
  assert.equal(h.listeners.size, 1); assert.notEqual(h.discover().generation, reg.generation);
  const reg2 = h.discover(); h.reload();
  assert.equal(h.listeners.size, 1); assert.notEqual(h.discover().generation, reg2.generation);
});
