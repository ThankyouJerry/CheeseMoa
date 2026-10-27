import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initVodTools } from '../src/vod/vod-tools.js';
import { requireVodSource } from '../src/vod/source.js';
import { applyNoteOperation, NOTE_LIMITS } from '../src/vod/note-model.js';

const html = await readFile(new URL('../src/vod/vod-tools.html', import.meta.url), 'utf8');
const source = requireVodSource('https://chzzk.naver.com/video/123');
const other = requireVodSource('https://chzzk.naver.com/video/456');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const job = (extra = {}) => ({ id: 'job-1', source, status: 'paused', count: 3, bytes: 1024, startMs: 0, endMs: null, cursorMs: 42000, detail: '경계 완전성 미검증', ...extra });

async function fixture(t, { savedJobs = [], savedNotes = [] } = {}) {
  const dom = new JSDOM(html, { url: 'https://test.invalid/vod-tools.html' });
  const doc = dom.window.document;
  const calls = [];
  let onUpdate, state = [...savedNotes], sequence = 0;
  const controller = {
    async listJobs() { calls.push(['listJobs']); return [...savedJobs]; },
    async start(input) { calls.push(['start', input]); },
    async resume(id) { calls.push(['resume', id]); },
    async pause() { calls.push(['pause']); },
    async deleteJob(id) { calls.push(['deleteJob', id]); savedJobs = savedJobs.filter(row => row.id !== id); },
    async exportParts(id) { calls.push(['exportParts', id]); return [{ filename: 'chat.csv', blob: new Blob(['message\nhello']) }]; },
  };
  const mutate = operation => {
    const result = applyNoteOperation(state, operation, { now: () => 1234567, uuid: () => `note-${String(++sequence).padStart(8, '0')}` });
    state = result.notes;
    return result.result;
  };
  const noteStore = {
    async list(key) { calls.push(['notes.list', key]); return state.filter(note => note.source.sourceKey === key); },
    async add(value) { calls.push(['notes.add', value]); return mutate({ type: 'add', ...value }); },
    async update(id, value) { calls.push(['notes.update', id, value]); return mutate({ type: 'update', id, ...value }); },
    async remove(id, expectedRevision) { calls.push(['notes.remove', id, expectedRevision]); return mutate({ type: 'remove', id, expectedRevision }); },
    close() { calls.push(['notes.close']); },
  };
  const player = {
    async discover() { calls.push(['discover']); return []; },
    async snapshot(selected) { calls.push(['snapshot', selected]); return { source: selected.source, positionMs: 123456 }; },
    async seek(selected, positionMs) { calls.push(['seek', selected, positionMs]); return { source: selected.source, positionMs }; },
    dispose() { calls.push(['player.dispose']); },
  };
  const created = [], revoked = [];
  const urlApi = {
    createObjectURL(blob) { const url = `blob:test/${created.length}`; created.push({ url, blob }); return url; },
    revokeObjectURL(url) { revoked.push(url); },
  };
  const api = await initVodTools({ document: doc, createController(options) { onUpdate = options.onUpdate; return controller; }, noteStore, player, urlApi });
  t.after(() => { api.dispose(); dom.window.close(); });
  const $ = id => doc.getElementById(id);
  const submit = async id => { $(id).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await flush(); };
  const click = async node => { (typeof node === 'string' ? $(node) : node).click(); await flush(); };
  const rowButton = (list, text, index = 0) => [...$(list).querySelectorAll('button')].filter(node => node.textContent === text)[index];
  const selectPlayer = async value => { $('player-select').value = String(value); $('player-select').dispatchEvent(new dom.window.Event('change')); await flush(); };
  const emit = updated => { savedJobs = [...savedJobs.filter(row => row.id !== updated.id), updated]; onUpdate(updated); };
  return { api, dom, doc, $, submit, click, rowButton, selectPlayer, calls, controller, noteStore, player, urlApi, created, revoked, emit, mutate, getNotes: () => state };
}

