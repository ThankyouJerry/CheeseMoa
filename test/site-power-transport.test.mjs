import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
const channel='a'.repeat(32),url='https://chzzk.naver.com/live/'+channel;
test('page transport restricts sender, rechecks eligibility, excludes manual claim and never retries 403',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 let listener,eligible=false,putStatus=204,calls=[];
 dom.window.AbortSignal=AbortSignal;
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn,removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url}]})}}};
 dom.window.fetch=async(u,o)=>{calls.push({u,o});return o.method==='PUT'?new Response(null,{status:putStatus}):new Response(JSON.stringify({code:200,content:{active:true,amount:123,claims:eligible?[{claimId:'new',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE'}]:[]}}));};
 try{
  dom.window.eval(source);await new Promise(r=>setImmediate(r));
  const root=dom.window.document.getElementById('cheesemoa-site-host').shadowRoot;
  [...root.querySelectorAll('button')].find(b=>b.textContent==='방송 시작').click();
  Object.defineProperty(root.querySelector('iframe'),'contentDocument',{value:{querySelectorAll:()=>[{paused:false,readyState:4}]}});
  const request={type:'cheesemoa-power-request',kind:'claim',channelId:channel,claimId:'new'};
  const sender={id:'test',url:'chrome-extension://test/src/viewer/viewer.html'};
  assert.equal(listener(request,{id:'test',url:'https://evil.example'},()=>assert.fail()),undefined);assert.equal(calls.length,0);
  const ask=()=>new Promise(resolve=>listener(request,sender,resolve));
  assert.equal((await ask()).status,409);assert.equal(calls.filter(c=>c.o.method==='PUT').length,0);
  eligible=true;putStatus=403;assert.equal((await ask()).status,403);assert.equal(calls.filter(c=>c.o.method==='PUT').length,1);
  assert.ok(calls.every(c=>c.o.credentials==='include' && !c.o.headers));
  putStatus=204;assert.equal((await ask()).status,204);
 }finally{dom.window.close();}
});

test('BFCache restore remounts one idle host and one listener without replaying broadcasts',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 const listeners=new Set();
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url}]})}}};
 try{
  dom.window.eval(source);await new Promise(r=>setImmediate(r));assert.equal(listeners.size,1);
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  assert.equal(listeners.size,0);assert.equal(dom.window.document.getElementById('cheesemoa-site-host'),null);
  const show=()=>{const e=new dom.window.Event('pageshow');Object.defineProperty(e,'persisted',{value:true});dom.window.dispatchEvent(e)};
  show();show();await new Promise(r=>setImmediate(r));
  assert.equal(listeners.size,1);
  assert.equal(dom.window.document.querySelectorAll('#cheesemoa-site-host').length,1);
  assert.equal(dom.window.document.getElementById('cheesemoa-site-host').shadowRoot.querySelectorAll('iframe').length,0);
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));assert.equal(listeners.size,0);
 }finally{dom.window.close()}
});

test('legacy host reports post-eligibility playback loss as proven unsent and recovers once',async()=>{
 const dom=new JSDOM('<body/>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 let listener,drop=true,playing=true,puts=0;
 dom.window.AbortSignal=AbortSignal;
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn,removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url}]})}}};
 dom.window.fetch=async(u,o)=>{if(o.method==='PUT'){puts++;return new Response(null,{status:204})}if(drop)playing=false;return new Response(JSON.stringify({code:200,content:{active:true,claims:[{claimId:'new',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE'}]}}))};
 try{
  dom.window.eval(source);await new Promise(r=>setImmediate(r));
  const root=dom.window.document.getElementById('cheesemoa-site-host').shadowRoot;
  [...root.querySelectorAll('button')].find(b=>b.textContent==='방송 시작').click();
  Object.defineProperty(root.querySelector('iframe'),'contentDocument',{value:{querySelectorAll:()=>[{paused:!playing,readyState:4}]}});
  const ask=()=>new Promise(resolve=>listener({type:'cheesemoa-power-request',kind:'claim',channelId:channel,claimId:'new'},{id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},resolve));
  const result=await ask();assert.equal(result.error,'POWER_PLAYBACK_WAIT');assert.equal(result.mutationDispatched,false);assert.equal(result.phase,'eligibility');assert.equal(puts,0);
  playing=true;drop=false;assert.equal((await ask()).status,204);assert.equal(puts,1);
 }finally{dom.window.close()}
});
