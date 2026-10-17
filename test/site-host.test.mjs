import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
test('same-origin host is opt-in, starts no frames, enforces playback cap and never writes storage or collects',async()=>{
 const dom=new JSDOM('<body>CHZZK</body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 let reads=0;
 dom.window.chrome={storage:{local:{get:async key=>{assert.equal(key,'cheesemoa.channels');reads++;return {'cheesemoa.channels':Array.from({length:6},(_,i)=>({url:'https://chzzk.naver.com/live/'+String(i+1).repeat(32),streamerName:'Test '+i})).concat([{url:'https://evil.example/live/'+'a'.repeat(32)}])};}}}};
 try{
  dom.window.eval(source);await new Promise(r=>setImmediate(r));
  const root=dom.window.document.getElementById('cheesemoa-site-host').shadowRoot;
  assert.equal(root.querySelectorAll('article').length,6);assert.equal(root.querySelectorAll('iframe').length,0);assert.equal(reads,1);
  const starts=[...root.querySelectorAll('button')].filter(b=>b.textContent==='방송 시작');
  starts.forEach(b=>b.click());assert.equal(root.querySelectorAll('iframe').length,4);
  assert.equal([...root.querySelectorAll('article')].filter(c=>!c.hidden).length,4);
  assert.ok([...root.querySelectorAll('iframe')].every(f=>new URL(f.src).origin==='https://chzzk.naver.com'));
  [...root.querySelectorAll('button')].find(b=>b.textContent==='정지').click();assert.equal(root.querySelectorAll('iframe').length,3);
  [...root.querySelectorAll('button')].find(b=>b.textContent==='멀티뷰 닫기').click();assert.equal(dom.window.document.getElementById('cheesemoa-site-host'),null);
 }finally{dom.window.close();}
});
test('ordinary lives pages do not mount the host or read storage',()=>{
 const dom=new JSDOM('<body>CHZZK</body>',{url:'https://chzzk.naver.com/lives',runScripts:'outside-only'});
 try{dom.window.eval(source);assert.equal(dom.window.document.getElementById('cheesemoa-site-host'),null);}finally{dom.window.close();}
});
