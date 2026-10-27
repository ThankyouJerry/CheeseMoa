import {applyNoteOperation, noteError, validateNotes} from './note-model.js';

const DB_NAME = 'cheesemoa.vod-notes.v1';
// Only extension documents own this database. Content scripts never open it.
export function createNoteStore({indexedDB = globalThis.indexedDB, location = globalThis.location,
  now = Date.now, uuid = () => crypto.randomUUID()} = {}) {
  let opening, database, closed = false;
  function open() {
    if (closed) return Promise.reject(noteError('CLOSED', '메모 저장소가 닫혔습니다. 도구 페이지를 다시 열어 주세요.'));
    if (location?.protocol !== 'chrome-extension:' || !indexedDB) {
      return Promise.reject(noteError('UNAVAILABLE', '메모는 확장 프로그램 도구 페이지에서 저장할 수 있습니다.'));
    }
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let settled = false;
      let request;
      try { request = indexedDB.open(DB_NAME, 1); }
      catch { reject(noteError('STORAGE', '메모 저장소를 열지 못했습니다.')); return; }
      request.onupgradeneeded = () => { request.result.createObjectStore('state', {keyPath: 'key'}); };
      request.onerror = () => { settled = true; reject(noteError('STORAGE', '메모 저장소를 열지 못했습니다.')); };
      request.onblocked = () => { settled = true; reject(noteError('STORAGE', '다른 메모 창을 닫은 뒤 다시 열어 주세요.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled || closed) { db.close(); reject(noteError('CLOSED', '메모 저장소가 닫혔습니다.')); return; }
        database = db;
        db.onversionchange = () => { db.close(); closed = true; };
        resolve(db);
      };
    });
    return opening;
  }
  async function transact(operation) {
    const db = await open();
    if (closed) throw noteError('CLOSED', '메모 저장소가 닫혔습니다.');
    return new Promise((resolve, reject) => {
      let result, failure;
      // IndexedDB readwrite transactions serialize across all tools-page tabs.
      let tx;
      try { tx = db.transaction('state', operation ? 'readwrite' : 'readonly'); }
      catch { reject(noteError('STORAGE', '메모 저장소에 접근하지 못했습니다. 도구 페이지를 다시 열어 주세요.')); return; }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || noteError('STORAGE', '메모를 저장하지 못했습니다. 저장 공간을 확인해 주세요.'));
      tx.onerror = () => { /* onabort is the authoritative unsuccessful outcome. */ };
      let store, request;
      try { store = tx.objectStore('state'); request = store.get('notes'); }
      catch { failure = noteError('STORAGE', '메모 저장소를 읽지 못했습니다.'); tx.abort(); return; }
      request.onsuccess = () => {
        try {
          const row = request.result;
          if (row !== undefined && (!row || typeof row !== 'object' || row.schemaVersion !== 1)) throw noteError('INVALID', '지원하지 않는 메모 저장 형식입니다.');
          const notes = validateNotes(row === undefined ? [] : row.notes);
          if (!operation) { result = notes; return; }
          const next = applyNoteOperation(notes, operation, {now, uuid});
          store.put({key: 'notes', schemaVersion: 1, notes: next.notes});
          result = next.result;
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }
  return {
    async list(sourceKey) {
      if (sourceKey !== undefined && (typeof sourceKey !== 'string' || !/^chzzk:vod:\d{1,32}$/.test(sourceKey))) {
        throw noteError('INVALID', '다시보기 식별자가 올바르지 않습니다.');
      }
      return (await transact()).filter(note => sourceKey === undefined || note.source.sourceKey === sourceKey)
        .sort((a, b) => a.positionMs - b.positionMs || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    },
    add: value => transact({type: 'add', source: value?.source, positionMs: value?.positionMs, text: value?.text}),
    update: (id, value) => transact({type: 'update', id, text: value?.text, positionMs: value?.positionMs, expectedRevision: value?.expectedRevision}),
    remove: (id, expectedRevision) => transact({type: 'remove', id, expectedRevision}),
    close() { closed = true; database?.close(); },
  };
}
