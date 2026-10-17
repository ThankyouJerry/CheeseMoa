import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
async function fixture(){
 const dom=new JSDOM('',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});let tick,cleared=0,navigations=0;
 dom.window.setInterval=fn=>{tick=fn;return 1};dom.window.clearInterval=()=>cleared++;
 dom.window.chrome={storage:{local:{get:async()=>({'cheesemoa.channels':[{url:'https://chzzk.naver.com/live/'+'a'.repeat(32),name:'Test'}]})}}};
 dom.window.eval(source);await new Promise(r=>setImmediate(r));const root=dom.window.document.querySelector('#cheesemoa-site-host').shadowRoot;const button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);button('방송 시작').click();const frame=root.querySelector('iframe');const url=frame.src;
 Object.defineProperty(frame,'src',{get:()=>url,set:value=>{assert.equal(value,url);navigations++}});
 let videos=[];const doc={URL:'about:blank',readyState:'complete',body:{childNodes:[]},querySelectorAll:s=>s==='video,audio'?videos:[]};Object.defineProperty(frame,'contentDocument',{get:()=>doc});
 return {dom,frame,doc,button,root,tick:()=>tick(),advance:n=>{for(let i=0;i<n;i++)tick()},navigations:()=>navigations,cleared:()=>cleared,video:v=>videos=v};
}
test('initial empty document retries once then reports explicit failure',async()=>{const f=await fixture();try{f.advance(19);assert.equal(f.navigations(),0);f.tick();assert.equal(f.navigations(),1);assert.equal(f.frame.dataset.cheesemoaLoadState,'retrying-blank');f.advance(100);assert.equal(f.navigations(),1);assert.equal(f.frame.dataset.cheesemoaLoadState,'unverified');assert.match(f.root.textContent,/자동 재연결 1회/)}finally{f.dom.window.close()}});
test('healthy cold starts and loaded login/error pages never reload',async()=>{for(let run=0;run<3;run++){const f=await fixture();try{f.doc.URL=f.frame.src;f.doc.body.childNodes=[{}];f.video([{paused:false,readyState:4}]);f.advance(60);assert.equal(f.navigations(),0);assert.equal(f.frame.dataset.cheesemoaLoadState,'playing');f.video([]);f.advance(30);assert.equal(f.navigations(),0)}finally{f.dom.window.close()}}});
test('loaded page with no media, inaccessible document, and loading document do not retry',async()=>{for(const mode of ['loaded','inaccessible','pending']){const f=await fixture();try{if(mode==='loaded'){f.doc.URL=f.frame.src;f.doc.body.childNodes=[{}]}if(mode==='inaccessible')Object.defineProperty(f.doc,'URL',{get(){throw new Error('blocked')}});if(mode==='pending')f.doc.readyState='loading';f.advance(60);assert.equal(f.navigations(),0)}finally{f.dom.window.close()}}});
test('stop, route change, and pagehide cancel delayed recovery',async()=>{for(const mode of ['stop','route','pagehide']){const f=await fixture();try{f.advance(19);if(mode==='stop')f.button('정지').click();if(mode==='route')f.dom.window.history.pushState({},'','/lives#other');if(mode==='pagehide')f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide'));f.advance(30);assert.equal(f.navigations(),0);assert.ok(f.cleared()>0)}finally{f.dom.window.close()}}});
test('recovery accepts a loaded player without further navigation',async()=>{const f=await fixture();try{f.advance(20);f.doc.URL=f.frame.src;f.video([{paused:false,readyState:4}]);f.advance(100);assert.equal(f.navigations(),1);assert.equal(f.frame.dataset.cheesemoaLoadState,'playing')}finally{f.dom.window.close()}});

test('a real document loaded between timer ticks permanently prevents blank retry',async()=>{const f=await fixture();try{f.doc.URL=f.frame.src;f.frame.dispatchEvent(new f.dom.window.Event('load'));f.doc.URL='about:blank';f.advance(60);assert.equal(f.navigations(),0)}finally{f.dom.window.close()}});

test('requires twenty consecutive qualifying blank checks, not accumulated loading time',async()=>{
 const f=await fixture();try{f.doc.readyState='loading';f.advance(19);f.doc.readyState='complete';f.tick();assert.equal(f.navigations(),0);f.advance(18);assert.equal(f.navigations(),0);f.tick();assert.equal(f.navigations(),1)}finally{f.dom.window.close()}
});
test('missing body and interrupted blank streak cannot trigger recovery',async()=>{
 const f=await fixture();try{const body=f.doc.body;f.doc.body=null;f.advance(40);assert.equal(f.navigations(),0);f.doc.body=body;f.advance(19);f.doc.readyState='loading';f.tick();f.doc.readyState='complete';f.advance(19);assert.equal(f.navigations(),0);f.tick();assert.equal(f.navigations(),1)}finally{f.dom.window.close()}
});
test('media mounting at the deadline blocks all later blank retries',async()=>{
 const f=await fixture();try{f.advance(19);f.video([{paused:false,readyState:4}]);f.tick();f.video([]);f.advance(60);assert.equal(f.navigations(),0)}finally{f.dom.window.close()}
});
test('stop or pagehide after the single retry cannot navigate again',async()=>{
 for(const mode of ['stop','pagehide']){const f=await fixture();try{f.advance(20);assert.equal(f.navigations(),1);if(mode==='stop')f.button('정지').click();else f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide'));f.advance(100);assert.equal(f.navigations(),1);assert.ok(f.cleared()>0)}finally{f.dom.window.close()}}
});
