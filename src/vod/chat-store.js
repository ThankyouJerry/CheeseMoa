import {ChatError} from './chat-api.js';
import {requireVodSource} from './source.js';

export const CHAT_DB_NAME = 'cheesemoa.vod-chat';
export const CHAT_CACHE_BYTES = 96 * 1024 * 1024;
export const CHAT_CHUNK_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const sizeOf = value => encoder.encode(JSON.stringify(value)).length;
const invalid = () => new ChatError('STORAGE_SCHEMA', '저장된 채팅 작업 형식을 확인할 수 없습니다.');
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function validateChatJob(job, persisted = false) {
  if (!job || job.schemaVersion !== 1 || typeof job.id !== 'string' || !job.id.length || job.id.length > 128 ||
    !['running','paused','partial','failed','completed'].includes(job.status) || job.quality !== 'boundary-unverified') throw invalid();
  try { requireVodSource(job.source); } catch { throw invalid(); }
  for (const key of ['count','bytes','startMs','cursorMs','pages','requests','emptyPages','activeMs','createdAt','updatedAt'])
    if (!integer(job[key])) throw invalid();
  if (persisted && (!integer(job.revision) || job.revision < 1 || !integer(job.chunks))) throw invalid();
  if (job.cursorMs < job.startMs || (job.endMs !== null && (!integer(job.endMs) || job.endMs <= job.startMs)) ||
    (job.revision !== undefined && (!integer(job.revision) || job.revision < 1)) ||
    (job.chunks !== undefined && (!integer(job.chunks) || job.chunks > job.count)) ||
    (job.retryAt != null && !integer(job.retryAt)) ||
    !job.boundary || typeof job.boundary !== 'object' || Array.isArray(job.boundary)) throw invalid();
  for (const [key,value] of Object.entries(job.boundary))
    if (!/^[0-9a-f]{64}$/.test(key) || !integer(value) || value < 1 || value > job.count) throw invalid();
  for (const key of ['detail','retention','errorCode'])
    if (job[key] !== undefined && (typeof job[key] !== 'string' || job[key].length > 2048)) throw invalid();
  if (sizeOf(job) > CHAT_CHUNK_BYTES) throw new ChatError('CHECKPOINT_LIMIT', '페이지 경계 기록의 크기 한도에 도달했습니다.', {partial:true});
  return job;
}
function validateRow(row) {
  if (!row || !integer(row.elapsedMs) || typeof row.nickname !== 'string' || typeof row.message !== 'string' ||
    (row.messageId !== undefined && (typeof row.messageId !== 'string' || !row.messageId.length || row.messageId.length > 200))) throw invalid();
  if (sizeOf(row) > 65536) throw new ChatError('ROW_LIMIT', '한 채팅 행의 크기 제한에 도달했습니다.', {partial:true});
}

