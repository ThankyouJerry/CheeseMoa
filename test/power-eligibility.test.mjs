import test from "node:test";
import assert from "node:assert/strict";
import {readLogPower, claimAvailableReward, PowerRequestError, REWARD_TYPES} from "../src/shared/log-power.js";
import {createPowerCollector, POWER_STORAGE_KEY} from "../src/shared/power-collector.js";
import {createPowerSession} from "../src/shared/power-session.js";
const channel = "a".repeat(32), account = "b".repeat(64);
const reward = {claimId: "one", claimType: "WATCH_5_MIN", state: "COMPLIED", saveType: "ACTIVE", amount: 120};
const response = content => ({ok: true, json: async () => ({code: 200, content})});
const flush = () => new Promise(resolve => setImmediate(resolve));

test("only explicitly available known rewards can be claimed; no passive, unknown or prediction rewards", async () => {
  const eligible = Object.keys(REWARD_TYPES).map((claimType,i) => ({...reward, claimType, claimId: String(i+1)}));
  const rejected = [{...reward,state: "WAITING"}, {...reward,state: undefined}, {...reward,saveType: undefined},
    {...reward,saveType: "PASSIVE"}, {...reward,claimType: "PREDICTION"}, {...reward,claimType: "NEW_UNKNOWN"},
    {...reward,claimId: ""}, {...reward,claimId: {}}, {...reward,claimType: "toString"}];
  const read = await readLogPower(channel, async () => response({amount: 0, active: true, claims:[...eligible,...rejected]}));
  assert.deepEqual(read.claims, eligible);
  let puts = 0;
  for (const r of rejected) await assert.rejects(claimAvailableReward(channel,r, () => {puts++;}));
  for (const r of read.claims) {
    if(r.claimType==='WATCH_1_HOUR'){
      await assert.rejects(claimAvailableReward(channel,r,()=>{puts++;}),e=>e.code==='WATCH_UI_REQUIRED');
      continue;
    }
    const receipt = await claimAvailableReward(channel,r, async (_,o) => {assert.equal(o.method,"PUT"); puts++; return response(null);});
    assert.equal(receipt.claimType,r.claimType);
    assert.equal(receipt.amount,120);
  }
  assert.equal(puts, eligible.length-1);
});
test("numeric IDs normalize but malformed or unconfirmed amounts are not guessed", async () => {
  const read = await readLogPower(channel, async () => response({amount: 0,active:true,claims:[{...reward,claimId:123,amount:undefined}]}));
  assert.equal(read.claims[0].claimId,"123");
  assert.equal(read.claims[0].amount,null);
});
test("transient GET and Retry-After are distinguished from all uncertain PUTs", async () => {
  for (const status of [408,429,500,503]) {
    const fetcher = async () => ({ok:false,status,headers:{get:()=>"180"}});
    await assert.rejects(readLogPower(channel,fetcher), e=>e.method==="GET" && e.retryable && e.retryAfterMs===180000);
    await assert.rejects(claimAvailableReward(channel,reward,fetcher),e=>e.method==="PUT" && !e.retryable);
  }
  for (const status of [401,403,404,409]) await assert.rejects(readLogPower(channel,async()=>({ok:false,status})),e=>!e.retryable);
  await assert.rejects(readLogPower(channel,async()=>{throw new TypeError("offline");}),e=>e.retryable && e.status===0);
  await assert.rejects(readLogPower(channel,async()=>response({amount:"12"})),e=>!e.retryable && e.status==="schema");
});
function harness() {
  const h={data:{},calls:[],amount:1000,readError:null,afterError:null,account:true};
  let queue=Promise.resolve();
  const storage={get:async()=>structuredClone(h.data),set:async p=>{h.data={...h.data,...structuredClone(p)};}};
  const locks={request:(_,options,fn)=>{const p=queue.then(fn||options); queue=p.catch(()=>{});return p;}};
  h.fetcher=async (url,{method})=>{
    h.calls.push(method);
    if(method==="PUT") { h.amount=1120; return response(null); }
    if(h.readError || (h.amount===1120 && h.afterError)) throw (h.readError || h.afterError);
    return response({amount:h.amount,active:true,claims:[reward]});
  };
  h.create=()=>createPowerCollector({storage,locks,fetcher:h.fetcher,now:()=>123});
  h.options={enabled:true,accountId:account,isSameAccount:()=>h.account};
  return h;
}
test("confirmed receipt and actual post-claim balance are separate from the offered amount", async()=>{
  const h=harness(), c=h.create();
  const result=await c.collect(channel,h.options);
  assert.deepEqual(h.calls,["GET","PUT","GET"]);
  assert.equal(result.balance,1120);
  const state=await c.history(account);
  assert.equal(state.receipts[0].amount,120);
  assert.equal(state.receipts[0].balanceAfter,1120);
  assert.equal(state.balances[0].amount,1120);
  assert.equal(state.balances[0].beforeCollection,false);
});
test("balance GET failure keeps PUT success and retry reads without duplicate collection", async()=>{
  const h=harness(), c=h.create();h.afterError=new TypeError("offline");
  await assert.rejects(c.collect(channel,h.options),e=>e.retryable && e.collectionResult.collected===1);
  let state=await c.history(account);
  assert.equal(state.receipts.length,1);
  assert.equal(state.receipts[0].balanceAfter,undefined);
  assert.equal(state.balances[0].beforeCollection,true);
  h.afterError=null;
  await c.collect(channel,h.options);
  assert.equal(h.calls.filter(m=>m==="PUT").length,1);
  state=await c.history(account);
  assert.equal(state.balances[0].amount,1120);
  assert.equal(state.balances[0].beforeCollection,false);
});
test("account histories do not leak balance snapshots to another account",async()=>{
  const h=harness(),c=h.create(); await c.collect(channel,h.options);
  assert.equal((await c.history("c".repeat(64))).balances.length,0);
});
test("account or channel change during a balance GET does not publish the new account balance",async()=>{
  const h=harness();let current=true;const base=h.fetcher;
  h.fetcher=async(...args)=>{const r=await base(...args); if(h.calls.join()==="GET,PUT,GET") current=false; return r;};
  const result=await h.create().collect(channel,{...h.options,isCurrent:()=>current});
  assert.equal(result.status,"disabled"); assert.equal(result.balance,undefined);
  assert.equal((await h.create().history(account)).balances[0].beforeCollection,true);
});
test("parallel collectors keep a single PUT even for newly supported FOLLOW rewards",async()=>{
  const h=harness();const base=h.fetcher;
  h.fetcher=async(...args)=>{const r=await base(...args);const old=r.json; r.json=async()=>{const j=await old();if(j.content?.claims) j.content.claims[0]={...reward,claimType:"FOLLOW"};return j;}; return r;};
  await Promise.all([h.create(),h.create()].map(c=>c.collect(channel,h.options)));
  assert.equal(h.calls.filter(m=>m==="PUT").length,1);
});
function sessionHarness(error) {
  const h={error,status:[],delays:[],timer:null,time:1000,calls:0};
  h.session=createPowerSession({collector:{collect:async()=>{h.calls++;if(h.error)throw h.error;return{collected:0,balance:20};}},
    checkAccount:async()=>account,getChannels:()=>[{id:"live:a",type:"live",resourceId:channel}],onStatus:s=>h.status.push(s),
    now:()=>h.time,schedule:(fn,delay)=>{h.timer=fn;h.delays.push(delay);return 1;},cancel:()=>{h.timer=null;}});
  h.run=async()=>{const fn=h.timer;h.time+=h.delays.at(-1);h.timer=null;await fn();};
  return h;
}
test("GET retries back off, obey Retry-After, recover, and stop after five retries",async()=>{
  const h=sessionHarness(new PowerRequestError(429,{method:"GET",retryAfterMs:180000}));
  h.session.start();await flush();
  assert.equal(h.status.at(-1).status,"waiting");assert.equal(h.delays[0],180000);
  h.error=null;await h.run();assert.equal(h.status.at(-1).status,"checked");assert.equal(h.delays.at(-1),60000);
  h.error=new PowerRequestError(503,{method:"GET"});
  for(let i=0;i<6;i++)await h.run();
  assert.equal(h.timer,null);assert.equal(h.status.at(-1).enabled,false);
  assert.match(h.status.at(-1).detail,/재시도 한도/);
});
test("turning off cancels a waiting retry and opening a new session remains off",async()=>{
  const h=sessionHarness(new PowerRequestError(0,{method:"GET"}));
  assert.equal(h.calls,0);h.session.start();await flush();h.session.stop();
  assert.equal(h.timer,null);assert.equal(h.calls,1);
});
test("PUT 429 and PUT network uncertainty stop, while authentication is distinct",async()=>{
  for(const status of [0,429,503,401]) {
    const h=sessionHarness(new PowerRequestError(status,{method:"PUT"}));h.session.start();await flush();
    assert.equal(h.timer,null);assert.equal(h.status.at(-1).enabled,false);
    assert.equal(h.status.at(-1).status,status===401?"auth-required":"error");
  }
});
test("stop during the final async identity check cannot reach collector",async()=>{
  let checks=0,release,calls=0;
  const session=createPowerSession({collector:{collect:()=>{calls++;}},getChannels:()=>[{id:"a",type:"live",resourceId:channel}],
    checkAccount:async()=>++checks===2?new Promise(r=>{release=r;}):account,
    onStatus:()=>{},schedule:()=>assert.fail("no timer"),cancel:()=>{}});
  session.start();await flush();session.stop();release(account);await flush();assert.equal(calls,0);
});
