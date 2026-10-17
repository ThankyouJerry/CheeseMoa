import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeSimulation} from '../dev/power-runtime-simulation.js';
test('local buffering cannot exhaust HTTP retries; ready playback resumes without another ON',async()=>{
 const r=createRuntimeSimulation();try{
  r.playing(false);await r.owner.start();await r.flush();
  for(let i=0;i<7;i++){
   assert.equal(r.states.at(-1).enabled,true,'local readiness must wait, not disable owner');
   assert.equal(r.calls.length,0,'no network while readiness is false');
   assert.equal(Object.keys(r.session.snapshot()['cheesemoa.power.owner.v1'].backoffs||{}).length,0,'local buffering must not create server cooldown');
   r.owner.checkNow();r.owner.checkNow();assert.equal(r.timers.size,1,'readiness wait keeps a single timer');
   await r.advance();
  }
  r.playing(true);await r.advance();assert.equal(r.states.at(-1).status,'checked');assert.equal(r.calls.filter(c=>c.kind==='claim').length,1);
  await r.advance();assert.equal(r.calls.filter(c=>c.kind==='claim').length,1,'durable duplicate guard remains active');
 }finally{r.dispose()}
});
test('OFF cancels local playback wait with no network or claim',async()=>{const r=createRuntimeSimulation();try{r.playing(false);await r.owner.start();await r.flush();await r.owner.stop();await r.flush();assert.equal(r.timers.size,0);assert.equal(r.calls.length,0);assert.equal(r.session.snapshot()['cheesemoa.power.owner.v1'].enabled,false)}finally{r.dispose()}});
test('server Retry-After survives a readiness wait and owner restart',async()=>{const r=createRuntimeSimulation({mode:'429-once'});try{await r.owner.start();await r.flush();const before=r.session.snapshot()['cheesemoa.power.owner.v1'].backoffs;const count=r.calls.length;r.playing(false);await r.owner.stop();await r.owner.start();await r.flush();assert.deepEqual(r.session.snapshot()['cheesemoa.power.owner.v1'].backoffs,before);assert.equal(r.calls.length,count);await r.advance();assert.equal(r.calls.length,count);assert.deepEqual(r.session.snapshot()['cheesemoa.power.owner.v1'].backoffs,before);r.playing(true);await r.advance();assert.equal(r.states.at(-1).status,'checked')}finally{r.dispose()}});
test('local wait marker never retries a PUT or dispatched/unknown mutation',async()=>{
 const {createPowerSession}=await import('../src/shared/power-session.js');
 for(const extra of [{method:'PUT',mutationDispatched:false},{method:'GET',mutationDispatched:true},{method:'GET'}]){
  let state,timer;const session=createPowerSession({getChannels:()=>[],collector:{},checkAccount:async()=>{throw Object.assign(new Error('not a local probe'),{code:'POWER_PLAYBACK_WAIT',retryable:true,...extra})},onStatus:s=>state=s,schedule:f=>{timer=f;return 1},cancel:()=>{timer=null}});
  session.start();await new Promise(r=>setImmediate(r));assert.equal(state.enabled,false);assert.equal(timer,null);session.stop();
 }
});

test('actual server failure budget is preserved across buffering and reset only after successful cycle',async()=>{const r=createRuntimeSimulation({mode:'get-once'});try{await r.owner.start();await r.flush();const before=r.session.snapshot()['cheesemoa.power.owner.v1'].backoffs;r.playing(false);for(let i=0;i<7;i++){await r.advance();assert.equal(r.states.at(-1).enabled,true);assert.deepEqual(r.session.snapshot()['cheesemoa.power.owner.v1'].backoffs,before)}r.playing(true);await r.advance();assert.equal(r.states.at(-1).status,'checked');assert.equal(r.states.at(-1).failures,0)}finally{r.dispose()}});
test('owner transfer during readiness wait cancels old timer and keeps exactly one owner',async()=>{const r=createRuntimeSimulation();try{r.playing(false);await r.owner.start();await r.flush();const second=r.createOwner({tabId:2,documentId:'other'});await second.start();await r.flush();assert.equal(r.timers.size,1);assert.equal(r.session.snapshot()['cheesemoa.power.owner.v1'].tabId,2);r.playing(true);await r.advance();assert.equal(r.calls.filter(c=>c.kind==='claim').length,1)}finally{r.dispose()}});


test('playback loss after eligibility GET does not exhaust retries or strand reservation; recovery claims once',async()=>{
 const {POWER_STORAGE_KEY}=await import('../src/shared/power-collector.js');
 const h=createRuntimeSimulation({mode:'preflight-playback'});
 try{
  await h.owner.start();await h.flush();
  for(let i=0;i<8;i++){
   assert.equal(h.states.at(-1).status,'playback-wait');
   assert.equal(h.states.at(-1).enabled,true);
   assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
   assert.equal(h.local.snapshot()[POWER_STORAGE_KEY].attempts.length,0);
   assert.equal(h.local.snapshot()[POWER_STORAGE_KEY].receipts.length,0);
   assert.ok(Object.values(h.session.snapshot()['cheesemoa.power.owner.v1'].backoffs||{}).every(b=>b.failures===0&&b.retryAt===0));
   assert.equal(h.timers.size,1);
   h.playing(true);await h.advance();
  }
  h.mode('ok');h.playing(true);await h.advance();
  assert.equal(h.states.at(-1).status,'checked');
  assert.equal(h.local.snapshot()[POWER_STORAGE_KEY].receipts.length,1);
  await h.advance();
  assert.equal(h.calls.filter(c=>c.method==='PUT').length,1);
 }finally{h.dispose()}
});
