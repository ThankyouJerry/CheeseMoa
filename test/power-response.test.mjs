import test from 'node:test';
import assert from 'node:assert/strict';
import {claimAvailableReward,readLogPower} from '../src/shared/log-power.js';
import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {POWER_BUILD} from '../src/shared/power-build.js';
import {formatPowerDiagnostic} from '../src/shared/power-summary.js';
const channel='a'.repeat(32),account='b'.repeat(64);
const reward={claimId:'one',claimType:'WATCH_5_MIN',state:'COMPLIED',saveType:'ACTIVE',amount:120};
const claim=(response)=>claimAvailableReward(channel,reward,async()=>response,()=>99);
for(const status of [200,201,204,205]) test(`PUT ${status} empty success is distinct from GET's required JSON`,async()=>{
 const r=await claim(new Response(null,{status}));assert.equal(r.httpStatus,status);assert.equal(r.amount,120);
 await assert.rejects(readLogPower(channel,async()=>new Response(null,{status})),e=>e.errorCode==='EMPTY_GET_RESPONSE');
});
test('valid success JSON is required for a non-empty PUT; explicit business errors never become success',async()=>{
 const r=await claim(new Response(JSON.stringify({code:200,content:null}),{status:201}));assert.equal(r.applicationCode,200);
 for(const status of [200,201,202]) await assert.rejects(claim(new Response(JSON.stringify({code:403,message:'SECRET_TOKEN'}),{status})),e=>e.httpStatus===status&&e.applicationCode===403&&e.errorCode==='APPLICATION_ERROR'&&!e.message.includes('SECRET'));
 for(const body of ['<html>login</html>','{}','null','{"code":200,"success":false}','{"code":200,"error":"SECRET"}','{"code":200,"errorCode":"FORBIDDEN"}','{"ok":true}','{"code":"SECRET_TOKEN"}']) await assert.rejects(claim(new Response(body)),e=>!e.retryable&&!e.message.includes('SECRET'));
 for(const status of [202,203,206,207,299]) await assert.rejects(claim(new Response(null,{status})),e=>e.errorCode==='PENDING_OR_UNEXPECTED_STATUS');
});
test('HTTP denial and business code are separately available without retaining server messages',async()=>{
 await assert.rejects(claim(new Response(JSON.stringify({code:1234,message:'cookie=SECRET'}),{status:403})),e=>e.httpStatus===403&&e.applicationCode===1234&&e.status===403&&!e.message.includes('SECRET'));
 await assert.rejects(claim({ok:true,status:200,text:async()=>{throw new Error('SECRET');}}),e=>e.httpStatus===200&&e.errorCode==='BODY_READ_ERROR');
});
function harness(initial={}){
 let data=structuredClone(initial),getCount=0,puts=0;
 let put=()=>new Response(null,{status:204});let failAfter=false;
 const storage={get:async()=>structuredClone(data),set:async p=>{data={...data,...structuredClone(p)};}};
 const make=()=>createPowerCollector({storage,locks:{request:(_,options,fn)=>(fn||options)()},now:()=>1234,fetcher:async(_,o)=>{
  if(o.method==='PUT'){puts++;return put();}getCount++;
  if(failAfter&&puts)throw new Error('SECRET_NETWORK');
  return new Response(JSON.stringify({code:200,content:{amount:puts?1150:1000,active:true,claims:[reward]}}));
 }});
 return {make,get data(){return data;},get puts(){return puts;},set put(fn){put=fn;},set failAfter(v){failAfter=v;}};
}
test('empty HTTP success persists offered amount separately from post-claim balance and avoids duplicates',async()=>{
 const h=harness();await h.make().collect(channel,{enabled:true,accountId:account});
 const s=h.data[POWER_STORAGE_KEY];assert.equal(s.receipts[0].amount,120);assert.equal(s.receipts[0].balanceAfter,1150);assert.equal(s.receipts[0].httpStatus,204);assert.equal(s.receipts[0].build,POWER_BUILD);
 await h.make().collect(channel,{enabled:true,accountId:account});assert.equal(h.puts,1);
});
test('failed post-read does not erase a confirmed empty-HTTP receipt or fabricate a balance',async()=>{
 const h=harness();h.failAfter=true;await assert.rejects(h.make().collect(channel,{enabled:true,accountId:account}));
 const s=h.data[POWER_STORAGE_KEY];assert.equal(s.receipts.length,1);assert.equal(s.receipts[0].balanceAfter,undefined);assert.equal(s.balances[0].beforeCollection,true);
});
test('failure saves only safe diagnostics and old uncertain keys survive a new build without PUT',async()=>{
 const h=harness();h.put=()=>new Response(JSON.stringify({code:403,message:'cookie=SECRET',token:'SECRET'}),{status:403});
 await assert.rejects(h.make().collect(channel,{enabled:true,accountId:account}));
 const s=h.data[POWER_STORAGE_KEY],a=s.attempts[0];assert.equal(a.claimType,'WATCH_5_MIN');assert.equal(a.httpStatus,403);assert.equal(a.applicationCode,403);assert.equal(a.errorCode,'HTTP_ERROR');assert.equal(a.build,POWER_BUILD);assert.equal(a.failedAt,1234);assert.equal(s.receipts.length,0);assert.ok(!JSON.stringify(s).includes('SECRET'));
 const legacy={...a};delete legacy.claimType;delete legacy.httpStatus;delete legacy.applicationCode;delete legacy.errorCode;delete legacy.build;delete legacy.failedAt;
 const reopened=harness({[POWER_STORAGE_KEY]:{version:1,receipts:[],attempts:[legacy]}});
 await reopened.make().collect(channel,{enabled:true,accountId:account});assert.equal(reopened.puts,0);assert.deepEqual(reopened.data[POWER_STORAGE_KEY].attempts,[legacy]);
 assert.match(formatPowerDiagnostic(legacy),/HTTP 미기록.*요청 실행 미기록/);
});
