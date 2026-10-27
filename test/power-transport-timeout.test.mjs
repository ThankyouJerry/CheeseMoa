import test from 'node:test';
import assert from 'node:assert/strict';
import {createPowerTransport} from '../src/shared/power-transport.js';
import {readLogPower,requestPowerMutation} from '../src/shared/log-power.js';
const channel='a'.repeat(32),base=`https://api.chzzk.naver.com/service/v1/channels/${channel}/log-power`;
const host='https://chzzk.naver.com/lives#cheesemoa-multiview';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture({hangProbe=false,hangQuery=false}={}){
 let next=0;const timers=new Map(),calls=[];
 const chromeApi={tabs:{query:()=>hangQuery?new Promise(()=>{}):Promise.resolve([{id:1,url:host}]),sendMessage:(id,m)=>{
  calls.push(m);if(m.type.endsWith('probe')&&!hangProbe)return Promise.resolve({build:'power-20261011.7',playing:true});return new Promise(()=>{});
 }}};
 const t=createPowerTransport({chromeApi,getChannelId:()=>channel,schedule:fn=>{timers.set(++next,fn);return next},cancel:id=>timers.delete(id)});
 const expire=()=>{assert.equal(timers.size,1,'one bounded pending bridge operation');[...timers.values()][0]()};
 return {t,calls,expire,timers};
}
test('hung tab enumeration settles as a recoverable GET without dispatching network work',async()=>{
 const f=fixture({hangQuery:true});const result=readLogPower(channel,f.t.fetcher);const rejected=assert.rejects(result,e=>e.code==='POWER_HOST_REQUIRED'&&e.retryable);
 await tick();f.expire();await rejected;assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
});
test('hung readiness probe cannot leave session running forever',async()=>{
 const f=fixture({hangProbe:true});const result=readLogPower(channel,f.t.fetcher);const rejected=assert.rejects(result,e=>e.code==='POWER_HOST_REQUIRED'&&e.hostReason==='unavailable'&&e.retryable);
 await tick();f.expire();await rejected;assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
test('hung GET response is a timeout and sends only one GET',async()=>{
 const f=fixture();const result=readLogPower(channel,f.t.fetcher);const rejected=assert.rejects(result,e=>e.name==='TimeoutError'&&e.method==='GET'&&e.retryable);
 await tick();f.expire();await rejected;assert.equal(f.calls.filter(m=>m.type.endsWith('request')).length,1);assert.equal(f.timers.size,0);
});
test('hung PUT remains unconfirmed/nonretryable and is dispatched once',async()=>{
 const f=fixture();const result=requestPowerMutation(base+'/claims/new',f.t.fetcher);const rejected=assert.rejects(result,e=>e.name==='TimeoutError'&&e.method==='PUT'&&!e.retryable);
 await tick();f.expire();await rejected;assert.equal(f.calls.filter(m=>m.kind==='claim').length,1);assert.equal(f.timers.size,0);
});
test('late PUT success after bridge timeout stays unconfirmed and cannot be sent twice',async()=>{
 const {createPowerCollector}=await import('../src/shared/power-collector.js');
 let state,lateReply,timerId=0;const timers=new Map(),requests=[];
 const content={active:true,amount:42,claims:[{claimId:'new',claimType:'WATCH_5_MIN',state:'COMPLIED',saveType:'ACTIVE',amount:10}]};
 const chromeApi={tabs:{query:async()=>[{id:1,url:host}],sendMessage:async(id,m)=>{
  if(m.type.endsWith('probe'))return {build:'power-20261011.7',playing:true};
  requests.push(m);
  if(m.kind==='claim')return new Promise(resolve=>lateReply=resolve);
  return {build:'power-20261011.7',status:200,body:JSON.stringify({code:200,content})};
 }}};
 const transport=createPowerTransport({chromeApi,getChannelId:()=>channel,schedule:fn=>{timers.set(++timerId,fn);return timerId},cancel:id=>timers.delete(id)});
 const storage={get:async key=>({[key]:state?structuredClone(state):undefined}),set:async value=>{state=structuredClone(Object.values(value)[0])}};
 const collector=createPowerCollector({storage,locks:{request:async(name,options,fn)=>(fn||options)()},fetcher:transport.fetcher});
 const options={enabled:true,accountId:'b'.repeat(64)};
 const collected=collector.collect(channel,options);const failure=assert.rejects(collected,e=>e.name==='TimeoutError'&&e.method==='PUT');
 await tick();assert.equal(typeof lateReply,'function');assert.equal(timers.size,1);[...timers.values()][0]();await failure;
 assert.equal(state.attempts[0].status,'unconfirmed');assert.equal(state.receipts.length,0);
 lateReply({build:'power-20261011.7',status:204,body:''});await tick();
 assert.equal(state.receipts.length,0);
 const again=await collector.collect(channel,options);assert.equal(again.blocked,1);
 assert.equal(requests.filter(m=>m.kind==='claim').length,1);assert.equal(state.attempts[0].status,'unconfirmed');
});
