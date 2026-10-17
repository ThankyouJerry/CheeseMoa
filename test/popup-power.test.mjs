import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {bindPopupPower} from '../src/popup/popup-power.js';
import {checkPowerAccount} from '../src/shared/login-session.js';
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}assert.fail('UI did not settle');}
test('popup reads scoped totals, unknown amounts, legacy and uncertain history; errors never become zero',async()=>{
 const dom=new JSDOM(await readFile(new URL('../src/popup/popup.html',import.meta.url),'utf8'));
 const saved=new Map(['document','window','navigator','chrome','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let fail=false,data={},calls=[];
 globalThis.document=dom.window.document;globalThis.window=dom.window;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_,options,fn)=>(fn||options)()}}});
 globalThis.chrome={storage:{local:{get:async()=>structuredClone(data)}}};
 globalThis.fetch=async(url,options)=>{calls.push(options.method);if(fail)throw new Error('offline');return {ok:true,json:async()=>({code:200,content:{loggedIn:true,userIdHash:'fixture123'}})};};
 try{
  const accountId=await checkPowerAccount();const channelId='a'.repeat(32);
  data={'cheesemoa.power.v1':{version:1,receipts:[{accountId,channelId,claimId:'1',amount:100,confirmedAt:1},{accountId,channelId,claimId:'2',amount:null,confirmedAt:2},{accountId:'b'.repeat(64),channelId,claimId:'3',amount:999,confirmedAt:3},{channelId,claimId:'4',amount:500,confirmedAt:4}],attempts:[{accountId,key:'unknown',channelId,status:'unconfirmed',attemptedAt:5}],balances:[{accountId,channelId,amount:12345,checkedAt:6}]}};
  bindPopupPower(()=>[{resourceId:channelId,streamerName:'<img src=x> 테스트'}]);
  const total=document.querySelector('#popup-power-total');
  await until(()=>total.textContent.includes('100 파워'));
  assert.match(total.textContent,/100 파워 · 2건 · 이 중 1건 금액 미확인/);
  assert.match(document.querySelector('#popup-power-balances').textContent,/12,345/);
  assert.match(document.querySelector('#popup-power-history').textContent,/합계 제외/);
  assert.match(document.querySelector('#popup-power-history').textContent,/수령 여부 미확인/);
  assert.equal(document.querySelector('#popup-power-balances img'),null);
  assert.ok(calls.every(m=>m==='GET'));
  fail=true;document.querySelector('#popup-power-refresh').click();
  await until(()=>document.querySelector('#popup-power-status').textContent.includes('조회 실패'));
  assert.equal(total.textContent,'미확인');
  assert.equal(document.querySelector('#popup-power-balances').children.length,0);
 }finally{dom.window.close();for(const[k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
