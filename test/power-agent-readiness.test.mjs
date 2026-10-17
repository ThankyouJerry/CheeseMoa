import test from 'node:test';
import assert from 'node:assert/strict';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
import {createPowerTransport} from '../src/shared/power-transport.js';
import {POWER_BUILD} from '../src/shared/power-build.js';
const channel='a'.repeat(32),base=`https://api.chzzk.naver.com/service/v1/channels/${channel}/log-power`;
const claim={kind:'claim',channelId:channel,claimId:'one'};
const eligible=()=>new Response(JSON.stringify({code:200,content:{active:true,claims:[{claimId:'one',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE'}]}}));
const waiting=r=>r.error==='POWER_PLAYBACK_WAIT'&&r.status===0&&r.mutationDispatched===false&&r.phase==='eligibility';
test('page agent distinguishes valid-channel readiness from invalid input before any network',async()=>{
 let calls=0;const agent=createPagePowerAgent({isPlaying:()=>false,fetcher:async()=>{calls++;throw Error('unexpected')}});
 for(const kind of ['account','balance','claim'])assert.ok(waiting(await agent({...claim,kind})));
 const invalid=await agent({...claim,channelId:'invalid'});assert.equal(invalid.schema,true);assert.equal(invalid.error,'POWER_TRANSPORT_FAILED');assert.equal(calls,0);
});
test('network and schema failures during playback loss remain failures, not readiness waits',async()=>{
 for(const outcome of ['network','schema','json']){
  let playing=true;const agent=createPagePowerAgent({isPlaying:()=>playing,fetcher:async()=>{playing=false;if(outcome==='network')throw Error('NO_ACTIVE_PLAYER');return outcome==='json'?new Response('{'):new Response('{}')}});
  const result=await agent(claim);assert.equal(result.error,'POWER_TRANSPORT_FAILED');assert.equal(result.mutationDispatched,false);
 }
});
test('playback loss after PUT dispatch never becomes a local wait',async()=>{
 let playing=true,puts=0;const agent=createPagePowerAgent({isPlaying:()=>playing,fetcher:async(u,o)=>{if(o.method==='GET')return eligible();puts++;playing=false;throw Error('NO_ACTIVE_PLAYER')}});
 const result=await agent(claim);assert.equal(result.error,'POWER_TRANSPORT_FAILED');assert.equal(result.mutationDispatched,true);assert.equal(result.phase,'mutation');assert.equal(puts,1);
});
test('adapter accepts only an exact proven-unsent readiness envelope',async()=>{
 const valid={build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
 for(const change of [null,{build:'old'},{status:500},{mutationDispatched:true},{mutationDispatched:undefined},{phase:'mutation'},{error:'POWER_TRANSPORT_FAILED'}]){
  const result={...valid,...change};const chromeApi={tabs:{sendMessage:async(id,m)=>m.kind==='probe'?{build:POWER_BUILD,playing:true}:result}};
  const t=createPowerTransport({chromeApi,getChannelId:()=>channel,targetContext:{tabId:1,documentId:'test'},protocol:POWER_BUILD});
  await assert.rejects(t.fetcher(base+'/claims/one',{method:'PUT'}),e=>change?e.code!=='POWER_PLAYBACK_WAIT':e.code==='POWER_PLAYBACK_WAIT'&&e.method==='GET'&&e.mutationDispatched===false);
 }
});
