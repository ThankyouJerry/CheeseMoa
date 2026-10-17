import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeSimulation,simChannel,flushRuntime} from '../dev/power-runtime-simulation.js';
import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {checkPowerAccount} from '../src/shared/login-session.js';
const state=h=>h.local.snapshot()[POWER_STORAGE_KEY];
const puts=h=>h.calls.filter(c=>c.method==='PUT').length;
test('production page owner + coordinator + page agent collect once without a manager, across repeated eligible responses',async()=>{
 const h=createRuntimeSimulation();try{await h.owner.start();await h.flush();assert.equal(puts(h),1);assert.equal(state(h).receipts.length,1);await h.advance();assert.equal(puts(h),1);await h.owner.stop();const n=h.calls.length;await h.owner.restore();await h.flush();assert.equal(h.states.at(-1).enabled,false);assert.equal(h.calls.length,n)}finally{h.dispose()}
});
test('old and new owners use the same extension-origin lock and receipt guards',async()=>{
 const h=createRuntimeSimulation();try{
  const account=await checkPowerAccount(h.fetcher);const old=createPowerCollector({storage:h.local,locks:h.locks,fetcher:h.fetcher});
  await Promise.all([h.owner.start(),old.collect(simChannel,{enabled:true,accountId:account})]);await h.flush();assert.equal(puts(h),1);assert.equal(state(h).receipts.length,1);
  const second=h.createOwner({tabId:2,documentId:'second'});await second.start();await h.flush();assert.equal(puts(h),1);
  await h.advance();assert.equal(puts(h),1);
 }finally{h.dispose()}
});
for(const mode of ['403','uncertain','preflight403'])test(`actual page bridge ${mode} stops, preserves uncertainty only after PUT, and cannot retransmit`,async()=>{
 const h=createRuntimeSimulation({mode});try{await h.owner.start();await h.flush();assert.equal(h.states.at(-1).enabled,false);assert.equal(h.states.at(-1).status,'error');assert.equal(state(h).receipts.length,0);assert.equal(state(h).attempts.length,mode==='preflight403'?0:1);assert.equal(puts(h),mode==='preflight403'?0:1);
  if(mode!=='preflight403'){h.mode('ok');const next=h.createOwner({documentId:'reopened'});await next.restore();await h.flush();assert.equal(h.states.at(-1).enabled,false);await next.start();await h.flush();assert.equal(puts(h),1);assert.equal(state(h).receipts.length,0)}
 }finally{h.dispose()}
});
test('GET failure recovers; account change stops instead of attributing another account',async()=>{
 const h=createRuntimeSimulation({mode:'get-once'});try{await h.owner.start();await h.flush();assert.equal(h.states.at(-1).status,'waiting');await h.advance();assert.equal(state(h).receipts.length,1);h.identity('different_account_2');await h.advance();assert.equal(h.states.at(-1).enabled,false);assert.equal(puts(h),1)}finally{h.dispose()}
});
test('ON survives document replacement only for the same tab/channel; OFF remains OFF',async()=>{
 const h=createRuntimeSimulation();try{await h.owner.start();await h.flush();h.owner.suspend();const next=h.createOwner({documentId:'replacement'});await next.restore();await h.flush();assert.equal(h.states.at(-1).enabled,true);assert.equal(puts(h),1);await next.stop();next.suspend();await next.restore();await h.flush();assert.equal(h.states.at(-1).enabled,false)}finally{h.dispose()}
});

test('closing owner tab stops desired state; stale notifications cannot disable a newer explicit ON',async()=>{
 const h=createRuntimeSimulation();try{
  await h.owner.start();await h.flush();const oldEpoch=h.session.snapshot()['cheesemoa.power.owner.v1'].epoch;
  await h.owner.stop();await h.owner.start();await h.flush();h.owner.deactivate(oldEpoch);
  assert.equal(h.states.at(-1).enabled,true);
  await h.coordinator.removeTab(1);await h.flush();assert.equal(h.states.at(-1).enabled,false);
  assert.equal(h.session.snapshot()['cheesemoa.power.owner.v1'].enabled,false);
  assert.equal(puts(h),1);
 }finally{h.dispose()}
});
