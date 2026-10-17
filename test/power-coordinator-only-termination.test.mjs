import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
import {POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {flushRuntime} from '../dev/power-runtime-simulation.js';
for(const point of ['after-pending','after-put','before-receipt'])test(`coordinator-only termination ${point}: page agent survives; status restores without ON; no duplicate PUT`,async()=>{
 const data={local:{},session:{}},held=new Map(),queues=new Map(),workers=new Set();
 let puts=0,crashed=false,activePageRequests=0,completedPageRequests=0,releasePut,killCoordinator;
 const pageAgent=createPagePowerAgent({isPlaying:()=>true,fetcher:async(url,options)=>{
  if(options.method==='PUT'){
   puts++;
   if(point==='after-put'&&!crashed){const response=new Promise(resolve=>releasePut=()=>resolve(new Response(null,{status:204})));killCoordinator();return response}
   return new Response(null,{status:204});
  }
  return new Response(JSON.stringify({code:200,content:url.includes('getUserStatus')?{loggedIn:true,userIdHash:'surviving_page_account'}:{active:true,amount:100,claims:[{claimId:'persistent-claim',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:10}]}}));
 }});
 function release(name,w){if(held.get(name)!==w)return;held.delete(name);const queue=queues.get(name)||[];while(queue.length){const next=queue.shift();if(workers.has(next.w)){held.set(name,next.w);next.reply(null);break}}}
 function launch(restore){return new Promise((resolve,reject)=>{
  const w=new Worker(new URL('../dev/fixtures/power-coordinator-only-worker.mjs',import.meta.url),{workerData:{restore}});workers.add(w);let terminated=false;
  const deadline=setTimeout(()=>{void w.terminate();reject(new Error('coordinator timeout'))},10000);
  const kill=()=>{crashed=true;terminated=true;void w.terminate()};if(!restore)killCoordinator=kill;
  w.on('error',reject);w.on('exit',()=>{clearTimeout(deadline);workers.delete(w);for(const name of [...held.keys()])release(name,w);if(terminated)resolve({terminated:true})});
  w.on('message',m=>{
   if(m.kind==='done'){clearTimeout(deadline);resolve(m);return}
   if(m.kind==='failed'){clearTimeout(deadline);reject(new Error(m.error));return}
   if(m.kind!=='rpc')return;const reply=value=>{if(workers.has(w))w.postMessage({id:m.id,value})};
   if(m.op==='acquire'){if(!held.has(m.name)){held.set(m.name,w);reply(null)}else{if(!queues.has(m.name))queues.set(m.name,[]);queues.get(m.name).push({w,reply})}return}
   if(m.op==='release'){release(m.name,w);reply(null);return}
   if(m.op==='get'){reply({[m.key]:structuredClone(data[m.area][m.key])});return}
   if(m.op==='set'){
    const record=m.patch[POWER_STORAGE_KEY];
    if(!restore&&!crashed&&point==='before-receipt'&&record?.receipts.length){kill();return}
    data[m.area]={...data[m.area],...structuredClone(m.patch)};
    if(!restore&&!crashed&&point==='after-pending'&&record?.attempts.some(a=>a.status==='pending')){kill();return}
    reply(null);return;
   }
   if(m.op==='page-message'){
    if(m.message.type==='cheesemoa-owner-state'){reply({});return}
    activePageRequests++;
    void pageAgent(m.message).then(value=>{completedPageRequests++;reply(value)}).finally(()=>activePageRequests--);
   }
  });
 })}
 try{
  await launch(false);assert.equal(crashed,true);assert.equal(held.size,0);
  const ownerBefore=structuredClone(data.session['cheesemoa.power.owner.v1']),guard=structuredClone(data.local[POWER_STORAGE_KEY].attempts);
  assert.equal(ownerBefore.enabled,true);assert.equal(data.local[POWER_STORAGE_KEY].receipts.length,0);
  if(point==='after-put')assert.equal(activePageRequests,1,'original page-side PUT must remain alive after coordinator exit');
  const beforeCompleted=completedPageRequests,restored=await launch(true);
  assert.equal(restored.restored,true);assert.equal(restored.epoch,ownerBefore.epoch);assert.equal(restored.result.blocked,1);
  assert.equal(data.session['cheesemoa.power.owner.v1'].startRequestId,ownerBefore.startRequestId);
  assert.ok(completedPageRequests>beforeCompleted,'the same surviving page agent must serve the restarted coordinator');
  assert.equal(puts,point==='after-pending'?0:1);
  if(point==='after-put'){
   assert.equal(activePageRequests,1);releasePut();await flushRuntime();assert.equal(activePageRequests,0);
   const afterLateResponse=await launch(true);assert.equal(afterLateResponse.result.blocked,1);assert.equal(puts,1);
  }
  assert.deepEqual(data.local[POWER_STORAGE_KEY].attempts,guard);assert.equal(data.local[POWER_STORAGE_KEY].receipts.length,0);assert.equal(held.size,0);
 }finally{releasePut?.();await Promise.all([...workers].map(w=>w.terminate()))}
});
