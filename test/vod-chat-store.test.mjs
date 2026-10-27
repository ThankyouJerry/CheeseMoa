import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatStore,validateChatJob,CHAT_DB_NAME} from '../src/vod/chat-store.js';
import {parseVodSource} from '../src/vod/source.js';
const job=()=>({id:'job-1',schemaVersion:1,source:parseVodSource('https://chzzk.naver.com/video/123'),status:'paused',quality:'boundary-unverified',count:0,bytes:0,startMs:0,endMs:null,cursorMs:0,pages:0,requests:0,emptyPages:0,activeMs:0,createdAt:1,updatedAt:1,boundary:{},revision:1,chunks:0});
test('stored checkpoint validation rejects corrupt IDs, status, range, counters and revisions',()=>{
  assert.equal(validateChatJob(job(),true).cursorMs,0);
  for(const patch of [{id:''},{schemaVersion:2},{status:'unknown'},{quality:'complete'},{count:-1},{bytes:NaN},{requests:Infinity},{pages:0.5},{startMs:2,cursorMs:1},{endMs:0},{endMs:-1},{revision:0},{chunks:1},{retryAt:-1},{errorCode:20},{boundary:[]},{boundary:null},{boundary:{bad:1}},{boundary:{['a'.repeat(64)]:1}}])
    assert.throws(()=>validateChatJob({...job(),...patch},true),{code:'STORAGE_SCHEMA'});
  for(const key of ['revision','chunks']){const corrupt=job();delete corrupt[key];assert.throws(()=>validateChatJob(corrupt,true),{code:'STORAGE_SCHEMA'});}
  assert.throws(()=>validateChatJob({...job(),source:{...job().source,videoId:'456'}},true),{code:'STORAGE_SCHEMA'});
});
test('checkpoint metadata has a byte cap so same-ms boundaries cannot grow without bound',()=>{
  const boundary=Object.fromEntries(Array.from({length:16000},(_,i)=>[i.toString(16).padStart(64,'0'),1]));
  assert.throws(()=>validateChatJob({...job(),boundary,count:16000}),{code:'CHECKPOINT_LIMIT',partial:true});
});
test('bad cache limits, absent IndexedDB and invalid commit rows fail explicitly',async()=>{
  for(const maxCacheBytes of [-1,NaN,Infinity,1.2])assert.throws(()=>createChatStore({maxCacheBytes}));
  const unavailable=createChatStore({indexedDB:null});await assert.rejects(unavailable.list(),{code:'STORAGE'});
  const neverOpen=createChatStore({indexedDB:{open(){assert.fail('invalid rows must fail before opening database');}}});
  for(const row of [{elapsedMs:-1,nickname:'n',message:'m'},{elapsedMs:0,nickname:null,message:'m'},{elapsedMs:0,nickname:'n',message:42},{elapsedMs:0,nickname:'n',message:'m',messageId:''}])
    await assert.rejects(neverOpen.commit(job(),[row]),{code:'STORAGE_SCHEMA'});
  await assert.rejects(neverOpen.commit({...job(),startMs:10,cursorMs:10},[{elapsedMs:9,nickname:'n',message:'m'}]),{code:'STORAGE_SCHEMA'});
  await assert.rejects(neverOpen.commit(job(),[{elapsedMs:0,nickname:'n',message:'가'.repeat(30000)}]),{code:'ROW_LIMIT'});
});
function openFixture(){
  const requests=[];let reads=0,closed=0;
  const db={close(){closed++;},transaction(){const tx={};const request={result:[]};tx.objectStore=()=>({getAll(){reads++;queueMicrotask(()=>tx.oncomplete());return request;}});return tx;}};
  const indexedDB={open(name,version){assert.equal(name,CHAT_DB_NAME);assert.equal(version,1);const request={result:db};requests.push(request);return request;}};
  return {requests,db,indexedDB,get reads(){return reads;},get closed(){return closed;}};
}
test('blocked opening rejects and closes an eventual successful handle without clobbering newer connection',async()=>{
  const fixture=openFixture(),store=createChatStore({indexedDB:fixture.indexedDB});
  const first=store.list();fixture.requests[0].onblocked();await assert.rejects(first,{code:'STORAGE'});
  const next=store.list();fixture.requests[1].onsuccess();assert.deepEqual(await next,[]);
  fixture.requests[0].onsuccess();assert.equal(fixture.closed,1);
  assert.deepEqual(await store.list(),[]);assert.equal(fixture.requests.length,2);assert.equal(fixture.reads,2);
});
test('version change closes connection and future reads reopen safely',async()=>{
  const fixture=openFixture(),store=createChatStore({indexedDB:fixture.indexedDB});const first=store.list();fixture.requests[0].onsuccess();await first;
  fixture.db.onversionchange();assert.equal(fixture.closed,1);const second=store.list();fixture.requests[1].onsuccess();await second;assert.equal(fixture.requests.length,2);
});
test('synchronous and asynchronous opening failures permit a later retry',async()=>{
  let opens=0;const fixture=openFixture();const store=createChatStore({indexedDB:{open(...args){if(++opens===1)throw new Error('temporarily unavailable');return fixture.indexedDB.open(...args);}}});
  await assert.rejects(store.list(),/temporarily unavailable/);
  const second=store.list();fixture.requests[0].error=new Error('disk');fixture.requests[0].onerror();await assert.rejects(second,/disk/);
  const third=store.list();fixture.requests[1].onsuccess();assert.deepEqual(await third,[]);assert.equal(opens,3);
});
