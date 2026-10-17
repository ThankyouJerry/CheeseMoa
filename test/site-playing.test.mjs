import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
const channel='a'.repeat(32),url='https://chzzk.naver.com/live/'+channel;
async function fixture({start=true}={}){
 const dom=new JSDOM('<body><video id="parent-video"></video></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 let listener,step,media=[],unreadable=false;
 dom.window.setInterval=fn=>{step=fn;return 1};dom.window.clearInterval=()=>{};
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn,removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url}]})}}};
 dom.window.eval(source);await new Promise(r=>setImmediate(r));
 const root=dom.window.document.getElementById('cheesemoa-site-host').shadowRoot;
 if(!start)return {dom,root,probe:()=>{let result;listener({type:'cheesemoa-power-probe',channelId:channel},{id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},r=>result=r);return result.playing}};
 [...root.querySelectorAll('button')].find(b=>b.textContent==='방송 시작').click();
 const frame=root.querySelector('iframe');
 Object.defineProperty(frame,'contentDocument',{get(){if(unreadable)throw new Error('document temporarily inaccessible');return {querySelectorAll:selector=>selector==='video,audio'?media:[]};}});
 const probe=()=>{let result;listener({type:'cheesemoa-power-probe',channelId:channel},{id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},r=>result=r);return result.playing};
 return {dom,root,frame,probe,step:()=>step(),setMedia:v=>media=v,setUnreadable:v=>unreadable=v};
}
test('parent video never substitutes for selected iframe; current iframe media is queried afresh',async()=>{
 const f=await fixture();try{
  const parent=f.dom.window.document.querySelector('video');Object.defineProperty(parent,'paused',{value:false});Object.defineProperty(parent,'readyState',{value:4});
  assert.equal(f.probe(),false);
  f.setMedia([{paused:false,readyState:4}]);assert.equal(f.probe(),true);
  f.setMedia([]);assert.equal(f.probe(),false);
  f.setMedia([{paused:false,readyState:1}]);assert.equal(f.probe(),false);
  f.setMedia([{paused:false,readyState:4}]);assert.equal(f.probe(),true);
  f.setMedia([{paused:true,readyState:4}]);assert.equal(f.probe(),false);
 }finally{f.dom.window.close()}
});
test('hidden document does not directly change gate; missing/inaccessible iframe fails closed',async()=>{
 const f=await fixture();try{
  f.setMedia([{paused:false,readyState:4}]);
  Object.defineProperty(f.dom.window.document,'visibilityState',{value:'hidden'});
  assert.equal(f.probe(),true);
  f.setUnreadable(true);assert.equal(f.probe(),false);
  f.setUnreadable(false);assert.equal(f.probe(),true);
  [...f.root.querySelectorAll('button')].find(b=>b.textContent==='정지').click();assert.equal(f.probe(),false);
 }finally{f.dom.window.close()}
});
test('visible playback status must not report playing while readiness gate rejects buffering media',async()=>{
 const f=await fixture();try{
  f.setMedia([{paused:false,readyState:1}]);f.step();
  assert.equal(f.probe(),false);assert.match(f.root.querySelector('.state').textContent,/버퍼링|재생 준비/);
  f.setMedia([{paused:false,readyState:4}]);f.step();
  assert.equal(f.probe(),true);assert.match(f.root.querySelector('.state').textContent,/^재생 중/);
 }finally{f.dom.window.close()}
});

test('idle multiview does not invent collection OFF and explains the actual opt-in lifecycle',async()=>{
 const f=await fixture({start:false});try{
  assert.equal(f.probe(),false);
  assert.doesNotMatch(f.root.querySelector('.state').textContent,/자동 수령 OFF/);
  const notice=f.root.querySelector('.notice').textContent;
  assert.match(notice,/치즈모아 자동수령/);
  assert.match(notice,/해당 방송을 선택하고 ON/);
  assert.match(notice,/관리 창을 열어둘 필요가 없습니다/);
  assert.match(notice,/실제 ON·최근 조회·확정 수령/);
 }finally{f.dom.window.close()}
});
