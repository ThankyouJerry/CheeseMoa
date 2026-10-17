import test from 'node:test';
import assert from 'node:assert/strict';
import {createPowerCoordinator,safePowerError} from '../src/background/power-coordinator.js';
import {createPagePowerOwner} from '../src/shared/power-page-owner.js';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
import {memoryLocks,memoryStore,flushRuntime,simChannel} from '../dev/power-runtime-simulation.js';
const key='cheesemoa.power.owner.v1';
function fixture({limitScope="account"}={}){
 const local=memoryStore(),session=memoryStore(),locks=memoryLocks(),states=[],timers=new Map();let id=0,clock=100000,puts=0,gets=0,limited=true,seq=0;
 const agent=createPagePowerAgent({isPlaying:()=>true,fetcher:async(url,o)=>{if(o.method==='PUT'){puts++;return new Response(null,{status:204})}gets++;if(limited&&(limitScope==='account'?url.includes('getUserStatus'):!url.includes('getUserStatus')))return new Response(null,{status:429,headers:{'Retry-After':'120'}});return new Response(JSON.stringify({code:200,content:url.includes('getUserStatus')?{loggedIn:true,userIdHash:'test_account_123'}:{active:true,amount:1,claims:[]}}))}});
 const api={runtime:{id:'test'},storage:{local,session},tabs:{sendMessage:(_,m)=>m.type==='cheesemoa-owner-state'?Promise.resolve({}):agent(m)}};
 const coordinator=createPowerCoordinator({chromeApi:api,locks,now:()=>clock});
 const sender=(tab=1,doc='doc',channel=simChannel)=>({id:'test',frameId:0,tab:{id:tab},documentId:doc,url:`https://chzzk.naver.com/live/${channel}`});
 const send=(s,intercept=async(m,run)=>run())=>async m=>intercept(m,async()=>{try{return {ok:true,result:await coordinator.handle(m,s)}}catch(e){return {ok:false,error:safePowerError(e)}}});
 const make=(s=sender(),intercept,channelId=simChannel)=>createPagePowerOwner({send:send(s,intercept),getChannelId:()=>channelId,onState:s=>states.push(s),now:()=>clock,schedule:(fn,delay)=>{timers.set(++id,{fn,at:clock+delay});return id},cancel:i=>timers.delete(i),requestId:()=>`request-${++seq}`});
 return {local,session,coordinator,states,timers,sender,send,make,gets:()=>gets,puts:()=>puts,clock:v=>clock=v,limited:v=>limited=v};
}
for(const action of ['start','activate'])test(`lost ${action} reply followed by OFF cannot restore ON`,async()=>{
 const f=fixture();const owner=f.make(f.sender(),async(m,run)=>{const reply=await run();if(m.action===action)throw new Error('reply lost');return reply});
 await owner.start();await owner.stop();assert.equal(f.session.snapshot()[key].enabled,false);
 const reopened=f.make(f.sender(1,'new-doc'));await reopened.restore();await flushRuntime();assert.equal(f.states.at(-1).enabled,false);assert.equal(f.gets(),0);assert.equal(f.puts(),0);owner.suspend();reopened.suspend();
});
test('OFF while start is still in transit cancels only that request, not another tab owner',async()=>{
 const f=fixture();let deliver;const owner=f.make(f.sender(),(m,run)=>m.action==='start'?new Promise(resolve=>deliver=async()=>resolve(await run())):run());
 const starting=owner.start();await flushRuntime();assert.equal(f.states.at(-1).canStop,true);await owner.stop();
 const other=f.make(f.sender(2,'other'));await other.start();await flushRuntime();const current=f.session.snapshot()[key];
 await deliver();await starting;assert.equal(f.session.snapshot()[key].epoch,current.epoch);assert.equal(f.session.snapshot()[key].tabId,2);assert.equal(f.session.snapshot()[key].enabled,true);owner.suspend();other.suspend();
});
test('Retry-After deadline and failure count survive suspend, document replacement, and explicit tab takeover',async()=>{
 const f=fixture(),first=f.make();await first.start();
 for(let i=0;i<100&&f.states.at(-1)?.status!=='waiting';i++)await flushRuntime();
 assert.equal(f.gets(),1);assert.equal(f.session.snapshot()[key].backoffs.account.retryAt,220000);
 assert.equal(f.session.snapshot()[key].backoffs.account.failures,1);
 first.suspend();const restored=f.make(f.sender(1,'new'));await restored.restore();await flushRuntime();assert.equal(f.gets(),1);assert.equal(f.states.at(-1).status,'waiting');
 const other=f.make(f.sender(2,'other'));await other.start();await flushRuntime();assert.equal(f.gets(),1);assert.equal(f.states.at(-1).retryAt,220000);
 // Even a direct premature account message cannot bypass the stored gate.
 const current=f.session.snapshot()[key];await assert.rejects(f.coordinator.handle({action:'account',channelId:simChannel,epoch:current.epoch},f.sender(2,'other')),e=>e.code==='POWER_BACKOFF');assert.equal(f.gets(),1);
 f.clock(220000);
 for(const [id,timer]of [...f.timers])if(timer.at<=220000){f.timers.delete(id);timer.fn()}
 for(let i=0;i<200&&f.session.snapshot()[key].backoffs.account.failures!==2;i++)await flushRuntime();
 assert.equal(f.session.snapshot()[key].backoffs.account.failures,2);assert.equal(f.session.snapshot()[key].backoffs.account.retryAt,340000);
 other.suspend();const again=f.make(f.sender(2,'other-restored'));await again.restore();await flushRuntime();const before=f.gets();assert.equal(f.states.at(-1).failures,2);assert.equal(f.gets(),before);
 f.clock(340000);f.limited(false);for(const [id,timer]of [...f.timers])if(timer.at<=340000){f.timers.delete(id);timer.fn()}
 for(let i=0;i<200&&f.session.snapshot()[key].backoffs.account.failures!==0;i++)await flushRuntime();
 assert.ok(f.gets()>before);assert.deepEqual(f.session.snapshot()[key].backoffs.account,{retryAt:0,failures:0});again.suspend();
 first.suspend();restored.suspend();other.suspend();
});

for(const scope of ['account','channel'])test(`${scope} Retry-After has the correct scope across explicit channel A to B switch`,async()=>{
 const f=fixture({limitScope:scope}),first=f.make();await first.start();
 for(let i=0;i<200&&f.states.at(-1)?.status!=='waiting';i++)await flushRuntime();
 const before=f.gets(),otherChannel='d'.repeat(32),other=f.make(f.sender(2,'channel-b',otherChannel),undefined,otherChannel);
 await other.start();for(let i=0;i<100;i++)await flushRuntime();
 if(scope==='account'){
  assert.equal(f.gets(),before);assert.equal(f.states.at(-1).retryAt,220000);
  assert.equal(f.session.snapshot()[key].backoffs.account.retryAt,220000);
 }else{
  assert.ok(f.gets()>before,'channel A deadline must not block the independent channel B endpoint');
  assert.equal(f.session.snapshot()[key].backoffs[`channel:${simChannel}`].retryAt,220000);
  assert.equal(f.session.snapshot()[key].backoffs.account.retryAt,0);
 }
 first.suspend();other.suspend();
});
