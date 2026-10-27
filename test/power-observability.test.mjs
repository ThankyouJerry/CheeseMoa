import test from 'node:test';
import assert from 'node:assert/strict';
import {readLogPower} from '../src/shared/log-power.js';
import {createPowerCollector} from '../src/shared/power-collector.js';
import {createPowerSession,describePowerDiagnostics} from '../src/shared/power-session.js';
const channel='a'.repeat(32),account='b'.repeat(64);
const reward={claimId:'private-claim',claimType:'WATCH_5_MIN',state:'COMPLIED',saveType:'ACTIVE'};
const response=claims=>new Response(JSON.stringify({code:200,content:{amount:100,active:true,claims}}),{status:200});
test('empty and filtered response diagnostics reconcile without raw strings',async()=>{
 const empty=await readLogPower(channel,async()=>response([]));assert.match(describePowerDiagnostics(empty.diagnostics),/빈 응답 목록/);
 const result=await readLogPower(channel,async()=>response([null,[],{}, {...reward,claimType:'secret-token'}, {...reward,state:7}, {...reward,saveType:null},reward]));
 assert.deepEqual(result.diagnostics,{received:7,eligible:1,excluded:6,reasons:{invalidEntry:2,invalidId:1,unsupportedType:1,notReady:1,inactiveSave:1}});
 assert.equal(result.claims.length,1);assert.doesNotMatch(JSON.stringify(result.diagnostics)+describePowerDiagnostics(result.diagnostics),/secret-token|private-claim/);
 assert.match(describePowerDiagnostics(result.diagnostics),/미지원 종류 1건/);assert.doesNotMatch(describePowerDiagnostics(result.diagnostics),/빈 응답 목록/);
});
test('excluded candidate never claims and repeated eligible claim remains guarded',async()=>{
 let state={},calls=[],items=[{...reward,claimType:'UNSUPPORTED'}];
 const c=createPowerCollector({storage:{get:async()=>structuredClone(state),set:async x=>{state=structuredClone(x)}},locks:{request:async(n,o,f)=>(f||o)()},fetcher:async(u,o)=>{calls.push(o.method);return o.method==='PUT'?new Response('{"code":200}',{status:200}):response(items)}});
 let r=await c.collect(channel,{enabled:true,accountId:account});assert.deepEqual(calls,['GET']);assert.equal(r.diagnostics.excluded,1);
 items=[reward];r=await c.collect(channel,{enabled:true,accountId:account});assert.equal(r.collected,1);assert.equal(r.diagnostics.eligible,1);
 r=await c.collect(channel,{enabled:true,accountId:account});assert.equal(r.collected,0);assert.equal(r.diagnostics.alreadyHandled,1);assert.equal(calls.filter(x=>x==='PUT').length,1);
});
async function runSession(result){
 const states=[];const s=createPowerSession({collector:{collect:async()=>result},getChannels:()=>[{id:channel,resourceId:channel,type:'live'}],checkAccount:async()=>account,onStatus:x=>states.push(x),schedule:()=>1,cancel:()=>{}});s.start();for(let i=0;i<30;i++)await Promise.resolve();return states;
}
test('ownership loss cannot label a stale read checked; inactive is separate',async()=>{
 const states=await runSession({status:'disabled',collected:0});assert.equal(states.at(-1).enabled,false);assert.equal(states.at(-1).status,'off');assert.equal(states.some(x=>x.status==='checked'),false);
 assert.equal((await runSession({status:'inactive',collected:0,diagnostics:{received:0}})).at(-1).status,'inactive');
});
test('response diagnostics and receipt count remain independent',async()=>{
 const states=await runSession({status:'checked',collected:0,diagnostics:{received:1,eligible:0,excluded:1,reasons:{unsupportedType:1}}});assert.equal(states.at(-1).status,'checked');assert.match(states.at(-1).detail,/미지원 종류 1건/);assert.match(states.at(-1).detail,/0건 수령/);
});
