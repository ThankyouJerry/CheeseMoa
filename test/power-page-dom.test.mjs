import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createPowerCoordinator,safePowerError} from '../src/background/power-coordinator.js';
import {memoryStore,memoryLocks,flushRuntime,simChannel} from '../dev/power-runtime-simulation.js';
import {POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
const source=await readFile(new URL('../src/viewer/power-page.js',import.meta.url),'utf8');
for(const mode of ["normal","post-fail","pending-start"])test(`real generated page UI lifecycle (${mode})`,async()=>{
 const failPostRead=mode==='post-fail';let releaseStart;
 const dom=new JSDOM('<title>포포 모의 방송</title><video></video>',{url:`https://chzzk.naver.com/live/${simChannel}`,runScripts:'outside-only'});
 const local=memoryStore(),session=memoryStore(),locks=memoryLocks(),listeners=new Set();let puts=0,poll,postFailed=false;
 dom.window.setInterval=fn=>{poll=fn;return 1};dom.window.clearInterval=()=>{};
 const sender={id:'test',frameId:0,tab:{id:1},documentId:'doc',url:dom.window.location.href};
 const api={runtime:{id:'test'},storage:{local,session},tabs:{sendMessage:(_,m)=>new Promise(resolve=>{for(const fn of listeners)fn(m,{id:'test',url:'chrome-extension://test/src/background/power-worker.js'},resolve)})}};
 const coordinator=createPowerCoordinator({chromeApi:api,locks});
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},sendMessage:async m=>{try{const result=await coordinator.handle(m,{...sender,url:dom.window.location.href});if(mode==='pending-start'&&m.action==='start')await new Promise(resolve=>releaseStart=resolve);return {ok:true,result}}catch(e){return {ok:false,error:safePowerError(e)}}}}};
 dom.window.AbortSignal=AbortSignal;
 dom.window.fetch=async(url,o)=>{if(o.method==='PUT'){puts++;return new Response(null,{status:204})}if(failPostRead&&puts&&!url.includes('getUserStatus')&&!postFailed){postFailed=true;return new Response(null,{status:503})}return new Response(JSON.stringify({code:200,content:url.includes('getUserStatus')?{loggedIn:true,userIdHash:'test_account_123'}:{active:true,amount:100,claims:[{claimId:'one',claimType:'WATCH_1_HOUR',saveType:'ACTIVE',state:'COMPLIED'}]}}))};
 const video=dom.window.document.querySelector('video');Object.defineProperties(video,{paused:{value:false},readyState:{value:4}});
 try{
  dom.window.eval(source);await flushRuntime();
  const root=dom.window.document.getElementById('cheesemoa-power-control').shadowRoot;
  const button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
  assert.equal(listeners.size,1);assert.match(root.querySelector('[role=status]').textContent,/OFF/);assert.equal(puts,0);
  const settled=async()=>{for(let i=0;i<200;i++){await flushRuntime();if(!/확인 중|연결 중/.test(root.querySelector('[role=status]').textContent))return}assert.fail('UI did not settle')};
  button('자동수령 ON').click();
  if(mode==='pending-start'){await flushRuntime();assert.equal(button('자동수령 OFF').disabled,false);button('자동수령 OFF').click();await flushRuntime();assert.equal(session.snapshot()['cheesemoa.power.owner.v1'].enabled,false);releaseStart();await flushRuntime();assert.equal(puts,0);assert.match(root.querySelector('[role=status]').textContent,/OFF/);return}
  await settled();assert.equal(puts,1,root.textContent);assert.match(root.querySelector('[role=status]').textContent,failPostRead?/ON.*재조회 대기/:/ON.*응답 확인/);assert.match(root.textContent,/이 실행의 확정 수령 1건/);assert.equal(local.snapshot()[POWER_STORAGE_KEY].receipts.length,1);assert.match(root.querySelector('.power-receipt').textContent,/최근 서버 수령 확인.*HTTP 204/);if(!failPostRead)assert.match(root.textContent,/서버 보상 목록 1건 · 지원 적격 1건 · 제외 0건/);
  button('패널 숨기기').click();assert.equal(root.querySelector('section').hidden,true);assert.match(root.querySelector('[role=status]').textContent,/ON/);assert.equal(session.snapshot()['cheesemoa.power.owner.v1'].enabled,true);assert.equal(puts,1);button('🪵 자동수령 패널 표시').click();assert.equal(root.querySelector('section').hidden,false);assert.equal(puts,1);
  dom.window.history.pushState({},'',`/live/${'c'.repeat(32)}`);poll();await flushRuntime();
  assert.match(root.querySelector('[role=status]').textContent,/OFF/);
  assert.equal(session.snapshot()['cheesemoa.power.owner.v1'].enabled,false);
  dom.window.history.pushState({},'',`/live/${simChannel}`);poll();await flushRuntime();
  assert.match(root.querySelector('[role=status]').textContent,/OFF/);
  button('자동수령 ON').click();await settled();assert.equal(puts,1);
  const event=type=>{const e=new dom.window.Event(type);Object.defineProperty(e,'persisted',{value:true});dom.window.dispatchEvent(e)};
  event('pagehide');assert.equal(listeners.size,0);assert.match(root.querySelector('[role=status]').textContent,/OFF/);
  event('pageshow');event('pageshow');await settled();assert.equal(listeners.size,1);assert.match(root.querySelector('[role=status]').textContent,/ON/);assert.equal(puts,1);
  button('자동수령 OFF').click();await flushRuntime();event('pagehide');event('pageshow');await flushRuntime();
  assert.equal(listeners.size,1);assert.match(root.querySelector('[role=status]').textContent,/OFF/);assert.equal(puts,1);
  button('자동수령 ON').click();await settled();
  await coordinator.handle({action:'start',channelId:simChannel,startRequestId:'other-tab-start-request'},{...sender,tab:{id:2},documentId:'another'});await flushRuntime();
  assert.match(root.querySelector('[role=status]').textContent,/OFF/);assert.equal(puts,1);
 }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close()}
});