test('open and source selection never collect, discover players or access power/settings', async t => {
  const chromeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let forbidden = 0;
  Object.defineProperty(globalThis, 'chrome', { configurable: true, get() { forbidden++; throw new Error('power/settings API forbidden'); } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value() { forbidden++; throw new Error('network forbidden'); } });
  t.after(() => {
    if (chromeDescriptor) Object.defineProperty(globalThis, 'chrome', chromeDescriptor); else delete globalThis.chrome;
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor); else delete globalThis.fetch;
  });
  const f = await fixture(t, { savedJobs: [job({ status: 'running' })] });
  assert.deepEqual(f.calls, [['listJobs']]);
  assert.equal(f.$('chat-fields').disabled, true);
  assert.equal(f.rowButton('jobs-list', '이어 수집').disabled, true);
  await f.api.selectSource(source.canonicalUrl);
  assert.deepEqual(f.calls.map(call => call[0]), ['listJobs', 'notes.list']);
  f.$('note-text').value = '격리된 메모';
  await f.submit('note-form');
  await f.submit('chat-form');
  assert.equal(f.getNotes().length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'start').length, 1);
  assert.equal(forbidden, 0);
});

test('invalid/live URLs and invalid ranges never start collection; canonical source and exact ms reach start', async t => {
  const f = await fixture(t);
  for (const value of ['https://evil.invalid/video/123', 'https://chzzk.naver.com/live/' + 'a'.repeat(32)]) {
    await f.api.selectSource(value);
    assert.equal(f.$('source-status').classList.contains('error'), true);
    assert.equal(f.$('chat-fields').disabled, true);
  }
  await f.api.selectSource(source.canonicalUrl + '?t=5');
  assert.equal(f.$('source-url').value, source.canonicalUrl);
  for (const [start, end] of [['-1', ''], ['0', 'invalid'], ['12', '12'], ['12', '11']]) {
    f.$('range-start').value = start; f.$('range-end').value = end;
    await f.submit('chat-form');
    assert.equal(f.$('chat-status').classList.contains('error'), true);
  }
  assert.equal(f.calls.some(call => call[0] === 'start'), false);
  f.$('range-start').value = '00:00:12.345'; f.$('range-end').value = '90.001';
  await f.submit('chat-form');
  assert.deepEqual(f.calls.find(call => call[0] === 'start')[1], { source, startMs: 12345, endMs: 90001 });
});

test('explicit start/pause/resume keep the original source and surface partial/failed status', async t => {
  const f = await fixture(t);
  const running = deferred();
  f.controller.start = input => { f.calls.push(['start', input]); f.emit(job({ status: 'running' })); return running.promise; };
  f.controller.pause = async () => { f.calls.push(['pause']); f.emit(job({ status: 'paused' })); running.resolve(job()); };
  await f.api.selectSource(source.canonicalUrl);
  await f.submit('chat-form');
  assert.equal(f.$('chat-fields').disabled, true);
  assert.equal(f.$('chat-pause').hidden, false);
  await f.api.selectSource(other.canonicalUrl);
  assert.equal(f.calls.find(call => call[0] === 'start')[1].source.sourceKey, source.sourceKey);
  await f.click('chat-pause');
  assert.equal(f.$('chat-fields').disabled, false);
  assert.equal(f.$('chat-pause').hidden, true);
  f.controller.resume = async id => { f.calls.push(['resume', id]); f.emit(job({ status: 'partial', detail: '<img src=x onerror=alert(1)> 경계 반복' })); };
  await f.click(f.rowButton('jobs-list', '이어 수집'));
  assert.match(f.$('chat-status').textContent, /부분 수집/);
  assert.match(f.$('jobs-list').textContent, /완전성 미검증/);
  assert.equal(f.$('jobs-list').querySelector('img'), null);
  assert.equal(f.rowButton('jobs-list', 'CSV 준비').disabled, false);
  f.controller.resume = async () => f.emit(job({ status: 'failed', detail: '서버 오류' }));
  await f.click(f.rowButton('jobs-list', '이어 수집'));
  assert.match(f.$('chat-status').textContent, /오류로 중단/);
  assert.equal(f.$('chat-status').classList.contains('error'), true);
  assert.equal(f.rowButton('jobs-list', 'CSV 준비').disabled, false);
});

