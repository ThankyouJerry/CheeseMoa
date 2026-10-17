import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {createPowerTransport} from '../src/shared/power-transport.js';
import {createPowerSession} from '../src/shared/power-session.js';
const channel='a'.repeat(32),account='b'.repeat(64),url='https://chzzk.naver.com/live/'+channel;
const reward={claimId:'new',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:10};
const power=()=>new Response(JSON.stringify({code:200,content:{active:true,amount:100,claims:[reward]}}));
const options={enabled:true,accountId:account};
const flush=()=>new Promise(r=>setImmediate(r));
function storage(){let data={};return {get:async()=>structuredClone(data),set:async p=>{data=structuredClone(p)},data:()=>data[POWER_STORAGE_KEY]};}
const locks={request:async(_,o,fn)=>fn()};
test('identity GET exception after reservation clears only this proven-unsent reservation',async()=>{
 const st=storage();const old={key:JSON.stringify([account,channel,'old']),accountId:account,channelId:channel,claimId:'old',status:'unconfirmed'};
 await st.set({[POWER_STORAGE_KEY]:{version:1,receipts:[],attempts:[old],balances:[]}});
 let puts=0,checks=0;
 const c=createPowerCollector({storage:st,locks,fetcher:async(_,o)=>{if(o.method==='PUT'){puts++;return new Response(null,{status:204})}return power()}});
 await assert.rejects(c.collect(channel,{...options,isCurrent:()=>{if(++checks===4)throw new Error('account GET failed');return true}}),/account GET/);
 assert.equal(puts,0);assert.deepEqual(st.data().attempts,[old]);
 await c.collect(channel,options);assert.equal(puts,1);assert.equal(st.data().receipts.length,1);assert.deepEqual(st.data().attempts[0],old);
});
for(const failure of [503,429,403,'timeout'])test(`host preflight ${failure} is proven unsent, separately classified, and keeps old uncertainty`,async()=>{
 const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
 const dom=new JSDOM('<body/>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 let listener,reads=0,puts=0,fail=true;
 dom.window.AbortSignal=AbortSignal;dom.window.setInterval=()=>1;dom.window.clearInterval=()=>{};
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn,removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url}]})}}};
 dom.window.fetch=async(_,o)=>{if(o.method==='PUT'){puts++;return new Response(null,{status:204})}if(++reads===2&&fail){if(failure==='timeout')throw Object.assign(new Error('timeout'),{name:'TimeoutError'});return new Response(null,{status:failure,headers:{'Retry-After':'120'}})}return power()};
 try{
  dom.window.eval(source);await flush();const root=dom.window.document.getElementById('cheesemoa-site-host').shadowRoot;
  [...root.querySelectorAll('button')].find(b=>b.textContent==='방송 시작').click();
  Object.defineProperty(root.querySelector('iframe'),'contentDocument',{value:{querySelectorAll:()=>[{paused:false,readyState:4}]}});
  const chromeApi={tabs:{query:async()=>[{id:1,url:'https://chzzk.naver.com/lives#cheesemoa-multiview'}],sendMessage:async(_,m)=>new Promise(resolve=>listener(m,{id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},resolve))}};
  const t=createPowerTransport({chromeApi,getChannelId:()=>channel});const st=storage();const c=createPowerCollector({storage:st,locks,fetcher:t.fetcher});
  await assert.rejects(c.collect(channel,options),e=>{assert.equal(e.mutationDispatched,false);assert.equal(e.method,'GET');assert.equal(e.retryable,failure!==403);if(failure===429)assert.equal(e.retryAfterMs,120000);return true});
  assert.equal(puts,0);assert.equal(st.data().attempts.length,0);assert.equal(st.data().receipts.length,0);
  if(failure!==403){fail=false;await c.collect(channel,options);assert.equal(puts,1);assert.equal(st.data().receipts.length,1);}
 }finally{dom.window.close()}
});
function blockedLock(){let blocked=true,waiting=[];return {release(){blocked=false;const q=waiting;waiting=[];q.forEach(f=>f())},request(_,opts,fn){if(!blocked)return Promise.resolve().then(fn);return new Promise((resolve,reject)=>{const abort=()=>reject(new DOMException('aborted','AbortError'));opts.signal.addEventListener('abort',abort,{once:true});if(opts.signal.aborted)return abort();waiting.push(()=>{opts.signal.removeEventListener('abort',abort);if(!opts.signal.aborted)resolve(fn())})})}}}
test('lock deadline ends checking, OFF cancels waiting, and released lock permits explicit restart',async()=>{
 const lock=blockedLock(),st=storage(),timers=new Map();let id=0,reads=0;const states=[];
 const collector=createPowerCollector({storage:st,locks:lock,fetcher:async()=>{reads++;return new Response(JSON.stringify({code:200,content:{active:false,amount:100,claims:[]}}))},schedule:fn=>{timers.set(++id,fn);return id},cancel:i=>timers.delete(i)});
 const session=createPowerSession({collector,getChannels:()=>[{id:'x',resourceId:channel,type:'live'}],checkAccount:async()=>account,onStatus:s=>states.push(s)});
 session.start();await flush();assert.equal(timers.size,1);[...timers.values()][0]();await flush();
 assert.equal(states.at(-1).enabled,false);assert.match(states.at(-1).detail,/기다리다 중단/);assert.equal(reads,0);
 session.start();await flush();session.stop();await flush();assert.equal(states.at(-1).status,'off');assert.equal(timers.size,0);
 lock.release();await flush();assert.equal(reads,0);
 session.start();await flush();assert.equal(states.at(-1).status,'inactive');assert.equal(reads,1);session.stop();
});
test('OFF cannot release an already acquired mutation lock',async()=>{
 let held=false,completePut;const st=storage();const controller=new AbortController();
 const lock={request:async(_,o,fn)=>{held=true;try{return await fn()}finally{held=false}}};
 const collector=createPowerCollector({storage:st,locks:lock,fetcher:async(_,o)=>o.method==='PUT'?new Promise(r=>completePut=()=>r(new Response(null,{status:204}))):power()});
 const run=collector.collect(channel,{...options,signal:controller.signal});await flush();assert.equal(held,true);controller.abort();assert.equal(held,true);
 completePut();await run;assert.equal(held,false);assert.equal(st.data().receipts.length,1);
});
