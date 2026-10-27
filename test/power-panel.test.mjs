import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {bindPowerPanel} from '../src/viewer/power-panel.js';
import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {checkPowerAccount} from '../src/shared/login-session.js';
import {memoryStore,memoryLocks,flushRuntime} from '../dev/power-runtime-simulation.js';
test('legacy manager reads scoped receipts but cannot start a competing collector, including after page restore',async()=>{
 const dom=new JSDOM(await readFile(new URL('../src/viewer/viewer.html',import.meta.url),'utf8'));
 const saved=new Map(['window','document','navigator','chrome','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const store=memoryStore(),locks=memoryLocks(),channel='a'.repeat(32);let puts=0;
 const fetcher=async(url,o={})=>{if(o.method==='PUT'){puts++;return new Response(null,{status:204})}return new Response(JSON.stringify({code:200,content:url.includes('getUserStatus')?{loggedIn:true,userIdHash:'account_test_123'}:{active:true,amount:100,claims:[{claimId:'one',claimType:'WATCH_5_MIN',saveType:'ACTIVE',state:'COMPLIED',amount:10}]}}))};
 const account=await checkPowerAccount(fetcher);await createPowerCollector({storage:store,locks,fetcher}).collect(channel,{enabled:true,accountId:account});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.chrome={storage:{local:store}};globalThis.fetch=fetcher;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 try{
  const dialog=document.querySelector('#power-dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
  bindPowerPanel(()=>[{id:'main',resourceId:channel,type:'live',streamerName:'포포 테스트'}]);
  document.querySelector('#power-button').click();await flushRuntime();
  const selector=document.querySelector('#power-main-channel');selector.value='main';selector.dispatchEvent(new dom.window.Event('change'));
  document.querySelector('#power-refresh').click();
  for(let i=0;i<200&&!/획득 확인/.test(document.querySelector('#power-history').textContent);i++)await flushRuntime();
  const toggle=document.querySelector('#power-enabled');assert.equal(toggle.disabled,true);
  toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));assert.equal(toggle.checked,false);
  assert.equal(puts,1);assert.match(document.querySelector('#power-history').textContent,/획득 확인.*\+10/);
  assert.match(document.querySelector('#power-status').textContent,/방송 화면/);
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.dispatchEvent(new dom.window.Event('pageshow'));await flushRuntime();
  assert.equal(toggle.disabled,true);assert.equal(toggle.checked,false);assert.equal(puts,1);assert.equal(store.snapshot()[POWER_STORAGE_KEY].receipts.length,1);
 }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();for(const[k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});
