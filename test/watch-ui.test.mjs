import test from 'node:test';
import assert from 'node:assert/strict';
import {collectWatchUiReward, findWatchRewardButton} from '../src/shared/watch-ui-claim.js';
import {claimAvailableReward} from '../src/shared/log-power.js';
import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {createPowerTransport} from '../src/shared/power-transport.js';
import {createPowerSession} from '../src/shared/power-session.js';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
import {POWER_BUILD} from '../src/shared/power-build.js';

const channelId='a'.repeat(32),accountId='b'.repeat(64);
const reward={claimId:'hour-one',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:100};
const snapshot=(amount=100,claims=[reward])=>({amount,active:true,claims});
const response=value=>new Response(JSON.stringify({code:200,content:value}),{status:200});
function harness({after=snapshot(200,[]),text='통나무 파워 받기',buttonCount=1,visible=true}={}){
 let clicks=0,requests=0,enabled=true,playing=true;
 const buttons=Array.from({length:buttonCount},()=>({disabled:false,className:'live_chatting_power_button__hash',
  textContent:text,title:'',parentElement:null,hidden:false,getAttribute:()=>null,
  getClientRects:()=>visible?[{}]:[],click:()=>clicks++}));
 const doc={URL:`https://chzzk.naver.com/live/${channelId}`,querySelector:()=>({querySelectorAll:()=>buttons})};
 const h={doc,buttons,get clicks(){return clicks},get requests(){return requests},
  disable:()=>enabled=false,pause:()=>playing=false};
 h.options={channelId,claimId:reward.claimId,getDocument:()=>doc,isPlaying:()=>playing,isEnabled:()=>enabled,
  now:()=>12345,wait:async()=>{},fetcher:async(_,o)=>{
   assert.equal(o.method,'GET','hourly UI must never issue a PUT');requests++;
   return response(clicks?after:snapshot());
  }};
 return h;
}