test('start rejection restores controls without a success message', async t => {
  const f = await fixture(t);
  await f.api.selectSource(source.canonicalUrl);
  f.controller.start = async () => { throw new Error('다른 창에서 실행 중'); };
  await f.submit('chat-form');
  assert.match(f.$('chat-status').textContent, /다른 창/);
  assert.equal(f.$('chat-status').classList.contains('error'), true);
  assert.equal(f.$('chat-fields').disabled, false);
  assert.equal(f.$('chat-pause').hidden, true);
});

test('CSV preparation retains partial status and revokes Blob URLs on replacement, source change, deletion and disposal', async t => {
  const f = await fixture(t, { savedJobs: [job({ status: 'partial' })] });
  const prepare = () => f.click(f.rowButton('jobs-list', 'CSV 준비'));
  await prepare();
  assert.equal(f.$('export-panel').hidden, false);
  assert.equal(f.$('export-links').querySelector('a').download, 'chat.csv');
  assert.match(f.$('chat-status').textContent, /부분 수집.*완전성 미검증.*준비됨/);
  assert.doesNotMatch(f.$('chat-status').textContent, /저장했습니다|저장 완료/);
  await prepare();
  assert.deepEqual(f.revoked, ['blob:test/0']);
  await f.api.selectSource(other.canonicalUrl);
  assert.deepEqual(f.revoked, ['blob:test/0', 'blob:test/1']);
  assert.equal(f.$('export-panel').hidden, true);
  await prepare();
  await f.click(f.rowButton('jobs-list', '작업 삭제'));
  assert.deepEqual(f.revoked, ['blob:test/0', 'blob:test/1', 'blob:test/2']);
  f.emit(job()); await prepare(); f.api.dispose(); f.api.dispose();
  assert.deepEqual(f.revoked, f.created.map(item => item.url));
});

test('late CSV responses are suppressed and partial URL allocation is cleaned up after error', async t => {
  const f = await fixture(t, { savedJobs: [job()] });
  const pending = deferred();
  f.controller.exportParts = () => pending.promise;
  await f.click(f.rowButton('jobs-list', 'CSV 준비'));
  await f.api.selectSource(other.canonicalUrl);
  assert.doesNotMatch(f.$('chat-status').textContent, /준비하는 중/);
  pending.resolve([{ filename: 'old.csv', blob: new Blob(['old']) }]); await flush();
  assert.equal(f.created.length, 0);
  assert.equal(f.$('export-panel').hidden, true);
  f.controller.exportParts = async () => [{ filename: 'a.csv', blob: new Blob() }, { filename: 'b.csv', blob: new Blob() }];
  const allocate = f.urlApi.createObjectURL;
  f.urlApi.createObjectURL = blob => { if (f.created.length) throw new Error('메모리 부족'); return allocate(blob); };
  await f.click(f.rowButton('jobs-list', 'CSV 준비'));
  assert.deepEqual(f.revoked, ['blob:test/0']);
  assert.equal(f.$('export-panel').hidden, true);
  assert.match(f.$('chat-status').textContent, /메모리 부족/);
});

test('resuming collection revokes the old CSV download before collecting more rows', async t => {
  const f = await fixture(t, { savedJobs: [job()] });
  await f.click(f.rowButton('jobs-list', 'CSV 준비'));
  assert.equal(f.$('export-panel').hidden, false);
  await f.click(f.rowButton('jobs-list', '이어 수집'));
  assert.deepEqual(f.revoked, ['blob:test/0']);
  assert.equal(f.$('export-panel').hidden, true);
});

