import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatController} from '../src/vod/chat-job.js';
import {ChatError,abortableWait} from '../src/vod/chat-api.js';
import {validateChatJob} from '../src/vod/chat-store.js';
const source='https://chzzk.naver.com/video/00123';
const chat=(time,message='반복',id)=>({playerMessageTime:time,content:message,profile:{nickname:'이름'},...(id===undefined?{}:{messageId:id})});
const response=rows=>new Response(JSON.stringify({code:200,content:{videoChats:rows}}));
const bytes=rows=>new TextEncoder().encode(rows.map(r=>JSON.stringify(r)).join('')).length;
function memoryStore(){
  const jobs=new Map(),logs=new Map();
  return {jobs,logs,failRows:false,failAll:false,
    async get(id){return structuredClone(jobs.get(id));},async list(){return structuredClone([...jobs.values()]);},
    async commit(job,rows=[],revision=null){
      if(this.failAll||(this.failRows&&rows.length))throw new DOMException('quota','QuotaExceededError');
      const old=jobs.get(job.id);if((old?.revision??null)!==revision)throw new ChatError('CONFLICT','conflict');
      assert.equal(job.count,(old?.count||0)+rows.length);assert.equal(job.bytes,(old?.bytes||0)+bytes(rows));
      const next={...structuredClone(job),revision:(old?.revision||0)+1,chunks:(old?.chunks||0)+(rows.length?1:0)};validateChatJob(next);
      jobs.set(job.id,next);logs.set(job.id,[...(logs.get(job.id)||[]),...structuredClone(rows)]);return structuredClone(next);
    },async *rows(id){yield structuredClone(logs.get(id)||[]);},async delete(id){jobs.delete(id);logs.delete(id);}
  };
}
function webLocks(){let held=false;return {async request(name,options,callback){assert.equal(name,'cheesemoa.vod-chat.collector');assert.equal(options.ifAvailable,true);if(held)return callback(null);held=true;try{return await callback({name});}finally{held=false;}}};}
function harness(pages=[],options={}){
  const store=options.store||memoryStore(),locks=options.locks||webLocks(),calls=[];
  const controller=createChatController({store,locks,wait:async(ms,signal)=>{if(signal?.aborted)throw new DOMException('stop','AbortError');},uuid:()=>`job-${store.jobs.size+1}`,
    fetcher:async(url)=>{calls.push(Number(new URL(url).searchParams.get('playerMessageTime')));const value=pages.shift();if(value instanceof Response)return value;if(value instanceof Error)throw value;return response(value||[]);},...options});
  return {controller,store,locks,calls};
}
test('range is half-open and exact ms, source and unverified coverage survive collection',async()=>{
  const {controller,store,calls}=harness([[chat(9),chat(10),chat(19),chat(20),chat(21)]]);
  const job=await controller.start({source,startMs:10,endMs:20});
  assert.equal(job.status,'completed');assert.equal(job.count,2);assert.deepEqual(store.logs.get(job.id).map(r=>r.elapsedMs),[10,19]);assert.deepEqual(calls,[10]);assert.equal(job.quality,'boundary-unverified');
});
test('same-ms identical real rows are preserved; exact boundary replay is idempotent and stops partial',async()=>{
  const rows=[chat(0),chat(1),chat(1)];const {controller,store,calls}=harness([rows,rows]);
  const job=await controller.start({source});assert.equal(job.status,'partial');assert.equal(job.errorCode,'BOUNDARY');assert.equal(job.count,3);assert.equal(store.logs.get(job.id).length,3);assert.deepEqual(calls,[0,1]);
});
test('overlap multiset accepts additional identical occurrences once and advances without +1',async()=>{
  const {controller,store,calls}=harness([[chat(0),chat(1),chat(1)],[chat(1),chat(1),chat(1),chat(2)],[chat(2),chat(3)]]);
  const job=await controller.start({source,endMs:3});assert.equal(job.status,'completed');assert.equal(job.count,5);assert.deepEqual(store.logs.get(job.id).map(r=>r.elapsedMs),[0,1,1,1,2]);assert.deepEqual(calls,[0,1,2]);
});
test('same-cursor subsets cannot erase earlier occurrence checkpoints and duplicate on a later page',async()=>{
  const {controller,store}=harness([[chat(1,'a'),chat(1,'b')],[chat(1,'b'),chat(1,'c')],[chat(1,'a'),chat(1,'b'),chat(1,'c')]]);
  const job=await controller.start({source});assert.equal(job.status,'partial');assert.deepEqual(store.logs.get(job.id).map(r=>r.message),['a','b','c']);
});
test('stable message IDs dedupe within/across pages while nickname and body repetition with different IDs survives',async()=>{
  const {controller,store}=harness([[chat(0,'x','1'),chat(0,'x','1'),chat(1,'x','2')],[chat(1,'x','2'),chat(2,'x','1'),chat(3,'x','3'),chat(4,'end')]]);
  const job=await controller.start({source,endMs:4});assert.equal(job.count,3);assert.deepEqual(store.logs.get(job.id).map(r=>r.messageId),['1','2','3']);
});
test('pause returns last committed checkpoint; resume replays safely and rebuilds stable-ID dedupe',async()=>{
  let control,paused=false;const h=harness([[chat(0,'x','1'),chat(1,'x','2')]],{onUpdate:job=>{if(job.count===2&&!paused){paused=true;void control.pause();}}});control=h.controller;
  const first=await control.start({source,endMs:4});assert.equal(first.status,'paused');assert.equal(first.cursorMs,1);
  const resumed=harness([[chat(1,'x','2'),chat(2,'x','1'),chat(3,'x','3'),chat(4,'end')]],{store:h.store,locks:h.locks});
  const last=await resumed.controller.resume(first.id);assert.equal(last.status,'completed');assert.equal(last.count,3);assert.equal(last.requests,2);assert.deepEqual(h.store.logs.get(first.id).map(r=>r.messageId),['1','2','3']);
});
test('quota failure rolls back cursor/rows and leaves prior log exportable; resume retries failed page',async()=>{
  const store=memoryStore();let injected=false;
  const first=harness([[chat(0),chat(1)],[chat(1),chat(2),chat(3)]],{store,onUpdate:job=>{if(job.count===2&&!injected){injected=true;store.failRows=true;}}});
  const failed=await first.controller.start({source,endMs:3});assert.equal(failed.status,'failed');assert.equal(failed.count,2);assert.equal(failed.cursorMs,1);assert.equal((await first.controller.exportParts(failed.id)).length,1);
  store.failRows=false;const next=harness([[chat(1),chat(2),chat(3)]],{store});
  const completed=await next.controller.resume(failed.id);assert.equal(completed.status,'completed');assert.equal(completed.count,3);assert.deepEqual(next.calls,[1]);
});
test('lost status-write leaves durable checkpoint intact and is recovered paused without network',async()=>{
  const store=memoryStore();const h=harness([[chat(0),chat(1)]],{store,onUpdate:job=>{if(job.count===2)store.failAll=true;}});
  const result=await h.controller.start({source});assert.equal(result.status,'failed');assert.equal(store.jobs.get(result.id).status,'running');assert.equal(store.jobs.get(result.id).count,2);
  store.failAll=false;const restored=harness([],{store,fetcher:async()=>assert.fail('restore must not fetch')});const jobs=await restored.controller.listJobs();assert.equal(jobs[0].status,'paused');assert.equal(jobs[0].count,2);
});
test('HTTP errors and descending/backward pages do not masquerade as successful EOF',async()=>{
  for(const [pages,code,status] of [[[new Response('',{status:404})],'HTTP','failed'],[[[chat(2),chat(1)]],'SCHEMA','failed'],[[[chat(2)],[chat(1)]],'CURSOR','partial']]){
    const {controller}=harness(pages);const job=await controller.start({source});assert.equal(job.status,status);assert.equal(job.errorCode,code);
  }
});
test('empty EOF requires three successful pages and keeps unverified quality',async()=>{
  const {controller,calls}=harness();const job=await controller.start({source});assert.equal(job.status,'completed');assert.equal(job.count,0);assert.equal(job.pages,3);assert.equal(calls.length,3);assert.equal(job.quality,'boundary-unverified');
});
test('request/page/row/byte budgets stop partial without committing an oversized page',async()=>{
  for(const limits of [{maxRequests:1},{maxPages:1},{maxRows:1},{maxBytes:1}]){
    const {controller,store,calls}=harness([[chat(1),chat(2)],[chat(2),chat(3)]],{limits});const job=await controller.start({source});
    assert.equal(job.status,'partial');assert.equal(calls.length,1);assert.equal(job.count,limits.maxRows||limits.maxBytes?0:2);assert.equal(store.logs.get(job.id).length,job.count);
  }
});
test('requests include retries and retry budget cannot bypass lifetime request cap',async()=>{
  const {controller,calls}=harness([new Response('',{status:500}),new Response('',{status:500})],{limits:{maxRequests:2}});
  const job=await controller.start({source});assert.equal(job.status,'partial');assert.equal(job.errorCode,'BUDGET');assert.equal(job.requests,2);assert.equal(calls.length,2);
});
test('active time deadline cancels a pending fetch and a retry wait before their longer timeout',async()=>{
  for(const fetcher of [()=>new Promise(()=>{}),async()=>new Response('',{status:500})]){
    const {controller}=harness([],{fetcher,wait:abortableWait,limits:{maxActiveMs:15,timeoutMs:1000}});
    const job=await controller.start({source});assert.equal(job.status,'partial');assert.equal(job.errorCode,'BUDGET');assert.equal(job.requests,1);
  }
});
test('cross-controller global lock rejects collection/deletion/export; list does not pause live owner',async()=>{
  const store=memoryStore(),locks=webLocks();let started;const ready=new Promise(r=>started=r);
  const one=harness([],{store,locks,fetcher:()=>{started();return new Promise(()=>{});}});
  const work=one.controller.start({source});await ready;
  const two=harness([],{store,locks});const job=(await two.controller.listJobs())[0];assert.equal(job.status,'running');
  for(const action of [()=>two.controller.start({source}),()=>two.controller.resume(job.id),()=>two.controller.deleteJob(job.id),()=>two.controller.exportParts(job.id)])await assert.rejects(action(),{code:'BUSY'});
  assert.equal((await one.controller.pause()).status,'paused');await work;assert.equal((await two.controller.listJobs())[0].status,'paused');
});
test('cancelled late response cannot write after the lock has passed to a new controller',async()=>{
  const store=memoryStore(),locks=webLocks();let resolveFetch,started;const ready=new Promise(r=>started=r);
  const first=harness([],{store,locks,fetcher:()=>new Promise(resolve=>{resolveFetch=resolve;started();})});const work=first.controller.start({source});await ready;
  const paused=await first.controller.pause();await work;
  const next=harness([[chat(0),chat(1)]],{store,locks,limits:{maxPages:1}});const final=await next.controller.resume(paused.id);
  const revision=final.revision;resolveFetch(response([chat(99)]));await new Promise(r=>setImmediate(r));
  assert.equal(store.jobs.get(final.id).revision,revision);assert.equal(store.jobs.get(final.id).cursorMs,1);assert.equal(store.logs.get(final.id).length,2);
});
test('rate wait persists retryAt and blocks premature resume without extra network',async()=>{
  const h=harness([new Response('',{status:429,headers:{'Retry-After':'120'}})],{now:()=>100});
  const job=await h.controller.start({source});assert.equal(job.status,'paused');assert.equal(job.retryAt,120100);
  await assert.rejects(h.controller.resume(job.id),{code:'RATE_WAIT'});assert.equal(h.calls.length,1);
});
test('invalid stored checkpoint, completed jobs, missing locks and bad ranges fail before network',async()=>{
  const h=harness();const completed=await h.controller.start({source});await assert.rejects(h.controller.resume(completed.id),{code:'COMPLETE'});
  h.store.jobs.get(completed.id).count=-1;await assert.rejects(h.controller.resume(completed.id),{code:'STORAGE_SCHEMA'});
  await assert.rejects(h.controller.start({source,startMs:2,endMs:2}),{code:'RANGE'});
  const unlocked=harness([],{locks:{}});await assert.rejects(unlocked.controller.start({source}),{code:'LOCK_UNAVAILABLE'});assert.equal(unlocked.calls.length,0);
});
test('stopped chat deletion affects only chosen job and observer failure cannot break collection',async()=>{
  const h=harness([],{onUpdate:()=>{throw new Error('UI');}});const a=await h.controller.start({source}),b=await h.controller.start({source});
  await h.controller.deleteJob(a.id);assert.equal(h.store.jobs.has(a.id),false);assert.equal(h.store.jobs.has(b.id),true);assert.equal(await h.controller.pause(),null);
});
