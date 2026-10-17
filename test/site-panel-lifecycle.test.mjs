import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const hostSource=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
const pageSource=await readFile(new URL('../src/viewer/power-page.js',import.meta.url),'utf8');
async function fixture(){
 const dom=new JSDOM('<body><p id="official">Official page</p></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'}),w=dom.window;
 let id=0;const timers=new Map(),listeners=new Set(),requests=[];w.setInterval=fn=>{timers.set(++id,fn);return id};w.clearInterval=id=>timers.delete(id);w.fetch=async()=>{throw new Error('Unexpected network')};
 w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},sendMessage:async request=>{requests.push(request);return {ok:true,result:{enabled:false,otherEnabled:false,autoStart:false}}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url:'https://chzzk.naver.com/live/'+'a'.repeat(32)}]}),set:async()=>{throw new Error('Unexpected settings change')}}}};
 w.eval(hostSource);await new Promise(r=>setImmediate(r));w.eval(pageSource);await new Promise(r=>setImmediate(r));const holder=w.document.querySelector('#cheesemoa-power-control'),root=holder.shadowRoot,section=root.querySelector('section'),off=[...root.querySelectorAll('button')].find(b=>b.textContent==='자동수령 OFF');
 return {dom,w,timers,listeners,requests,holder,root,section,off};
}
test('closing the real host synchronously preserves the actual collector entry and OFF control before any poll',async()=>{
 const f=await fixture();try{const host=f.w.document.querySelector('#cheesemoa-site-host');assert.equal(f.holder.parentElement,host);const state=f.root.querySelector('[role=status]'),before=state.textContent,requests=f.requests.length;[...host.shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='멀티뷰 닫기').click();assert.equal(host.isConnected,false);assert.equal(f.holder.isConnected,true);assert.equal(f.off.isConnected,true);assert.equal(f.holder.shadowRoot,f.root);assert.equal(f.root.querySelector('section'),f.section);assert.equal(state.textContent,before);assert.equal(f.requests.length,requests);assert.equal(f.holder.style.position,'fixed');assert.ok(f.w.document.querySelector('#official'));
 }finally{f.w.dispatchEvent(new f.w.Event('pagehide'));f.dom.window.close()}
});
test('BFCache transitions immediately preserve and redock the same real collector without starting it',async()=>{
 const f=await fixture();try{const event=type=>{const e=new f.w.Event(type);Object.defineProperty(e,'persisted',{value:true});f.w.dispatchEvent(e)};event('pagehide');assert.equal(f.holder.isConnected,true);assert.equal(f.off.isConnected,true);assert.equal(f.holder.style.position,'fixed');assert.equal(f.listeners.size,0);event('pageshow');const host=f.w.document.querySelector('#cheesemoa-site-host');assert.ok(host);assert.equal(f.holder.parentElement,host);assert.equal(f.holder.style.position,'static');assert.equal(f.holder.shadowRoot,f.root);assert.equal(f.root.querySelector('section'),f.section);assert.equal(f.off.isConnected,true);assert.equal(f.requests.filter(r=>r.action==='start'||r.action==='collect').length,0);
 }finally{f.w.dispatchEvent(new f.w.Event('pagehide'));f.dom.window.close()}
});