test('manual notes CRUD preserves exact time, literal text, revision and source isolation', async t => {
  const f = await fixture(t);
  assert.equal(f.$('note-text').maxLength, NOTE_LIMITS.text);
  await f.api.selectSource(source.canonicalUrl);
  f.$('note-time').value = '01:02:03.456'; f.$('note-text').value = '<b>메모</b>\n두 번째 줄';
  await f.submit('note-form');
  const first = f.getNotes()[0];
  assert.equal(first.positionMs, 3723456);
  assert.equal(f.$('notes-list').querySelector('b'), null);
  assert.match(f.$('notes-list').textContent, /<b>메모<\/b>/);
  await f.click(f.rowButton('notes-list', '수정'));
  f.$('note-time').value = '42.001'; f.$('note-text').value = '수정됨';
  await f.submit('note-form');
  assert.deepEqual(f.calls.find(call => call[0] === 'notes.update').slice(1), [first.id, { text: '수정됨', positionMs: 42001, expectedRevision: 1 }]);
  await f.api.selectSource(other.canonicalUrl);
  assert.doesNotMatch(f.$('notes-list').textContent, /수정됨/);
  f.$('note-text').value = '다른 VOD'; await f.submit('note-form');
  await f.api.selectSource(source.canonicalUrl);
  assert.match(f.$('notes-list').textContent, /수정됨/);
  assert.doesNotMatch(f.$('notes-list').textContent, /다른 VOD/);
  await f.click(f.rowButton('notes-list', '삭제'));
  assert.deepEqual(f.calls.find(call => call[0] === 'notes.remove').slice(1), [first.id, 2]);
  assert.equal(f.getNotes().length, 1);
  assert.equal(f.getNotes()[0].source.sourceKey, other.sourceKey);
});

test('note conflict and quota failure preserve draft and never claim save/delete success', async t => {
  const f = await fixture(t);
  await f.api.selectSource(source.canonicalUrl);
  f.$('note-text').value = '최초 메모'; await f.submit('note-form');
  await f.click(f.rowButton('notes-list', '수정'));
  const first = f.getNotes()[0];
  f.mutate({ type: 'update', id: first.id, expectedRevision: 1, text: '다른 창의 수정' });
  f.$('note-text').value = '내 초안'; await f.submit('note-form');
  assert.equal(f.$('note-text').value, '내 초안');
  assert.equal(f.$('note-status').classList.contains('error'), true);
  assert.equal(f.getNotes()[0].text, '다른 창의 수정');
  await f.click(f.rowButton('notes-list', '삭제'));
  assert.equal(f.getNotes().length, 1);
  assert.equal(f.$('note-status').classList.contains('error'), true);
  await f.click('note-cancel');
  f.noteStore.add = async () => { throw new Error('저장 공간 부족'); };
  f.$('note-text').value = '보존할 초안'; await f.submit('note-form');
  assert.equal(f.$('note-text').value, '보존할 초안');
  assert.match(f.$('note-status').textContent, /저장 공간 부족/);
  assert.equal(f.$('note-fields').disabled, false);
  f.$('note-time').value = '-1'; await f.submit('note-form');
  assert.equal(f.$('note-status').classList.contains('error'), true);
});

test('late note lists cannot leak another source or overwrite a pending note mutation', async t => {
  const f = await fixture(t);
  const oldList = deferred(), actualList = f.noteStore.list;
  f.noteStore.list = key => key === source.sourceKey ? oldList.promise : actualList(key);
  const selecting = f.api.selectSource(source.canonicalUrl);
  await f.api.selectSource(other.canonicalUrl);
  oldList.resolve([{ id: 'old', source, positionMs: 1, text: '이전 VOD', revision: 1 }]); await selecting;
  assert.doesNotMatch(f.$('notes-list').textContent, /이전 VOD/);
  f.noteStore.list = actualList;
  f.$('note-text').value = '현재 메모'; await f.submit('note-form');
  const stale = deferred(); f.noteStore.list = () => stale.promise;
  const reading = f.api.refreshNotes();
  const save = deferred(), actualAdd = f.noteStore.add;
  f.noteStore.add = value => save.promise.then(() => actualAdd(value));
  f.$('note-text').value = '추가 메모'; await f.submit('note-form');
  assert.equal(f.$('source-url').disabled, true);
  stale.resolve([]); await reading;
  assert.match(f.$('notes-list').textContent, /현재 메모/);
  await f.api.selectSource(source.canonicalUrl);
  assert.equal(f.$('source-url').value, other.canonicalUrl);
  f.noteStore.list = actualList;
  save.resolve(); await flush();
  assert.match(f.$('notes-list').textContent, /현재 메모/);
  assert.match(f.$('notes-list').textContent, /추가 메모/);
  assert.equal(f.$('source-url').disabled, false);
});

