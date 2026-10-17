import {createPowerCoordinator,safePowerError} from '../src/background/power-coordinator.js';
import {createPagePowerOwner} from '../src/shared/power-page-owner.js';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
export const simChannel='a'.repeat(32);
export const flushRuntime=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>{const t=new MessageChannel();t.port1.onmessage=()=>{t.port1.close();t.port2.close();resolve()};t.port2.postMessage(null)})};
export function memoryStore(){let data={};return {get:async key=>structuredClone(key?{[key]:data[key]}:data),set:async patch=>{data={...data,...structuredClone(patch)}},snapshot:()=>structuredClone(data)}}
export function memoryLocks(){const held=new Set(),queues=new Map();return {request(name,options,callback){if(typeof options==='function'){callback=options;options={}}return new Promise((resolve,reject)=>{
 let started=false;const abort=()=>{if(!started)reject(new DOMException('Stopped','AbortError'))};options.signal?.addEventListener('abort',abort,{once:true});
 const run=()=>{if(options.signal?.aborted){abort();queues.get(name)?.shift()?.();return}started=true;held.add(name);options.signal?.removeEventListener('abort',abort);Promise.resolve().then(callback).then(resolve,reject).finally(()=>{held.delete(name);queues.get(name)?.shift()?.()})};
 if(held.has(name)){if(!queues.has(name))queues.set(name,[]);queues.get(name).push(run)}else run();
 })}}}
export function createRuntimeSimulation({mode='ok',onState=()=>{}}={}){
 let identity='test_account_1',now=100000,timer=0,epoch=0,networkCount=0;
 const local=memoryStore(),session=memoryStore(),locks=memoryLocks(),calls=[],states=[],timers=new Map(),agents=new Map();
 const clock={now:()=>now,schedule(fn,delay){timers.set(++timer,{fn,at:now+delay});return timer},cancel:id=>timers.delete(id)};
 let gate=true,condition=mode,inFlight=0;
 const fetcher=async(url,options)=>{
  const kind=url.includes('getUserStatus')?'account':options.method==='PUT'?'claim':'balance';calls.push({kind,method:options.method});
  if(kind==='account')return new Response(JSON.stringify({code:200,content:{loggedIn:true,userIdHash:identity}}));
  if(kind==='claim'){
   if(condition==='403')return new Response(null,{status:403});
   if(condition==='uncertain')throw Object.assign(new Error('simulated lost PUT response'),{name:'TimeoutError'});
   return new Response(null,{status:204});
  }
  if(condition==='get-once'){condition='ok';return new Response(null,{status:503})}
  if(condition==='429-once'){condition='ok';return new Response(null,{status:429,headers:{'Retry-After':'120'}})}
  if(condition==='preflight403'&&++networkCount===2)return new Response(null,{status:403});
  // Adversarial server repeats the same eligible reward even after success/lost PUT.
  return new Response(JSON.stringify({code:200,content:{active:true,amount:100,claims:[{claimId:'persistent-one',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:20}]}}));
 };
 const chromeApi={runtime:{id:'sim-extension'},storage:{local,session},tabs:{sendMessage:async(tabId,message,options)=>{const agent=agents.get(`${tabId}:${options.documentId}`);if(!agent)throw new Error('document gone');return agent(message)}}};
 const coordinator=createPowerCoordinator({chromeApi,locks,now:clock.now,uuid:()=>`epoch-${++epoch}`});
 const owners=[];
 function createOwner({tabId=1,documentId='document-1',channelId=simChannel,notify=onState}={}){
  const agent=createPagePowerAgent({isPlaying:()=>gate,fetcher});
  const sender={id:chromeApi.runtime.id,frameId:0,tab:{id:tabId},documentId,url:`https://chzzk.naver.com/live/${channelId}`};
  const send=async message=>{inFlight++;try{const result=await coordinator.handle(message,sender);if(condition==='lost-start'&&message.action==='start'){condition='ok';throw new Error('모의 시작 응답 유실')}return {ok:true,result}}catch(error){return {ok:false,error:safePowerError(error)}}finally{inFlight--}};
  const owner=createPagePowerOwner({send,getChannelId:()=>channelId,onState:s=>{states.push(s);notify(s)},...clock});agents.set(`${tabId}:${documentId}`,message=>{if(message.type==='cheesemoa-owner-state'){owner.deactivate(message.epoch);return Promise.resolve({})}return agent(message)});owners.push(owner);return owner;
 }
 const owner=createOwner();
 const settle=async()=>{for(let i=0;i<200;i++){await flushRuntime();if(inFlight===0&&!(["checking","connecting"].includes(states.at(-1)?.status)))return}throw new Error("Runtime did not settle")};
 return {owner,createOwner,local,session,locks,calls,states,fetcher,chromeApi,coordinator,agents,flush:settle,
  async advance(){await flushRuntime();const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next)throw new Error('no scheduled work');timers.delete(next[0]);now=next[1].at;next[1].fn();await settle()},
  timers,mode:v=>condition=v,identity:v=>identity=v,playing:v=>gate=v,dispose(){owners.forEach(o=>o.suspend())}};
}
