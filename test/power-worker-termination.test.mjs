import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
for(const point of ['after-pending','after-put','before-receipt'])test(`actual worker termination ${point} releases locks and preserves the durable duplicate guard`,async()=>{
 const data={local:{},session:{}},held=new Map(),queues=new Map();let puts=0,crashed=false;const workers=new Set();
 function release(name,w){if(held.get(name)!==w)return;held.delete(name);const queue=queues.get(name)||[];while(queue.length){const next=queue.shift();if(workers.has(next.w)){held.set(name,next.w);next.reply(null);break}}}
 function launch(documentId,inject){return new Promise((resolve,reject)=>{
  const w=new Worker(new URL('../dev/fixtures/power-crash-worker.mjs',import.meta.url),{workerData:{documentId}});workers.add(w);let finished=false;
  const timeout=setTimeout(()=>{void w.terminate();reject(new Error('worker did not complete'))},10000);
  const kill=()=>{crashed=true;finished=true;void w.terminate()};
  w.on('error',reject);
  w.on('exit',()=>{clearTimeout(timeout);workers.delete(w);for(const name of [...held.keys()])release(name,w);if(finished)resolve({terminated:true})});
  w.on('message',m=>{
   if(m.kind==='done'){finished=false;clearTimeout(timeout);resolve(m.result);return}
   if(m.kind==='failed'){clearTimeout(timeout);reject(new Error(m.error));return}
   if(m.kind!=='rpc')return;
   const reply=value=>{if(workers.has(w))w.postMessage({id:m.id,value})};
   if(m.op==='acquire'){if(!held.has(m.name)){held.set(m.name,w);reply(null)}else{if(!queues.has(m.name))queues.set(m.name,[]);queues.get(m.name).push({w,reply})}return}
   if(m.op==='release'){release(m.name,w);reply(null);return}
   if(m.op==='get'){reply({[m.key]:structuredClone(data[m.area][m.key])});return}
   if(m.op==='set'){
    const record=m.patch[POWER_STORAGE_KEY];
    if(inject&&!crashed&&point==='before-receipt'&&record?.receipts.length){kill();return}
    data[m.area]={...data[m.area],...structuredClone(m.patch)};
    if(inject&&!crashed&&point==='after-pending'&&record?.attempts.some(a=>a.status==='pending')){kill();return}
    reply(null);return;
   }
   if(m.op==='fetch'){
    if(m.method==='PUT'){puts++;if(inject&&!crashed&&point==='after-put'){kill();return}reply({status:204,body:null});return}
    reply({status:200,body:JSON.stringify({code:200,content:m.url.includes('getUserStatus')?{loggedIn:true,userIdHash:'crash_test_account'}:{active:true,amount:100,claims:[{claimId:'persistent-claim',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:10}]}})});
   }
  });
 })}
 try{
  await launch('original',true);assert.equal(crashed,true);assert.equal(held.size,0);assert.equal(data.local[POWER_STORAGE_KEY].attempts.length,1);assert.equal(data.local[POWER_STORAGE_KEY].receipts.length,0);
  assert.equal(puts,point==='after-pending'?0:1);
  const before=structuredClone(data.local[POWER_STORAGE_KEY].attempts);
  const restarted=await launch('restarted',false);assert.equal(restarted.blocked,1);assert.equal(puts,point==='after-pending'?0:1);assert.deepEqual(data.local[POWER_STORAGE_KEY].attempts,before);assert.equal(data.local[POWER_STORAGE_KEY].receipts.length,0);assert.equal(held.size,0);
 }finally{await Promise.all([...workers].map(w=>w.terminate()))}
});
