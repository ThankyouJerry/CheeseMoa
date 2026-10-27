import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createPowerCoordinator,safePowerError} from '../src/background/power-coordinator.js';
import {POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
const channelId='a'.repeat(32);
const source=await readFile(new URL('../src/viewer/power-page.js',import.meta.url),'utf8');
function store(){let data={};return {get:async key=>({[key]:structuredClone(data[key])}),
 set:async patch=>{data={...data,...structuredClone(patch)}},snapshot:()=>data};}
function locks(){const tails=new Map();return {request(name,opts,fn){fn||=opts;
 const r=(tails.get(name)||Promise.resolve()).then(fn);tails.set(name,r.catch(()=>{}));return r}};}
for(const confirms of [true,false])test(`generated content bundle: official UI ${confirms?'server verified':'uncertain'}; no hourly PUT`,async()=>{
 const dom=new JSDOM('<video></video><aside id="aside-chatting"><button class="_button_1v78k_21">1시간 시청 통나무 파워 배달 완료!100 받기</button></aside>',
  {url:`https://chzzk.naver.com/live/${channelId}`,runScripts:'outside-only'});
 const local=store(),session=store(),listeners=new Set();let clicks=0,puts=0;
 const browserSender={id:'test',frameId:0,tab:{id:7},documentId:'selected-doc',url:dom.window.location.href};
 const api={runtime:{id:'test'},storage:{local,session},tabs:{sendMessage:(_,m)=>new Promise(resolve=>{
  for(const listener of listeners)listener(m,{id:'test',url:'chrome-extension://test/src/background/power-worker.js'},resolve);
 })}};
 const coordinator=createPowerCoordinator({chromeApi:api,locks:locks()});
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,
  onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
  sendMessage:async m=>{try{return {ok:true,result:await coordinator.handle(m,browserSender)}}catch(e){return {ok:false,error:safePowerError(e)}}}}};
 dom.window.AbortSignal=AbortSignal;
 const originalTimeout=dom.window.setTimeout.bind(dom.window);
 dom.window.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===1000?0:ms,...args);
 dom.window.setInterval=()=>1;dom.window.clearInterval=()=>{};
 dom.window.fetch=async(url,options)=>{
  if(options.method==='PUT'){puts++;assert.fail('hourly PUT must not occur')}
  const content=url.includes('getUserStatus')?{loggedIn:true,userIdHash:'mock_account_123'}:
   {active:true,amount:clicks&&confirms?200:100,claims:clicks&&confirms?[]:
    [{claimId:'hour-one',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:100}]};
  return new Response(JSON.stringify({code:200,content}));
 };
 const video=dom.window.document.querySelector('video');Object.defineProperties(video,{paused:{value:false},readyState:{value:4}});
 const official=dom.window.document.querySelector('aside button');official.getClientRects=()=>[{}];official.onclick=()=>clicks++;
 try{
  dom.window.eval(source);
  const root=dom.window.document.querySelector('#cheesemoa-power-control').shadowRoot;
  const on=[...root.querySelectorAll('button')].find(b=>b.textContent==='자동수령 ON');
  const settled=async()=>{for(let n=0;n<150;n++){
   await new Promise(resolve=>setTimeout(resolve,2));
   if(!/확인 중|연결 중/.test(root.querySelector('[role=status]').textContent))return;
  }assert.fail('content UI did not settle')};
  await settled();assert.equal(clicks,0,'new test copy must not silently start');
  on.click();await settled();assert.equal(clicks,1);assert.equal(puts,0);
  const state=local.snapshot()[POWER_STORAGE_KEY];
  assert.equal(state.receipts.length,confirms?1:0);
  assert.equal(state.attempts[0].status,confirms?'confirmed':'unconfirmed');
  if(confirms){assert.match(root.querySelector('.power-receipt').textContent,/공식 받기 UI.*100 → 200/);assert.doesNotMatch(root.querySelector('.power-receipt').textContent,/HTTP 200/)}
  else{assert.match(root.textContent,/성공으로 기록하지 않았고/);on.click();await settled();assert.equal(clicks,1,'uncertain claim must not be clicked again')}
 }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close()}
});
