import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
async function fixture(cap){
 const dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});
 const channels=Array.from({length:7},(_,i)=>({name:`방송${i+1}`,url:`https://chzzk.naver.com/live/${String(i+1).repeat(32)}`}));
 let writes=0;
 dom.window.setInterval=()=>1;dom.window.clearInterval=()=>{};
 dom.window.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){},removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':channels}),set:()=>writes++}}};
 dom.window.eval(source.replace(/const MAX_ACTIVE = \d+;/,`const MAX_ACTIVE = ${cap};`));await new Promise(r=>setImmediate(r));
 const root=dom.window.document.getElementById('cheesemoa-site-host').shadowRoot;
 const cards=[...root.querySelectorAll('article')];const count=root.querySelector('select[aria-label="동시에 볼 방송 수"]');
 const choose=(el,value)=>{el.value=String(value);el.dispatchEvent(new dom.window.Event('change'))};
 const button=(index,text)=>[...cards[index].querySelectorAll('button')].find(b=>b.textContent===text);
 return {dom,root,cards,count,choose,button,channels,writes:()=>writes,visible:()=>cards.filter(c=>!c.hidden)};
}
for(const cap of [4,6])test(`${cap}-slot build enforces chosen count, preserves active frames, and never writes saved channels`,async()=>{
 const f=await fixture(cap);try{
  assert.equal(f.count.options.length,cap);assert.equal(f.visible().length,cap);
  assert.equal(f.root.querySelectorAll('iframe').length,0);
  f.choose(f.count,2);assert.equal(f.visible().length,2);
  f.button(0,'방송 시작').click();f.button(1,'방송 시작').click();
  const frames=[...f.root.querySelectorAll('iframe')];assert.equal(frames.length,2);
  f.choose(f.count,1);assert.equal(f.count.value,'2');assert.equal(f.visible().length,2);
  assert.match(f.root.querySelector('[role=status]').textContent,/먼저.*정지/);
  assert.deepEqual([...f.root.querySelectorAll('iframe')],frames);
  f.button(0,'정지').click();f.choose(f.count,1);
  assert.equal(f.visible().length,1);assert.equal(f.visible()[0],f.cards[1]);
  assert.equal(f.cards[1].querySelector('iframe'),frames[1]);
  assert.equal(f.cards[1].querySelector('select').disabled,true);
  f.choose(f.count,cap);assert.equal(f.visible().length,cap);
  assert.equal(f.root.querySelectorAll('iframe').length,1);
  const idle=f.visible().find(c=>!c.querySelector('iframe'));
  f.choose(idle.querySelector('select'),f.channels[6].url);
  assert.equal(idle.hidden,true);assert.equal(f.cards[6].hidden,false);
  assert.equal(f.visible().length,cap);assert.equal(f.root.querySelectorAll('iframe').length,1);
  f.button(6,'방송 시작').click();assert.equal(f.root.querySelectorAll('iframe').length,2);
  assert.equal(f.writes(),0);assert.equal(f.cards.length,7);
 }finally{f.dom.window.close()}
});
