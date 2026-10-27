import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteStore} from '../src/vod/note-store.js';
import {parseVodSource} from '../src/vod/source.js';
import {NOTE_LIMITS} from '../src/vod/note-model.js';

const source = parseVodSource('https://chzzk.naver.com/video/00123');
const location = {protocol: 'chrome-extension:'};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
// A small asynchronous IndexedDB contract harness, not a browser IDB replacement.
// It models serialized transactions, staging, abort and completion independently
// of createNoteStore; native browser coverage is run separately by browser QA.
function database(initial) {
  let row = initial, busy = false, created = false;
  const queue = [], connections = [], modes = [];
  const control = {holdCommits: false, commits: [], failPut: false, failRead: false, failTransaction: false, opens: 0};
  function pump() { if (!busy && queue.length) { busy = true; queueMicrotask(queue.shift()); } }
  function transaction(_store, mode) {
    if (control.failTransaction) throw new Error('closed database');
    modes.push(mode);
    let staged, aborted = false, finished = false, getRequest;
    const tx = {objectStore: () => ({get() { getRequest = {}; return getRequest; },
      put(value) { if (control.failPut) { queueMicrotask(() => tx.abort()); return {}; } staged = structuredClone(value); return {}; }}),
      abort() { if (finished) throw new Error('transaction already finished'); aborted = true; queueMicrotask(finish); }};
    function finish() {
      if (finished) return; finished = true;
      if (aborted) tx.onabort?.();
      else { if (staged !== undefined) row = staged; tx.oncomplete?.(); }
      busy = false; pump();
    }
    queue.push(() => {
      if (control.failRead) { tx.onerror?.(); tx.abort(); return; }
      getRequest.result = structuredClone(row); getRequest.onsuccess?.();
      queueMicrotask(() => { if (finished) return; if (control.holdCommits) control.commits.push(finish); else finish(); });
    });
    pump(); return tx;
  }
  const indexedDB = {open() {
    control.opens++; const request = {};
    queueMicrotask(() => {
      const connection = {transaction, createObjectStore() {}, close() { connection.closed = true; }};
      connections.push(connection); request.result = connection;
      if (!created) { created = true; request.onupgradeneeded?.(); }
      request.onsuccess?.();
    }); return request;
  }};
  return {indexedDB, control, connections, modes, persisted: () => structuredClone(row),
    commit() { for (const finish of control.commits.splice(0)) finish(); }};
}
function store(t, db, suffix = 'a') {
  let id = 0;
  const api = createNoteStore({indexedDB: db.indexedDB, location, uuid: () => `note-${suffix}-${String(++id).padStart(8, '0')}`, now: () => 100});
  t.after(() => api.close()); return api;
}
const add = (api, text = '메모', positionMs = 1234567) => api.add({source, positionMs, text});

test('separate tools tabs serialize concurrent adds without losing notes', async t => {
  const db = database(), a = store(t, db), b = store(t, db, 'b');
  await Promise.all([add(a, 'A', 300), add(b, 'B', 200), add(a, 'C', 100)]);
  const notes = await b.list(source.sourceKey);
  assert.deepEqual(notes.map(n => n.text), ['C', 'B', 'A']);
  assert.equal(new Set(notes.map(n => n.id)).size, 3);
  assert.equal(db.control.opens, 2);
  assert.deepEqual(db.modes, ['readwrite', 'readwrite', 'readwrite', 'readonly']);
  assert.equal((await a.list('chzzk:vod:999')).length, 0);
  await assert.rejects(a.list('not-a-vod'), {code: 'INVALID'});
});

test('concurrent updates and delete versus update conflict without overwriting', async t => {
  const db = database(), a = store(t, db), b = store(t, db, 'b'), note = await add(a);
  const results = await Promise.allSettled([a.update(note.id, {text: 'first', expectedRevision: 1}), b.update(note.id, {text: 'second', expectedRevision: 1})]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.code, 'CONFLICT');
  assert.equal((await b.list())[0].text, 'first');
  const mixed = await Promise.allSettled([b.update(note.id, {positionMs: 42, expectedRevision: 2}), a.remove(note.id, 2)]);
  assert.equal(mixed[0].status, 'fulfilled'); assert.equal(mixed[1].reason.code, 'CONFLICT');
  await a.remove(note.id, 3); assert.deepEqual(await b.list(), []);
  await assert.rejects(a.update(note.id, {text: 'resurrection', expectedRevision: 3}), {code: 'NOT_FOUND'});
});