test('player discovery requires explicit exact selection; snapshot and seek use selected tab/frame', async t => {
  const f = await fixture(t);
  const candidates = [
    { source, tabId: 1, frameId: 0, documentId: 'first', generation: 'first-generation', label: '<img> 첫 번째' },
    { source, tabId: 2, frameId: 3, documentId: 'second', generation: 'second-generation', label: '두 번째' },
    { source: other, tabId: 3, frameId: 0, documentId: 'other', generation: 'other-generation' },
  ];
  f.player.discover = async () => candidates;
  await f.api.selectSource(source.canonicalUrl);
  await f.click('player-discover');
  assert.equal(f.$('player-select').options.length, 3);
  assert.equal(f.$('player-select').value, '');
  assert.equal(f.$('note-snapshot').disabled, true);
  assert.equal(f.$('player-select').querySelector('img'), null);
  await f.selectPlayer(1); await f.click('note-snapshot');
  assert.equal(f.$('note-time').value, '00:02:03.456');
  assert.equal(f.calls.find(call => call[0] === 'snapshot')[1], candidates[1]);
  f.$('note-text').value = '선택한 시각'; await f.submit('note-form');
  await f.click(f.rowButton('notes-list', '이 시각으로 이동'));
  assert.deepEqual(f.calls.find(call => call[0] === 'seek').slice(1), [candidates[1], 123456]);
  assert.match(f.$('player-status').textContent, /이동했습니다/);
});

test('stale player responses never overwrite another VOD or concurrent draft; mismatch and timeout require rediscovery', async t => {
  const f = await fixture(t);
  f.player.discover = async () => [{ source, tabId: 1, frameId: 0 }];
  await f.api.selectSource(source.canonicalUrl); await f.click('player-discover'); await f.selectPlayer(0);
  const pending = deferred(); f.player.snapshot = () => pending.promise;
  await f.click('note-snapshot');
  assert.equal(f.$('note-fields').disabled, true);
  await f.api.selectSource(other.canonicalUrl);
  pending.resolve({ source, positionMs: 10000 }); await flush();
  assert.equal(f.$('note-time').value, '00:00:00.000');
  assert.equal(f.$('player-select').value, '');
  assert.equal(f.$('note-fields').disabled, false);
  await f.api.selectSource(source.canonicalUrl); await f.click('player-discover'); await f.selectPlayer(0);
  f.player.snapshot = async () => ({ source: other, positionMs: 99999 });
  await f.click('note-snapshot');
  assert.equal(f.$('note-time').value, '00:00:00.000');
  assert.equal(f.$('note-snapshot').disabled, true);
  assert.equal(f.$('player-status').classList.contains('error'), true);
  await f.click('player-discover'); await f.selectPlayer(0);
  f.player.snapshot = async () => { throw new Error('응답 시간 초과'); };
  await f.click('note-snapshot');
  assert.match(f.$('player-status').textContent, /응답 시간 초과/);
  assert.equal(f.$('player-select').value, '');
});

