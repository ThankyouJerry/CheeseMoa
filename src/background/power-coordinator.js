import {createPowerCollector} from '../shared/power-collector.js';
import {createPowerTransport} from '../shared/power-transport.js';
import {checkPowerAccount} from '../shared/login-session.js';
import {POWER_BUILD} from '../shared/power-build.js';
const KEY='cheesemoa.power.owner.v1';
const stopped=()=>Object.assign(new Error('자동수령 실행 주체가 변경되거나 OFF입니다.'),{code:'OWNER_STOPPED'});
export function createPowerCoordinator({chromeApi=chrome,locks=navigator.locks,now=Date.now,uuid=()=>crypto.randomUUID()}){
 const sessionStore=chromeApi.storage.session,pending=new Map();
 const read=async()=> (await sessionStore.get(KEY))[KEY]||{enabled:false};
 const save=s=>sessionStore.set({[KEY]:s});
 const owns=(s,c)=>s.tabId===c.tabId&&s.documentId===c.documentId&&s.channelId===c.channelId;
 const same=(s,c,epoch)=>s.enabled&&owns(s,c)&&s.epoch===epoch;
 const channelScope=c=>`channel:${c.channelId}`;
 const entry=(s,key)=>s.backoffs?.[key]||{retryAt:0,failures:0};
 const backoff=(s,c)=>{
  // Old unscoped deadlines are conservatively shared until they expire.
  const legacy=Object.entries(s.backoffs||{}).filter(([key])=>/^[a-f0-9]{32}$/i.test(key)).map(([,value])=>value);
  return [entry(s,'account'),entry(s,channelScope(c)),...legacy].sort((a,b)=>b.retryAt-a.retryAt||b.failures-a.failures)[0];
 };
 const cancellationKey=(c,id)=>JSON.stringify([c.tabId,c.documentId,c.channelId,id]);
 function contextFor(m,sender){
  if(sender?.id!==chromeApi.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)||typeof sender.documentId!=='string')throw new Error('UNTRUSTED_OWNER');
  const id=m.channelId;if(!/^[a-f0-9]{32}$/i.test(id||''))throw new Error('INVALID_CHANNEL');
  const url=new URL(sender.url),control=['stop','cancel-start'].includes(m.action);
  if(url.origin!=='https://chzzk.naver.com'||(!control&&!((url.pathname===`/live/${id}`&&!url.search&&!url.hash)||(url.pathname==='/lives'&&url.hash==='#cheesemoa-multiview'&&!url.search))))throw new Error('UNTRUSTED_PAGE');
  return {tabId:sender.tab.id,documentId:sender.documentId,channelId:id};
 }
 async function change(fn){return locks.request('cheesemoa.power.owner',async()=>{
  const old=await read(),next=await fn(old);
  if(next!==old){
   if(next.epoch!==old.epoch||!next.enabled)pending.get(old.epoch)?.abort();
   await save(next);
   if(old.enabled&&(!next.enabled||old.tabId!==next.tabId||old.documentId!==next.documentId))void chromeApi.tabs.sendMessage(old.tabId,{type:'cheesemoa-owner-state',epoch:old.epoch,enabled:false},{documentId:old.documentId}).catch(()=>{});
  }return next;
 })}
 function validRequest(id){if(typeof id!=='string'||id.length<8||id.length>128)throw new Error('INVALID_START_REQUEST')}
 return {removeTab:tabId=>change(s=>s.tabId===tabId?{...s,enabled:false,pendingStart:false}:s),async handle(m,sender){
  if(!sessionStore)throw new Error('SESSION_STORAGE_REQUIRED');
  const c=contextFor(m,sender);
  if(m.action==='start'){
   validRequest(m.startRequestId);
   const state=await change(s=>{
    if(s.blockNewStarts||(s.cancelledStarts||[]).includes(cancellationKey(c,m.startRequestId)))throw stopped();
    if(owns(s,c)&&s.startRequestId===m.startRequestId)return s;
    // Preparation is never restorable ON. Only a received response can be activated.
    return {...s,...c,enabled:false,pendingStart:true,startRequestId:m.startRequestId,startDocumentId:c.documentId,epoch:uuid(),accountId:null};
   });
   return {enabled:false,epoch:state.epoch,startRequestId:state.startRequestId,build:POWER_BUILD};
  }
  if(m.action==='activate'){
   validRequest(m.startRequestId);
   const s=await change(s=>{
    if(!owns(s,c)||s.epoch!==m.epoch||s.startRequestId!==m.startRequestId||!s.pendingStart||(s.cancelledStarts||[]).includes(cancellationKey(c,m.startRequestId)))throw stopped();
    return {...s,enabled:true,pendingStart:false};
   });return {enabled:true,epoch:s.epoch,...backoff(s,c)};
  }
  if(m.action==='cancel-start'){
   validRequest(m.startRequestId);
   await change(s=>{
    const matches=s.tabId===c.tabId&&s.channelId===c.channelId&&s.startRequestId===m.startRequestId&&(s.documentId===c.documentId||s.startDocumentId===c.documentId);
    const keys=new Set(s.cancelledStarts||[]);keys.add(cancellationKey(c,m.startRequestId));
    if(matches)keys.add(cancellationKey({...c,documentId:s.startDocumentId},m.startRequestId));
    // Bound memory without discarding a cancellation that could allow a delayed ON.
    return {...s,cancelledStarts:[...keys].slice(0,1024),blockNewStarts:s.blockNewStarts||keys.size>1024,...(matches?{enabled:false,pendingStart:false}:{})};
   });return {enabled:false};
  }
  if(m.action==='stop'){await change(s=>same(s,c,m.epoch)?{...s,enabled:false,pendingStart:false}:s);return {enabled:false}}
  if(m.action==='status'){
   const s=await change(s=>{
    if(s.enabled&&(typeof s.startRequestId!=='string'||s.startRequestId.length<8))return {...s,enabled:false,pendingStart:false};
    return s.enabled&&s.tabId===c.tabId&&s.channelId===c.channelId&&s.documentId!==c.documentId?{...s,documentId:c.documentId,epoch:uuid()}:s;
   });
   const own=s.enabled&&owns(s,c);
   return {enabled:!!own,otherEnabled:!!s.enabled&&!own,epoch:own?s.epoch:null,startRequestId:own?s.startRequestId:null,...backoff(s,c),build:POWER_BUILD};
  }
  const epoch=m.epoch,s=await read();if(!same(s,c,epoch))throw stopped();
  const wait=backoff(s,c);
  if(wait.retryAt>now())throw Object.assign(new Error('서버 재조회 대기시간이 남아 있습니다.'),{code:'POWER_BACKOFF',status:429,method:'GET',retryable:true,retryAfterMs:wait.retryAt-now(),...wait});
  const transport=createPowerTransport({chromeApi,getChannelId:()=>c.channelId,targetContext:c,protocol:POWER_BUILD});
  const account=async()=>{
   if(!same(await read(),c,epoch))throw stopped();
   const value=await checkPowerAccount(transport.fetcher);
   if(!value)throw Object.assign(new Error('로그인 상태가 아닙니다.'),{code:'LOGGED_OUT'});
   await change(s=>{if(!same(s,c,epoch))throw stopped();if(s.accountId&&s.accountId!==value)throw Object.assign(new Error('계정이 변경되었습니다.'),{code:'ACCOUNT_CHANGED'});return {...s,accountId:value,backoffs:{...s.backoffs,account:{retryAt:0,failures:0}}}});
   return value;
  };
  try{
   if(m.action==='account')return {accountId:await account()};
   if(m.action!=='collect')throw new Error('UNSUPPORTED_ACTION');
   if(pending.has(epoch))throw Object.assign(new Error('보상 확인이 이미 진행 중입니다.'),{code:'OWNER_BUSY'});
   const controller=new AbortController();pending.set(epoch,controller);
   try{
    const identity=await account(),collector=createPowerCollector({storage:chromeApi.storage.local,locks,fetcher:transport.fetcher,now});
    const result=await collector.collect(c.channelId,{enabled:true,accountId:identity,signal:controller.signal,
     isCurrent:async()=>{if(!same(await read(),c,epoch))return false;await account();return same(await read(),c,epoch)},
     isSameAccount:async()=>await checkPowerAccount((url,options)=>transport.fetcher(url,{...options,postMutationIdentity:true}))===identity});
    await change(s=>same(s,c,epoch)?{...s,backoffs:{...s.backoffs,[channelScope(c)]:{retryAt:0,failures:0}}}:s);
    return result;
   }finally{pending.delete(epoch)}
  }catch(error){
   // A failed local readiness probe made no HTTP request; preserve server deadlines.
   if(error.method==='GET'&&error.retryable&&error.code!=='POWER_PLAYBACK_WAIT'){
    const scope=error.requestScope==='account'?'account':channelScope(c);
    const next=await change(s=>{const previous=entry(s,scope),failures=previous.failures+1;const retryAt=Math.max(previous.retryAt,now()+Math.max(Math.min(60000*2**(failures-1),900000),error.retryAfterMs||0));return {...s,backoffs:{...s.backoffs,[scope]:{retryAt,failures}}}});
    const deadline=entry(next,scope);Object.assign(error,deadline,{retryAfterMs:Math.max(0,deadline.retryAt-now())});
   }throw error;
  }
 }};
}
export function safePowerError(error){
 const out={message:'자동수령 확인을 완료하지 못했습니다.'};
 for(const key of ['name','code','status','method','retryable','retryAfterMs','retryAt','failures','requestScope','httpStatus','applicationCode','errorCode','mutationDispatched','phase','collectionResult'])if(error[key]!==undefined)out[key]=error[key];
 if(['POWER_HOST_REQUIRED','POWER_LOCK_TIMEOUT','POWER_BACKOFF'].includes(error.code))out.message=error.message;
 return out;
}
