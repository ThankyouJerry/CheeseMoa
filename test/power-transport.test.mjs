import test from 'node:test';
import assert from 'node:assert/strict';
import {createPowerTransport} from '../src/shared/power-transport.js';
const POWER_BUILD = 'power-20261011.7';
const channel='a'.repeat(32),host='https://chzzk.naver.com/lives#cheesemoa-multiview';
test('transport accepts only current host/build/playing channel and preserves HTTP errors',async()=>{
 const calls=[];
 const chromeApi={runtime:{id:'test',onMessage:{addListener(){},removeListener(){}}},tabs:{query:async()=>[{id:1,url:host}],sendMessage:async(id,m)=>{calls.push(m);return m.type.endsWith('probe')?{build:POWER_BUILD,playing:true}:{build:POWER_BUILD,status:403,body:'Forbidden'};}}};
 const t=createPowerTransport({chromeApi,getChannelId:()=>channel});
 const res=await t.fetcher(`https://api.chzzk.naver.com/service/v1/channels/${channel}/log-power/claims/new`,{method:'PUT'});
 assert.equal(res.status,403);assert.equal(calls.at(-1).claimId,'new');
 await assert.rejects(t.fetcher('https://evil.example/',{method:'PUT'}));assert.equal(calls.length,2);
 chromeApi.tabs.sendMessage=async()=>({build:'old',playing:true});
 await assert.rejects(t.fetcher(`https://api.chzzk.naver.com/service/v1/channels/${channel}/log-power`),/다시 로드/);
});
const balance=`https://api.chzzk.naver.com/service/v1/channels/${channel}/log-power`;
function mockTransport(probe) {
 const calls=[];
 const chromeApi={runtime:{id:'test'},tabs:{query:async()=>[{id:1,url:host}],sendMessage:async(id,m)=>{
  calls.push(m); if(m.type.endsWith('probe')) return probe();
  return {build:POWER_BUILD,status:200,body:JSON.stringify({code:200,content:{active:true,amount:42,claims:[]}})};
 }}};
 return {calls,chromeApi,t:createPowerTransport({chromeApi,getChannelId:()=>channel})};
}
test('temporary playback gap allows GET recovery without dispatching a reward request',async()=>{
 let playing=false;const {t,calls}=mockTransport(()=>({build:POWER_BUILD,playing}));
 await assert.rejects(t.fetcher(balance),e=>e.hostReason==='playback' && e.retryable && e.method==='GET');
 assert.equal(calls.filter(m=>m.type.endsWith('request')).length,0);
 playing=true;assert.equal((await t.fetcher(balance)).status,200);
});
test('unavailable probe is distinguished from incompatible build',async()=>{
 const a=mockTransport(()=>{throw new Error('no receiving end')});
 await assert.rejects(a.t.fetcher(balance),e=>e.hostReason==='unavailable' && e.retryable);
 const b=mockTransport(()=>({build:'old',playing:true}));
 await assert.rejects(b.t.fetcher(balance),e=>e.hostReason==='version' && !e.retryable);
});
test('missing host and enumeration failure have distinct diagnoses',async()=>{
 const {t,chromeApi}=mockTransport(()=>({build:POWER_BUILD,playing:true}));
 chromeApi.tabs.query=async()=>[];
 await assert.rejects(t.fetcher(balance),e=>e.hostReason==='missing' && e.retryable);
 chromeApi.tabs.query=async()=>{throw new Error('query failed')};
 await assert.rejects(t.fetcher(balance),e=>e.hostReason==='unavailable' && e.retryable);
});
test('requested PUT waits locally when its probe proves playback is not ready',async()=>{
 const {t,calls}=mockTransport(()=>({build:POWER_BUILD,playing:false}));
 await assert.rejects(t.fetcher(balance+'/claims/new',{method:'PUT'}),e=>e.method==='GET' && e.code==='POWER_PLAYBACK_WAIT' && e.mutationDispatched===false);
 assert.equal(calls.filter(m=>m.type.endsWith('request')).length,0);
});
test('adapter preserves diagnostics and session recovers on scheduled GET',async()=>{
 const {readLogPower}=await import('../src/shared/log-power.js');
 const {createPowerSession}=await import('../src/shared/power-session.js');
 let playing=false,timer,clock=1000000;const statuses=[];
 const {t,calls}=mockTransport(()=>({build:POWER_BUILD,playing}));
 const session=createPowerSession({collector:{collect:async()=>({collected:0})},getChannels:()=>[{id:'main',resourceId:channel,type:'live'}],
  checkAccount:async()=>{await readLogPower(channel,t.fetcher);return 'same-account';},
  onStatus:s=>statuses.push(s),schedule:fn=>{timer=fn;return 1},cancel(){},now:()=>clock});
 session.start();await new Promise(r=>setImmediate(r));
 assert.equal(statuses.at(-1).status,'playback-wait');assert.equal(statuses.at(-1).enabled,true);
 assert.match(statuses.at(-1).detail,/재생 준비/);assert.equal(calls.filter(m=>m.type.endsWith('request')).length,0);
 playing=true;clock+=60000;timer();await new Promise(r=>setImmediate(r));
 assert.equal(statuses.at(-1).status,'checked');assert.equal(statuses.at(-1).enabled,true);
 session.stop();assert.ok(calls.every(m=>m.kind!=='claim'));
});
test('persistent host connection failure stops after five scheduled GET recoveries',async()=>{
 const {readLogPower}=await import('../src/shared/log-power.js');
 const {createPowerSession}=await import('../src/shared/power-session.js');
 let timer,clock=1000000;const states=[];
 const {t,calls}=mockTransport(()=>{throw new Error('receiver unavailable')});
 const session=createPowerSession({collector:{collect:async()=>assert.fail('must not collect')},getChannels:()=>[{id:'main',resourceId:channel,type:'live'}],checkAccount:async()=>readLogPower(channel,t.fetcher),onStatus:s=>states.push(s),schedule:(fn,delay)=>{timer=()=>{clock+=delay;fn()};return 1},cancel(){},now:()=>clock});
 session.start();await new Promise(r=>setImmediate(r));
 for(let i=0;i<5;i++){timer();await new Promise(r=>setImmediate(r));}
 assert.equal(states.at(-1).enabled,false);assert.match(states.at(-1).detail,/한도/);
 assert.equal(calls.length,6);assert.ok(calls.every(m=>m.type.endsWith('probe')));
 session.checkNow();await new Promise(r=>setImmediate(r));assert.equal(calls.length,6);
});