test('write resolves only after transaction completion and survives reopen', async t => {
  const db = database(), a = store(t, db); db.control.holdCommits = true;
  let resolved = false; const write = add(a).then(note => { resolved = true; return note; });
  await flush(); assert.equal(resolved, false); assert.equal(db.persisted(), undefined);
  db.control.holdCommits = false; db.commit(); const note = await write;
  a.close(); const reopened = store(t, db, 'b');
  assert.deepEqual(await reopened.list(), [note]);
});

test('quota and read aborts reject and keep prior persisted value', async t => {
  const db = database(), api = store(t, db), note = await add(api), before = db.persisted();
  db.control.failPut = true;
  await assert.rejects(api.update(note.id, {text: 'lost', expectedRevision: 1}), {code: 'STORAGE'});
  assert.deepEqual(db.persisted(), before);
  db.control.failPut = false; db.control.failRead = true;
  await assert.rejects(api.list(), {code: 'STORAGE'});
  db.control.failRead = false; assert.deepEqual(await api.list(), [note]);
});

test('malformed persisted schema and missing notes fail closed', async t => {
  for (const row of [null, {key: 'notes', schemaVersion: 2, notes: []}, {key: 'notes', schemaVersion: 1},
    {key: 'notes', schemaVersion: 1, notes: null}, {key: 'notes', schemaVersion: 1, notes: [{}]}]) {
    const db = database(row), api = store(t, db);
    await assert.rejects(api.list()); await assert.rejects(add(api)); assert.deepEqual(db.persisted(), row);
  }
});

test('count and byte caps reject the entire transaction without partial writes', async t => {
  const seedDb = database(), seed = store(t, seedDb), sample = await add(seed);
  const full = Array.from({length: NOTE_LIMITS.count}, (_, i) => ({...sample, id: `note-${String(i).padStart(8, '0')}`}));
  const db = database({key: 'notes', schemaVersion: 1, notes: full}), api = store(t, db);
  await assert.rejects(add(api), {code: 'LIMIT'}); assert.equal(db.persisted().notes.length, NOTE_LIMITS.count);
  const large = Array.from({length: 340}, (_, i) => ({...sample, id: `note-${String(i).padStart(8, '0')}`, text: '가'.repeat(1900)}));
  const bytes = new TextEncoder().encode(JSON.stringify(large)).byteLength;
  const growth = Math.floor((NOTE_LIMITS.bytes - bytes) / 300);
  assert.ok(growth >= 0 && growth < large.length);
  for (let i = 0; i < growth; i++) large[i].text = '가'.repeat(2000);
  const byteDb = database({key: 'notes', schemaVersion: 1, notes: large}), byteStore = store(t, byteDb);
  // A legal individual text now crosses the total UTF-8 cap by at most 300 bytes.
  await assert.rejects(byteStore.update(large[growth].id, {text: '가'.repeat(2000), expectedRevision: 1}), {code: 'LIMIT'});
  assert.equal(byteDb.persisted().notes[growth].text.length, 1900);
});

test('extension-origin guard, close and version change prevent further writes', async t => {
  const db = database(), bad = createNoteStore({indexedDB: db.indexedDB, location: {protocol: 'https:'}});
  await assert.rejects(add(bad), {code: 'UNAVAILABLE'}); assert.equal(db.control.opens, 0);
  const api = store(t, db); await add(api); db.connections[0].onversionchange();
  await assert.rejects(add(api), {code: 'CLOSED'}); assert.equal(db.connections[0].closed, true);
  const closed = store(t, db, 'b'); closed.close(); await assert.rejects(closed.list(), {code: 'CLOSED'});
});

test('closing while open is pending closes eventual connection and rejects', async () => {
  const db = database(), api = createNoteStore({indexedDB: db.indexedDB, location});
  const pending = api.list(), rejected = assert.rejects(pending, {code: 'CLOSED'}); api.close(); await rejected;
  assert.equal(db.connections[0].closed, true);
});

test('synchronous open/transaction errors are surfaced as storage failures', async t => {
  const throwing = createNoteStore({indexedDB: {open() { throw new Error('denied'); }}, location});
  await assert.rejects(throwing.list(), {code: 'STORAGE'});
  const db = database(), api = store(t, db); db.control.failTransaction = true;
  await assert.rejects(api.list(), {code: 'STORAGE'});
});

test('blocked open rejects; a delayed success is closed without writing', async () => {
  let request, closed = false;
  const api = createNoteStore({indexedDB: {open() { request = {}; return request; }}, location});
  const pending = api.list(), rejected = assert.rejects(pending, {code: 'STORAGE'});
  request.onblocked(); await rejected;
  request.result = {close() { closed = true; }}; request.onsuccess(); assert.equal(closed, true);
  await assert.rejects(api.list(), {code: 'STORAGE'}); api.close();
});