test('late job lists and list failures cannot overwrite checkpoints or resurrect deleted jobs', async t => {
  const f = await fixture(t, { savedJobs: [job()] });
  const stale = deferred(); f.controller.listJobs = () => stale.promise;
  const reading = f.api.refreshJobs();
  f.emit(job({ count: 50, status: 'partial' }));
  stale.resolve([job()]); await reading;
  assert.match(f.$('jobs-list').textContent, /50개/);
  const pendingDelete = deferred(); f.controller.deleteJob = () => pendingDelete.promise;
  await f.click(f.rowButton('jobs-list', '작업 삭제'));
  const duringDelete = deferred(); f.controller.listJobs = () => duringDelete.promise;
  const racingRead = f.api.refreshJobs();
  pendingDelete.resolve(); await flush();
  duringDelete.resolve([job()]); await racingRead;
  assert.equal(f.$('jobs-list').querySelector('[data-job-id]'), null);
  const oldFailure = deferred(); f.controller.listJobs = () => oldFailure.promise;
  const failingRead = f.api.refreshJobs(); f.emit(job({ status: 'partial' }));
  oldFailure.reject(new Error('오래된 오류')); await failingRead;
  assert.doesNotMatch(f.$('chat-status').textContent, /오래된 오류/);
});

test('failed player rediscovery clears the previous target and leaves manual notes available', async t => {
  const f = await fixture(t);
  f.player.discover = async () => [{ source, tabId: 1, frameId: 0 }];
  await f.api.selectSource(source.canonicalUrl); await f.click('player-discover'); await f.selectPlayer(0);
  assert.equal(f.$('note-snapshot').disabled, false);
  f.player.discover = async () => { throw new Error('검색 실패'); };
  await f.click('player-discover');
  assert.equal(f.$('player-select').value, '');
  assert.equal(f.$('note-snapshot').disabled, true);
  assert.equal(f.$('note-fields').disabled, false);
  assert.match(f.$('player-status').textContent, /검색 실패/);
});

test('pagehide pauses the document collector and ignores pending exports after cleanup', async t => {
  const f = await fixture(t, { savedJobs: [job()] });
  const pending = deferred(); f.controller.exportParts = () => pending.promise;
  await f.click(f.rowButton('jobs-list', 'CSV 준비'));
  f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide'));
  pending.resolve([{ filename: 'late.csv', blob: new Blob() }]); await flush();
  assert.equal(f.created.length, 0);
  assert.deepEqual(f.calls.slice(-3).map(call => call[0]), ['pause', 'player.dispose', 'notes.close']);
});

test('popup opens VOD tools only on click, preserves settings, and reports opening failure', async t => {
  const dom = new JSDOM(await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8'), { url: 'https://test.invalid' });
  const closeWindow = dom.window.close.bind(dom.window);
  const descriptors = new Map(['window', 'document', 'navigator', 'chrome', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { closeWindow(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  let closed = 0, writes = 0, fail = false;
  const opened = [];
  dom.window.close = () => { closed++; };
  const globals = {
    window: dom.window, document: dom.window.document,
    navigator: { locks: { request: (_, options, fn) => (fn || options)() } },
    fetch: async () => { throw new Error('offline'); },
    chrome: {
      storage: { local: { get: async () => ({}), set: async () => { writes++; } }, onChanged: { addListener() {} } },
      tabs: { create: async ({ url }) => { if (fail) throw new Error('blocked'); opened.push(url); } },
      runtime: { getManifest: () => ({ content_scripts: [{ js: ['src/viewer/site-host.js'] }] }), getURL: path => `chrome-extension://test/${path}`, getContexts: async () => [] },
    },
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  await import('../src/popup/popup.js');
  assert.deepEqual(opened, []);
  const button = dom.window.document.querySelector('#vod-tools-button');
  fail = true; button.click(); await flush();
  assert.equal(button.disabled, false);
  assert.match(dom.window.document.querySelector('#vod-tools-status').textContent, /열지 못했습니다/);
  assert.equal(closed, 0);
  fail = false; button.click(); await flush();
  assert.deepEqual(opened, ['chrome-extension://test/src/vod/vod-tools.html']);
  assert.equal(closed, 1);
  assert.equal(writes, 0);
});
