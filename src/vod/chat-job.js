import {requireVodSource} from './source.js';
import {requireTimeMs} from './time.js';
import {createChatApi, ChatError, abortError, abortableWait} from './chat-api.js';
import {createChatStore, validateChatJob} from './chat-store.js';
import {createCsvParts} from './chat-csv.js';

export const CHAT_LIMITS = Object.freeze({maxBytes:32*1024*1024,maxRows:250000,maxPages:10000,
  maxRequests:12000,maxActiveMs:2*60*60*1000,pageDelayMs:300,timeoutMs:15000,responseBytes:4*1024*1024,maxRowBytes:65536});
const LOCK='cheesemoa.vod-chat.collector', encoder=new TextEncoder();
const coverage='API 페이지 경계의 완전성은 확인되지 않았습니다.';
async function fingerprint(row) {
  const value=row.messageId ? ['id',row.messageId] : ['row',row.elapsedMs,row.nickname,row.message];
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

// UI facade: document lifetime owns the network. All persistence is scoped to chat-store.
export function createChatController({onUpdate=()=>{},fetcher=globalThis.fetch,store=createChatStore(),
  locks=globalThis.navigator?.locks,limits={},now=Date.now,wait=abortableWait,uuid=()=>crypto.randomUUID()}={}) {
  const bound={...CHAT_LIMITS,...limits};
  for(const [key,value] of Object.entries(bound))if(!Number.isSafeInteger(value)||value<0)throw new Error(`Invalid chat limit: ${key}`);
  const api=createChatApi({fetcher,timeoutMs:bound.timeoutMs,responseBytes:bound.responseBytes,maxRowBytes:bound.maxRowBytes,now,wait});
  let active=null;
  const emit=job=>{try{onUpdate(structuredClone(job));}catch{/* UI callbacks cannot invalidate persisted state. */}};
  async function exclusive(work) {
    if(!locks?.request)throw new ChatError('LOCK_UNAVAILABLE','안전한 동시 작업 잠금을 사용할 수 없습니다.');
    return locks.request(LOCK,{ifAvailable:true},lock=>{
      if(!lock)throw new ChatError('BUSY','다른 창에서 채팅 작업을 처리하고 있습니다.');
      return work();
    });
  }
  async function run(id,input,parentSignal) {
    let job;
    if(input){
      const source=requireVodSource(input.source),startMs=requireTimeMs(input.startMs??0);
      const endMs=input.endMs==null?null:requireTimeMs(input.endMs);
      if(endMs!==null&&endMs<=startMs)throw new ChatError('RANGE','종료 시각은 시작 시각보다 뒤여야 합니다.');
      job=await store.commit({id,source,schemaVersion:1,status:'running',count:0,bytes:0,startMs,endMs,
        cursorMs:startMs,boundary:{},pages:0,requests:0,emptyPages:0,activeMs:0,createdAt:now(),updatedAt:now(),
        quality:'boundary-unverified',detail:`공개 VOD 채팅을 수집합니다. ${coverage}`,retention:'사용자가 삭제할 때까지 로컬 보관'},[],null);
    }else{
      job=await store.get(id);
      if(!job)throw new ChatError('MISSING','채팅 작업을 찾을 수 없습니다.');
      validateChatJob(job,true);
      if(job.status==='completed')throw new ChatError('COMPLETE','종료된 작업입니다. 새 작업을 시작해 주세요.');
      if(job.retryAt>now())throw new ChatError('RATE_WAIT','서버 대기 시간이 남아 있습니다. 나중에 재개해 주세요.');
      job=await store.commit({...job,status:'running',errorCode:'',retryAt:null,detail:`체크포인트에서 다시 수집합니다. ${coverage}`,updatedAt:now()},[],job.revision);
    }
    emit(job);
    const began=now(),previousActive=job.activeMs;
    const elapsed=()=>previousActive+Math.max(0,now()-began);
    const controller=new AbortController(),signal=controller.signal;
    let expired=false;
    const stop=()=>controller.abort();
    parentSignal.addEventListener('abort',stop,{once:true});
    if(parentSignal.aborted)stop();
    const deadline=setTimeout(()=>{expired=true;controller.abort();},Math.min(2147483647,Math.max(0,bound.maxActiveMs-previousActive)));
    async function save(patch={},rows=[]) {
      if(signal.aborted&&(patch.status===undefined||patch.status==='running'||patch.status==='completed'))throw abortError();
      job=await store.commit({...job,...patch,activeMs:elapsed(),updatedAt:now()},rows,job.revision);
      emit(job);return job;
    }
    function budget(){
      if(signal.aborted)throw abortError();
      if(job.requests>=bound.maxRequests||job.pages>=bound.maxPages||elapsed()>=bound.maxActiveMs)
        throw new ChatError('BUDGET','요청·페이지·실행 시간 한도에 도달했습니다.',{partial:true});
    }
    try {
      // Stable IDs can be safely deduplicated across pages and resumed documents.
      // The set is bounded by the stored row/byte limits; no chat text is retained here.
      const messageIds=new Set();
      if(job.count)for await(const batch of store.rows(job.id))for(const row of batch){
        budget();if(row.messageId)messageIds.add(await fingerprint(row));
      }
      while(true){
        budget();
        const rows=await api.page(job.source,job.cursorMs,{signal,onAttempt:async()=>{
          budget();await save({requests:job.requests+1,status:'running'});
        }});
        if(signal.aborted)throw abortError();
        budgetAfterResponse();
        if(!rows.length){
          const emptyPages=job.emptyPages+1;
          if(emptyPages>=3)return await save({emptyPages,pages:job.pages+1,status:'completed',detail:`빈 응답 3회로 수집을 종료했습니다. 0건 또는 누락 여부는 API에 따라 달라집니다. ${coverage}`});
          await save({emptyPages,pages:job.pages+1});await wait(bound.pageDelayMs,signal);continue;
        }
        const maxTime=rows.at(-1).elapsedMs;
        if(maxTime<job.cursorMs)throw new ChatError('CURSOR','서버 시각이 이전으로 이동하여 부분 결과로 멈췄습니다.',{partial:true});
        const seen={},nextBoundary=maxTime===job.cursorMs?{...job.boundary}:{},accepted=[];let bytes=0,hitEnd=false;
        for(const row of rows){
          if(signal.aborted)throw abortError();
          const key=await fingerprint(row);
          // Preserve repeated identical messages without IDs; suppress only replayed occurrences.
          const occurrence=(seen[key]||0)+1;seen[key]=occurrence;
          if(row.elapsedMs===maxTime)nextBoundary[key]=row.messageId?1:Math.max(occurrence,maxTime===job.cursorMs?(job.boundary[key]||0):0);
          if(row.elapsedMs<job.cursorMs||row.elapsedMs<job.startMs)continue;
          if(job.endMs!==null&&row.elapsedMs>=job.endMs){hitEnd=true;continue;}
          if(row.messageId&&messageIds.has(key))continue;
          if(row.elapsedMs===job.cursorMs&&occurrence<=(job.boundary[key]||0))continue;
          if(row.messageId)messageIds.add(key);
          bytes+=encoder.encode(JSON.stringify(row)).length;accepted.push(row);
        }
        if(job.count+accepted.length>bound.maxRows||job.bytes+bytes>bound.maxBytes)
          throw new ChatError('SIZE','행 수 또는 작업 용량 한도에 도달했습니다. 저장된 부분을 내보낼 수 있습니다.',{partial:true});
        if(!hitEnd&&maxTime===job.cursorMs&&!accepted.length)
          throw new ChatError('BOUNDARY','동일 시각의 페이지 경계가 반복되어 부분 결과로 멈췄습니다. 같은 시각의 누락 여부는 확인할 수 없습니다.',{partial:true});
        await save({count:job.count+accepted.length,bytes:job.bytes+bytes,pages:job.pages+1,emptyPages:0,
          cursorMs:maxTime,boundary:hitEnd?{}:nextBoundary,status:hitEnd?'completed':'running',
          detail:hitEnd?`요청한 종료 시각에 도달했습니다. ${coverage}`:`${job.count+accepted.length}개 저장. ${coverage}`},accepted);
        if(hitEnd)return job;
        await wait(bound.pageDelayMs,signal);
      }
    }catch(error){
      if(expired)error=new ChatError('BUDGET','실행 시간 한도에 도달했습니다.',{partial:true});
      const status=expired?'partial':signal.aborted||error.name==='AbortError'||error.code==='RATE_WAIT'?'paused':error.partial?'partial':'failed';
      const detail=status==='paused'?(error.code==='RATE_WAIT'?error.message:'수집을 중단했습니다. 마지막 저장 지점부터 재개할 수 있습니다.'):
        error instanceof ChatError?error.message:'저장 또는 수집에 실패했습니다. 마지막 저장 지점과 부분 로그를 확인해 주세요.';
      const errorCode=typeof error.code==='string'?error.code:status==='paused'?'PAUSED':'STORAGE';
      try{return await save({status,detail:`${detail} ${coverage}`,errorCode,retryAt:error.retryAt||null});}
      catch{
        // A failed transaction never advances cursor/rows. Surface interruption even if storage is unavailable.
        const failed={...job,status:'failed',detail:'상태 저장에 실패했습니다. 마지막 체크포인트는 보존됩니다. 화면을 다시 열어 확인해 주세요.'};
        emit(failed);return failed;
      }
    }finally{clearTimeout(deadline);parentSignal.removeEventListener('abort',stop);}
    function budgetAfterResponse(){
      if(elapsed()>=bound.maxActiveMs)throw new ChatError('BUDGET','실행 시간 한도에 도달했습니다.',{partial:true});
    }
  }
  function launch(id,input){
    if(active) return Promise.reject(new ChatError('BUSY','현재 수집을 먼저 중단해 주세요.'));
    const controller=new AbortController(),task={controller,promise:null};active=task;
    task.promise=exclusive(()=>run(id,input,controller.signal)).finally(()=>{if(active===task)active=null;});
    return task.promise;
  }
  return {
    async listJobs(){
      const jobs=await store.list();
      if(active||!jobs.some(j=>j.status==='running'))return jobs;
      // Recovery only while no other document holds the collection lock; never auto-resume.
      try{return await exclusive(async()=>{
        const current=await store.list();
        for(let i=0;i<current.length;i++)if(current[i].status==='running')
          current[i]=await store.commit({...current[i],status:'paused',detail:`이전 문서가 종료되었습니다. 수동으로 재개할 수 있습니다. ${coverage}`},[],current[i].revision);
        return current;
      });}catch(error){if(error.code==='BUSY')return jobs;throw error;}
    },
    start:input=>launch(uuid(),input),resume:id=>launch(id),
    async pause(){if(!active)return null;active.controller.abort();return active.promise;},
    async deleteJob(id){return exclusive(()=>store.delete(id));},
    async exportParts(id){return exclusive(async()=>{
      const job=await store.get(id);
      if(!job)throw new ChatError('MISSING','채팅 작업을 찾을 수 없습니다.');
      if(job.status==='running')throw new ChatError('BUSY','수집을 중단한 뒤 CSV를 준비해 주세요.');
      return createCsvParts(job,store.rows(id));
    });},
  };
}
