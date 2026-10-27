import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {attachPowerReceiptPanel} from '../src/viewer/power-receipt-panel.js';
import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
const channel='a'.repeat(32),account='b'.repeat(64);
function collector({failPost=false,failSave=false,sameAccount=true,secondFails=false}={}){
 let data={},puts=0,writes=0;
 const storage={get:async()=>structuredClone(data),set:async p=>{if(++writes===2&&failSave)throw Error('disk');data=structuredClone(p)}};
 const c=createPowerCollector({storage,locks:{request:(_,o,fn)=>fn()},now:()=>1234,fetcher:async(_,o)=>{
  if(o.method==='PUT'){puts++;if(secondFails&&puts===2)return new Response(null,{status:403});return new Response(JSON.stringify({code:200,content:null}),{status:200})}
  if(failPost&&puts)return new Response(null,{status:503});
  return new Response(JSON.stringify({code:200,content:{active:true,amount:200,claims:(secondFails?['a','b']:['a']).map(claimId=>({claimId,claimType:'WATCH_5_MIN',state:'COMPLIED',saveType:'ACTIVE',amount:100}))}}));
 }});
 return {collect:()=>c.collect(channel,{enabled:true,accountId:account,isSameAccount:()=>sameAccount}),data:()=>data,puts:()=>puts};
}
test('receipt result follows durable success, survives zero polls, and excludes identity',async()=>{
 const h=collector();const r=await h.collect();assert.deepEqual(r.latestReceipt,{confirmedAt:1234,amount:100,httpStatus:200,applicationCode:200});assert.equal(h.data()[POWER_STORAGE_KEY].receipts.length,1);const next=await h.collect();assert.equal(next.latestReceipt,undefined);assert.equal(next.diagnostics.alreadyHandled,1);assert.equal(h.puts(),1);
});
test('post-read and later-claim failure retain only previously durable receipt',async()=>{
 for(const options of [{failPost:true},{secondFails:true}]){const h=collector(options);await assert.rejects(h.collect(),e=>{assert.equal(e.collectionResult.collected,1);assert.equal(e.collectionResult.latestReceipt.confirmedAt,1234);return true});assert.equal(h.data()[POWER_STORAGE_KEY].receipts.length,1)}
});
test('failed durable write or changed account never publishes receipt',async()=>{
 for(const options of [{failSave:true},{sameAccount:false}]){const h=collector(options);await assert.rejects(h.collect(),e=>!e.collectionResult);assert.equal(h.data()[POWER_STORAGE_KEY].receipts.length,0)}
});
test('receipt view persists through zero polls, OFF and error without claiming current account or official UI state',()=>{
 const dom=new JSDOM('<section></section>');try{const section=dom.window.document.querySelector('section');const panel=attachPowerReceiptPanel({section,document:dom.window.document});const r={confirmedAt:1234,amount:100,httpStatus:200,applicationCode:200};panel.update({result:{collected:1,latestReceipt:r}},'Test');const text=section.textContent;assert.match(text,/제공 보상량 \+100/);assert.match(text,/현재 계정·잔액 또는 공식 받기 버튼의 갱신을 뜻하지 않습니다/);for(const state of [{status:'checked',result:{collected:0}},{status:'off'},{status:'error'},{result:{collected:1,latestReceipt:{...r,httpStatus:403}}},{result:{collected:1,latestReceipt:{...r,confirmedAt:1}}}]){panel.update(state,'Other');assert.equal(section.textContent,text)}}finally{dom.window.close()}
});
