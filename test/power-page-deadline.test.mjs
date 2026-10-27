import test from 'node:test';
import assert from 'node:assert/strict';
import {createPowerTransport} from '../src/shared/power-transport.js';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
import {readLogPower,claimAvailableReward} from '../src/shared/log-power.js';
import {POWER_BUILD} from '../src/shared/power-build.js';
import {flushRuntime} from '../dev/power-runtime-simulation.js';
const channel='a'.repeat(32);
for(const method of ['GET','PUT'])test(`real page adapter deadline bounds never-resolving ${method} reply without assuming unsent`,async()=>{
 const timers=new Map();let seq=0,requests=0;
 const chromeApi={tabs:{sendMessage:async(_,m)=>{if(m.kind==='probe')return {build:POWER_BUILD,playing:true};requests++;return new Promise(()=>{})}}};
 const transport=createPowerTransport({chromeApi,getChannelId:()=>channel,targetContext:{tabId:1,documentId:'doc'},protocol:POWER_BUILD,schedule:fn=>{timers.set(++seq,fn);return seq},cancel:id=>timers.delete(id)});
 const promise=method==='GET'?readLogPower(channel,transport.fetcher):claimAvailableReward(channel,{claimId:'one',claimType:'WATCH_5_MIN',state:'COMPLIED',saveType:'ACTIVE'},transport.fetcher);
 const assertion=assert.rejects(promise,e=>e.name==='TimeoutError'&&e.method===method&&e.retryable===(method==='GET')&&e.mutationDispatched!==false);
 await flushRuntime();assert.equal(requests,1);assert.equal(timers.size,1);[...timers.values()][0]();await assertion;
});
test('never-resolving host fetch is bounded by the actual page transport deadline',async()=>{
 const agent=createPagePowerAgent({isPlaying:()=>true,fetcher:()=>new Promise(()=>{})});let fire;
 const transport=createPowerTransport({chromeApi:{tabs:{sendMessage:(_,m)=>agent(m)}},getChannelId:()=>channel,targetContext:{tabId:1,documentId:'doc'},protocol:POWER_BUILD,schedule:fn=>{fire=fn;return 1},cancel(){}});
 const result=readLogPower(channel,transport.fetcher);const assertion=assert.rejects(result,e=>e.name==='TimeoutError'&&e.retryable);await flushRuntime();fire();await assertion;
});