test('hourly API adapter fails before any mutation',async()=>{
 let calls=0;await assert.rejects(claimAvailableReward(channelId,reward,async()=>{calls++;}),e=>e.code==='WATCH_UI_REQUIRED'&&e.mutationDispatched===false);
 assert.equal(calls,0);
});
test('official button click needs both claim change and sufficient balance change',async()=>{
 const h=harness();const r=await collectWatchUiReward(h.options);
 assert.equal(h.clicks,1);assert.equal(h.requests,2);assert.equal(r.collectionMethod,'official-ui');
 assert.equal(r.confirmation,'claim-and-balance');assert.equal(r.httpStatus,null);
 assert.equal(r.balanceBefore,100);assert.equal(r.balanceAfter,200);assert.equal(r.confirmedAt,12345);
});
for(const [name,after] of [['unchanged',snapshot()],['balance only',snapshot(200)],
 ['claim only',snapshot(100,[])],['insufficient balance',snapshot(150,[])]]){
 test(`click is unconfirmed for ${name}; verification never clicks again`,async()=>{
  const h=harness({after});await assert.rejects(collectWatchUiReward(h.options),e=>e.code==='WATCH_UI_UNCONFIRMED'&&e.mutationDispatched===true);
  assert.equal(h.clicks,1);assert.equal(h.requests,4);
 });
}
for(const config of [{buttonCount:0},{buttonCount:2},{visible:false},{text:'후원 보상 받기'},
 {text:'5분 통나무 파워 받기'},{text:'통나무 파워 확인'}]){
 test(`missing/ambiguous/non-hour UI waits without a click: ${JSON.stringify(config)}`,async()=>{
  const h=harness(config);await assert.rejects(collectWatchUiReward(h.options),e=>e.code==='POWER_WATCH_UI_WAIT'&&e.mutationDispatched===false);
  assert.equal(h.clicks,0);
 });
}
test('semantic fallback requires hourly reward text; arbitrary chat buttons do not match',()=>{
 const h=harness({text:'1시간 통나무 파워 받기'});h.buttons[0].className='changed-class';
 assert.equal(findWatchRewardButton(h.doc),h.buttons[0]);h.buttons[0].textContent='통나무 파워 받기';
 assert.equal(findWatchRewardButton(h.doc),null);
});
test('observed hourly delivery-complete label works with the current generic button class',async()=>{
 const h=harness({text:'1시간 시청 통나무 파워 배달 완료!100 받기'});
 h.buttons[0].className='_button_1v78k_21';
 assert.equal(findWatchRewardButton(h.doc),h.buttons[0]);
 const receipt=await collectWatchUiReward(h.options);
 assert.equal(h.clicks,1);assert.equal(receipt.confirmation,'claim-and-balance');
 assert.equal(receipt.balanceBefore,100);assert.equal(receipt.balanceAfter,200);
});
for(const text of ['통나무 파워 배달 완료!100 받기','5분 시청 통나무 파워 배달 완료!100 받기',
 '1시간 시청 후원 보상 배달 완료!100 받기','1시간 시청 통나무 파워 배달 중']){
 test(`delivery text outside an eligible hourly label is not clicked: ${text}`,async()=>{
  const h=harness({text});h.buttons[0].className='_button_1v78k_21';
  assert.equal(findWatchRewardButton(h.doc),null);
  await assert.rejects(collectWatchUiReward(h.options),e=>e.mutationDispatched===false);
  assert.equal(h.clicks,0);
 });
}
test('OFF during eligibility GET prevents click',async()=>{
 const h=harness(),fetcher=h.options.fetcher;h.options.fetcher=async(...args)=>{const r=await fetcher(...args);h.disable();return r};
 await assert.rejects(collectWatchUiReward(h.options),e=>e.mutationDispatched===false);assert.equal(h.clicks,0);
});
test('same-URL document replacement during eligibility prevents a click in the new player',async()=>{
 const h=harness(),fetcher=h.options.fetcher;let current=h.doc;
 h.options.getDocument=()=>current;
 h.options.fetcher=async(...args)=>{const response=await fetcher(...args);current={...h.doc};return response};
 await assert.rejects(collectWatchUiReward(h.options),e=>e.code==='POWER_WATCH_UI_WAIT'&&e.mutationDispatched===false);
 assert.equal(h.clicks,0);assert.equal(h.requests,1);
});
test('same-URL document replacement after click cannot confirm a receipt for the old player',async()=>{
 const h=harness();let current=h.doc;
 h.options.getDocument=()=>current;h.options.wait=async()=>{current={...h.doc}};
 await assert.rejects(collectWatchUiReward(h.options),e=>e.code==='WATCH_UI_UNCONFIRMED'&&e.mutationDispatched===true);
 assert.equal(h.clicks,1);assert.equal(h.requests,1);
});
for(const lostOwner of ['document','disabled','paused'])test(`owner lost during receipt GET stays unconfirmed: ${lostOwner}`,async()=>{
 const h=harness(),fetcher=h.options.fetcher;let current=h.doc;
 h.options.getDocument=()=>current;
 h.options.fetcher=async(...args)=>{
  const response=await fetcher(...args);
  if(h.clicks){if(lostOwner==='document')current={...h.doc};else if(lostOwner==='disabled')h.disable();else h.pause()}
  return response;
 };
 await assert.rejects(collectWatchUiReward(h.options),e=>e.code==='WATCH_UI_UNCONFIRMED'&&e.mutationDispatched===true);
 assert.equal(h.clicks,1);assert.equal(h.requests,2);
});
test('wrong selected document and paused playback make no request',async()=>{
 for(const action of [h=>h.doc.URL=`https://chzzk.naver.com/live/${'c'.repeat(32)}`,h=>h.pause()]){
  const h=harness();action(h);await assert.rejects(collectWatchUiReward(h.options));assert.equal(h.requests,0);assert.equal(h.clicks,0);
 }
});
test('post-click GET failure stays uncertain and is never a second click',async()=>{
 const h=harness(),fetcher=h.options.fetcher;h.options.fetcher=(...args)=>h.clicks?Promise.resolve(new Response(null,{status:403})):fetcher(...args);
 await assert.rejects(collectWatchUiReward(h.options),e=>e.code==='WATCH_UI_UNCONFIRMED'&&e.mutationDispatched);assert.equal(h.clicks,1);
});
function memory(){
 let data={},tail=Promise.resolve();
 return {storage:{get:async()=>structuredClone(data),set:async patch=>{data={...data,...structuredClone(patch)}}},
 locks:{request(_,opts,fn){fn||=opts;const r=tail.then(fn);tail=r.catch(()=>{});return r}},snapshot:()=>data};
}
test('concurrent/reopened collectors click once and keep durable hourly UI evidence',async()=>{
 const h=harness(),m=memory(),collector=()=>createPowerCollector({...m,fetcher:h.options.fetcher,
  watchCollector:()=>collectWatchUiReward(h.options)});
 const options={enabled:true,accountId};
 await Promise.all([collector().collect(channelId,options),collector().collect(channelId,options)]);
 await collector().collect(channelId,options);
 const state=m.snapshot()[POWER_STORAGE_KEY];assert.equal(h.clicks,1);assert.equal(state.receipts.length,1);
 assert.equal(state.receipts[0].confirmation,'claim-and-balance');assert.equal(state.attempts[0].status,'confirmed');
});
test('a later balance refresh cannot overwrite the balance that confirmed an hourly UI receipt',async()=>{
 const h=harness(),m=memory();let reads=0;
 const fetcher=async(...args)=>++reads===4?response(snapshot(150,[])):h.options.fetcher(...args);
 const c=createPowerCollector({...m,fetcher,watchCollector:()=>collectWatchUiReward({...h.options,fetcher})});
 const result=await c.collect(channelId,{enabled:true,accountId});
 const state=m.snapshot()[POWER_STORAGE_KEY];
 assert.equal(reads,4);assert.equal(h.clicks,1);assert.equal(result.collected,1);
 assert.equal(result.latestReceipt.balanceAfter,200);
 assert.equal(state.receipts[0].balanceBefore,100);assert.equal(state.receipts[0].balanceAfter,200);
 assert.equal(state.balances[0].amount,150,'the newer balance remains separately available');
});
test('uncertain hourly click and legacy pending guards survive reopening without replay',async()=>{
 for(const legacy of [false,true]){
  const h=harness({after:snapshot()}),m=memory();
  if(legacy)await m.storage.set({[POWER_STORAGE_KEY]:{version:1,receipts:[],balances:[],attempts:[{
   key:JSON.stringify([channelId,reward.claimId]),channelId,claimId:reward.claimId,status:'pending'}]}});
  const c=()=>createPowerCollector({...m,fetcher:h.options.fetcher,watchCollector:()=>collectWatchUiReward(h.options)});
  if(!legacy)await assert.rejects(c().collect(channelId,{enabled:true,accountId}));
  const r=await c().collect(channelId,{enabled:true,accountId});assert.equal(r.blocked,1);
  assert.equal(h.clicks,legacy?0:1);assert.equal(m.snapshot()[POWER_STORAGE_KEY].receipts.length,0);
 }
});
test('unavailable button removes only its unsent reservation and leaves other uncertainty',async()=>{
 const h=harness({buttonCount:0}),m=memory();
 const old={key:'legacy-uncertain',status:'unconfirmed'};
 await m.storage.set({[POWER_STORAGE_KEY]:{version:1,receipts:[],balances:[],attempts:[old]}});
 const c=createPowerCollector({...m,fetcher:h.options.fetcher,watchCollector:()=>collectWatchUiReward(h.options)});
 await assert.rejects(c.collect(channelId,{enabled:true,accountId}),e=>e.code==='POWER_WATCH_UI_WAIT');
 assert.deepEqual(m.snapshot()[POWER_STORAGE_KEY].attempts,[old]);assert.equal(h.clicks,0);
});
test('account uncertainty after a confirmed UI state does not count a receipt',async()=>{
 const h=harness(),m=memory(),c=createPowerCollector({...m,fetcher:h.options.fetcher,watchCollector:()=>collectWatchUiReward(h.options)});
 await assert.rejects(c.collect(channelId,{enabled:true,accountId,isSameAccount:async()=>false}));
 assert.equal(m.snapshot()[POWER_STORAGE_KEY].receipts.length,0);assert.equal(m.snapshot()[POWER_STORAGE_KEY].attempts[0].status,'unconfirmed');
});
test('transport uses pinned document, does not PUT, and validates UI evidence',async()=>{
 const calls=[];let bad=false;
 const transport=createPowerTransport({protocol:POWER_BUILD,targetContext:{tabId:7,documentId:'selected-document'},getChannelId:()=>channelId,
 chromeApi:{tabs:{sendMessage:async(id,m,target)=>{calls.push({id,m,target});return m.kind==='probe'?{build:POWER_BUILD,playing:true}:
  {build:POWER_BUILD,kind:'confirmed',receipt:{channelId,claimId:reward.claimId,claimType:'WATCH_1_HOUR',confirmedAt:1,
  collectionMethod:'official-ui',confirmation:'claim-and-balance',balanceBefore:100,balanceAfter:bad?100:200}}}}}});
 const r=await transport.collectWatchReward(channelId,reward);assert.equal(r.amount,100);
 assert.deepEqual(calls.at(-1).target,{documentId:'selected-document'});assert.equal(calls.at(-1).m.kind,'watch-ui');
 bad=true;await assert.rejects(transport.collectWatchReward(channelId,reward),e=>e.code==='WATCH_UI_UNCONFIRMED');
});
test('page agent refuses a raw hourly PUT; non-hour API path remains separate',async()=>{
 let puts=0;const agent=createPagePowerAgent({isPlaying:()=>true,fetcher:async(_,o)=>{
  if(o.method==='PUT')puts++;return response(snapshot());
 }});
 const r=await agent({kind:'claim',channelId,claimId:reward.claimId});assert.equal(r.error,'WATCH_UI_REQUIRED');assert.equal(r.mutationDispatched,false);assert.equal(puts,0);
});
test('UI preflight preserves 403, server Retry-After, and nonretryable schema failures',async()=>{
 for(const result of [{status:403},{status:429,retryAfterMs:180000},{status:0,schema:true}]){
  const transport=createPowerTransport({protocol:POWER_BUILD,targetContext:{tabId:7,documentId:'selected-document'},getChannelId:()=>channelId,
   chromeApi:{tabs:{sendMessage:async(_,m)=>m.kind==='probe'?{build:POWER_BUILD,playing:true}:
    {build:POWER_BUILD,error:'POWER_TRANSPORT_FAILED',mutationDispatched:false,phase:'eligibility',...result}}}});
  await assert.rejects(transport.collectWatchReward(channelId,reward),error=>{
   assert.equal(error.mutationDispatched,false);assert.equal(error.status,result.status);
   assert.equal(error.retryable,result.status===429);assert.equal(error.retryAfterMs,result.retryAfterMs||0);return true;
  });
 }
});
test('waiting for official button keeps ON; a real 403 still stops',async()=>{
 for(const status of [0,403]){
  const states=[],timers=[];const error=Object.assign(new Error('fixed'),{code:status===0?'POWER_WATCH_UI_WAIT':'WATCH_UI_PREFLIGHT_FAILED',
   status,method:'GET',retryable:status===0,mutationDispatched:false});
  const session=createPowerSession({getChannels:()=>[{id:channelId,resourceId:channelId,type:'live'}],checkAccount:async()=>accountId,
   collector:{collect:async()=>{throw error}},onStatus:s=>states.push(s),schedule:(fn,ms)=>{timers.push({fn,ms});return 1},cancel:()=>{}});
  session.start();for(let n=0;n<12;n++)await Promise.resolve();
  assert.equal(states.at(-1).enabled,status===0);assert.equal(states.at(-1).status,status===0?'watch-ui-wait':'error');
  if(status===0)assert.equal(timers.at(-1).ms,15000);session.stop();
 }
});
