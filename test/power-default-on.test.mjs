import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeSimulation} from '../dev/power-runtime-simulation.js';
const preference='cheesemoa.power.preference.v1',ownerKey='cheesemoa.power.owner.v1';
const puts=sim=>sim.calls.filter(call=>call.method==='PUT').length;
// power-20261026.2 requires explicit ON for an unset preference. Persisted ON
// still restores, and stored/current OFF must continue to win over restoration.
test('fresh profile stays OFF without requests or rewriting its unset preference',async()=>{
 const sim=createRuntimeSimulation();try{
  const other=sim.createOwner({tabId:2,documentId:'other'});
  await Promise.all([sim.owner.restore(),other.restore()]);await sim.flush();
  assert.equal(sim.calls.length,0);assert.equal(sim.states.at(-1).enabled,false);
  assert.notEqual(sim.session.snapshot()[ownerKey]?.enabled,true);
  assert.equal(sim.local.snapshot()[preference],undefined);assert.equal(sim.timers.size,0);
 }finally{sim.dispose()}
});
for(const initial of [{enabled:true}])test(`fresh session restores saved ON with preference ${JSON.stringify(initial)}`,async()=>{
 const sim=createRuntimeSimulation();try{if(initial)await sim.local.set({[preference]:initial});await sim.owner.restore();await sim.flush();assert.equal(sim.session.snapshot()[ownerKey].enabled,true);assert.equal(puts(sim),1);await sim.owner.restore();await sim.flush();assert.equal(puts(sim),1)}finally{sim.dispose()}
});
for(const initial of [{local:{[preference]:{enabled:false}}},{session:{[ownerKey]:{enabled:false}}}])test(`explicit OFF or an existing disabled owner blocks default activation ${JSON.stringify(initial)}`,async()=>{
 const sim=createRuntimeSimulation();try{if(initial.local)await sim.local.set(initial.local);if(initial.session)await sim.session.set(initial.session);await sim.owner.restore();await sim.flush();assert.equal(puts(sim),0);assert.equal(sim.calls.length,0);assert.equal(sim.states.at(-1).enabled,false)}finally{sim.dispose()}
});
test('explicit OFF persists across a fresh owner session and manual ON can enable it again',async()=>{
 const sim=createRuntimeSimulation();try{await sim.owner.start();await sim.flush();assert.equal(puts(sim),1);await sim.owner.stop({remember:true});assert.equal(sim.local.snapshot()[preference].enabled,false);await sim.session.set({[ownerKey]:undefined});const reloaded=sim.createOwner({documentId:'reloaded'});await reloaded.restore();await sim.flush();assert.equal(puts(sim),1);assert.equal(sim.states.at(-1).enabled,false);await reloaded.start();await sim.flush();assert.equal(sim.local.snapshot()[preference].enabled,true);assert.equal(sim.session.snapshot()[ownerKey].enabled,true);assert.equal(puts(sim),1)}finally{sim.dispose()}
});
test('simultaneous saved ON restores select one owner and never send duplicate non-hour claim PUTs',async()=>{
 const sim=createRuntimeSimulation();try{await sim.local.set({[preference]:{enabled:true}});const other=sim.createOwner({tabId:2,documentId:'other'});await Promise.all([sim.owner.restore(),other.restore()]);await sim.flush();assert.equal(sim.session.snapshot()[ownerKey].enabled,true);assert.equal(puts(sim),1);const before=sim.session.snapshot()[ownerKey];const third=sim.createOwner({tabId:3,documentId:'third'});await third.restore();await sim.flush();assert.equal(sim.session.snapshot()[ownerKey].epoch,before.epoch);assert.equal(sim.session.snapshot()[ownerKey].tabId,before.tabId);assert.equal(puts(sim),1)}finally{sim.dispose()}
});

for(const initial of [{local:{[preference]:null}},{local:{[preference]:{enabled:'true'}}},{session:{[ownerKey]:null}}])test(`unknown existing settings fail closed instead of becoming a fresh default ${JSON.stringify(initial)}`,async()=>{
 const sim=createRuntimeSimulation();try{if(initial.local)await sim.local.set(initial.local);if(initial.session)await sim.session.set(initial.session);await sim.owner.restore();await sim.flush();assert.equal(sim.calls.length,0);assert.equal(sim.states.at(-1).enabled,false)}finally{sim.dispose()}
});
test('explicit OFF during a delayed initial status read prevents default start and remains remembered',async()=>{
 const sim=createRuntimeSimulation();let release,signalRead;const started=new Promise(resolve=>signalRead=resolve),original=sim.local.get;let delayed=false;
 sim.local.get=async key=>{const value=await original(key);if(key===preference&&!delayed){delayed=true;signalRead();await new Promise(resolve=>release=resolve)}return value};
 try{await sim.local.set({[preference]:{enabled:true}});const restoring=sim.owner.restore();await started;await sim.owner.stop({remember:true});assert.equal(sim.local.snapshot()[preference].enabled,false);release();await restoring;await sim.flush();assert.equal(sim.calls.length,0);assert.equal(sim.states.at(-1).enabled,false);assert.notEqual(sim.session.snapshot()[ownerKey]?.enabled,true)}finally{release?.();sim.dispose()}
});

test('OFF stops active and in-flight collection even when remembering the preference fails',async()=>{
 const sim=createRuntimeSimulation();let release,signalRead;const reached=new Promise(resolve=>signalRead=resolve);
 try{await sim.owner.start();await sim.flush();assert.equal(puts(sim),1);const send=sim.chromeApi.tabs.sendMessage;let delayed=false;sim.chromeApi.tabs.sendMessage=async(...args)=>{if(args[1].kind==='account'&&!delayed){delayed=true;signalRead();await new Promise(resolve=>release=resolve)}return send(...args)};
  const checking=sim.advance();await reached;const set=sim.local.set;sim.local.set=async patch=>{if(Object.hasOwn(patch,preference))throw new Error('preference storage unavailable');return set(patch)};
  await sim.owner.stop({remember:true});assert.equal(sim.session.snapshot()[ownerKey].enabled,false);release();await checking;await sim.flush();assert.equal(puts(sim),1);assert.equal(sim.states.at(-1).enabled,false);assert.equal(sim.timers.size,0);
 }finally{release?.();sim.dispose()}
});

test('runtime becomes OFF before a slow preference save finishes and rejects further collection',async()=>{
 const sim=createRuntimeSimulation();let release,signalSave;const saving=new Promise(resolve=>signalSave=resolve);
 try{await sim.owner.start();await sim.flush();const active=sim.session.snapshot()[ownerKey],set=sim.local.set;sim.local.set=async patch=>{if(Object.hasOwn(patch,preference)){signalSave();await new Promise(resolve=>release=resolve)}return set(patch)};
  const stopping=sim.owner.stop({remember:true});await saving;assert.equal(sim.session.snapshot()[ownerKey].enabled,false);const sender={id:sim.chromeApi.runtime.id,frameId:0,tab:{id:active.tabId},documentId:active.documentId,url:'https://chzzk.naver.com/live/'+active.channelId};
  for(const action of ['account','collect'])await assert.rejects(sim.coordinator.handle({action,channelId:active.channelId,epoch:active.epoch,startRequestId:active.startRequestId},sender),error=>error.code==='OWNER_STOPPED');assert.equal(puts(sim),1);release();await stopping;assert.equal(sim.local.snapshot()[preference].enabled,false);assert.equal(sim.timers.size,0);
 }finally{release?.();sim.dispose()}
});