// Extension document only. Logical cache accounting includes checkpoint metadata;
// IndexedDB/browser overhead and actual disk quota remain browser-controlled.
export function createChatStore({indexedDB = globalThis.indexedDB, maxCacheBytes = CHAT_CACHE_BYTES} = {}) {
  if (!integer(maxCacheBytes)) throw new TypeError('Invalid chat cache limit');
  let opening;
  function database() {
    if (!indexedDB) return Promise.reject(new ChatError('STORAGE', '브라우저 채팅 저장소를 사용할 수 없습니다.'));
    if (!opening) {
      let abandoned = false;
      const pending = new Promise((resolve, reject) => {
        const request = indexedDB.open(CHAT_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('jobs', {keyPath:'id'});
          db.createObjectStore('chunks', {keyPath:['jobId','index']}).createIndex('jobId', 'jobId');
        };
        const fail = error => { abandoned = true; if (opening === pending) opening = null; reject(error); };
        request.onerror = () => fail(request.error);
        request.onblocked = () => fail(new ChatError('STORAGE', '다른 도구 창의 저장소 연결을 닫고 다시 시도해 주세요.'));
        request.onsuccess = () => {
          const db = request.result;
          if (abandoned) { db.close(); return; }
          db.onversionchange = () => { db.close(); if (opening === pending) opening = null; };
          resolve(db);
        };
      });
      opening = pending;
      // Synchronous open errors must also permit a later retry.
      pending.catch(() => { if (opening === pending) opening = null; });
    }
    return opening;
  }
  async function read(storeName, method, key) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName), request = tx.objectStore(storeName)[method](key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || request.error);
    });
  }
  async function get(id) { const job = await read('jobs', 'get', id); return job && validateChatJob(job,true); }
  return {
    list: async () => (await read('jobs', 'getAll')).map(job => validateChatJob(job,true)),
    get,
    async commit(job, rows = [], expectedRevision = null) {
      validateChatJob(job);
      if (!Array.isArray(rows)) throw invalid();
      // Partition a response into bounded chunks, then commit every chunk and its
      // cursor together. A failed put/quota check aborts the entire page.
      const chunks = []; let batch = [], batchBytes = 2, rowBytes = 0;
      for (const row of rows) {
        validateRow(row);
        if (row.elapsedMs < job.startMs || (job.endMs !== null && row.elapsedMs >= job.endMs)) throw invalid();
        const bytes = sizeOf(row); rowBytes += bytes;
        if (batchBytes + bytes + 1 > CHAT_CHUNK_BYTES) { chunks.push(batch); batch = []; batchBytes = 2; }
        batch.push(row); batchBytes += bytes + 1;
      }
      if (batch.length) chunks.push(batch);
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['jobs','chunks'], 'readwrite'), jobs = tx.objectStore('jobs');
        let failure, result;
        const stop = error => { failure = error; tx.abort(); };
        const request = jobs.getAll();
        request.onsuccess = () => {
          try {
            const all = request.result.map(job => validateChatJob(job,true)), old = all.find(j => j.id === job.id);
            if ((old?.revision ?? null) !== expectedRevision) return stop(new ChatError('CONFLICT', '다른 창에서 작업이 변경되었습니다.'));
            if (job.count !== (old?.count || 0) + rows.length || job.bytes !== (old?.bytes || 0) + rowBytes ||
              (old && (job.source.sourceKey !== old.source.sourceKey || job.startMs !== old.startMs || job.endMs !== old.endMs ||
                job.createdAt !== old.createdAt || job.cursorMs < old.cursorMs || job.pages < old.pages || job.requests < old.requests || job.activeMs < old.activeMs)))
              return stop(invalid());
            result = {...job, revision:(old?.revision || 0)+1, chunks:(old?.chunks || 0)+chunks.length};
            validateChatJob(result);
            const logicalBytes = j => j.bytes + sizeOf(j) + j.count + (j.chunks || 0) * 128;
            if (all.reduce((n,j) => n + (j.id === job.id ? 0 : logicalBytes(j)), 0) + logicalBytes(result) > maxCacheBytes)
              return stop(new ChatError('CACHE_LIMIT', '채팅 보관 한도에 도달했습니다. 이전 작업을 직접 삭제해 주세요.', {partial:true}));
            chunks.forEach((rows,index) => tx.objectStore('chunks').put({jobId:job.id, index:(old?.chunks || 0)+index, rows}));
            jobs.put(result);
          } catch (error) { stop(error); }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new ChatError('STORAGE', '채팅 저장에 실패했습니다.'));
      });
    },
    async *rows(id) {
      const job = await get(id);
      if (!job) throw new ChatError('MISSING', '채팅 작업을 찾을 수 없습니다.');
      let count = 0, bytes = 0;
      for (let index=0; index<job.chunks; index++) {
        const chunk = await read('chunks','get',[id,index]);
        if (!chunk || !Array.isArray(chunk.rows)) throw new ChatError('STORAGE', '저장된 채팅 일부를 읽을 수 없습니다.');
        for (const row of chunk.rows) { validateRow(row); count++; bytes += sizeOf(row); }
        if (count > job.count || bytes > job.bytes) throw invalid();
        yield chunk.rows;
      }
      if (count !== job.count || bytes !== job.bytes) throw invalid();
    },
    async delete(id) {
      const db = await database();
      return new Promise((resolve,reject) => {
        const tx=db.transaction(['jobs','chunks'],'readwrite');
        tx.objectStore('jobs').delete(id);
        const cursor=tx.objectStore('chunks').index('jobId').openCursor(id);
        cursor.onsuccess=()=>{const c=cursor.result;if(c){c.delete();c.continue();}};
        tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
      });
    },
  };
}
