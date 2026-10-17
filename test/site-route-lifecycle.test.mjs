import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
const valid='https://chzzk.naver.com/lives#cheesemoa-multiview';
async function fixture(url=valid){
 const dom=new JSDOM('<body><main id="official-content">Official page</main><video id="unrelated-video"></video><iframe id="unrelated-frame"></iframe></body>',{url,runScripts:'outside-only'}),w=dom.window;
 const listeners=new Set(),timers=new Map();let next=0,reads=0;
 w.setInterval=fn=>{timers.set(++next,fn);return next};w.clearInterval=id=>timers.delete(id);
 const channels=['a','b'].map(x=>x.repeat(32));w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},storage:{local:{get:async()=>{reads++;return {'cheesemoa.channels':channels.map(id=>({url:'https://chzzk.naver.com/live/'+id}))}}}}};
 const unrelated=[...w.document.body.children];w.eval(source);await new Promise(r=>setImmediate(r));const host=w.document.querySelector('#cheesemoa-site-host'),listener=[...listeners][0];
 const probe=()=>{let value;listener?.({type:'cheesemoa-power-probe',channelId:channels[0]},{id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},r=>value=r.playing);return value;};
 function start(){for(const button of host.shadowRoot.querySelectorAll('button'))if(button.textContent==='방송 시작')button.click();const frames=[...host.shadowRoot.querySelectorAll('iframe')];for(const frame of frames)Object.defineProperty(frame,'contentDocument',{value:{URL:frame.src,querySelectorAll:s=>s==='video,audio'?[{paused:false,readyState:4,muted:true,volume:.5}]:[]}});return frames;}
 return {dom,w,host,unrelated,listeners,timers,listener,channels,probe,start,reads:()=>reads,tick:()=>[...timers.values()].forEach(fn=>fn())};
}
for(const destination of ['/live/'+'c'.repeat(32),'/lives#other','/lives?unexpected=1#cheesemoa-multiview'])test(`SPA route exit ${destination} immediately rejects legacy playback and cleans only owned frames`,async()=>{
 const f=await fixture();try{const frames=f.start();assert.equal(frames.length,2);assert.equal(f.probe(),true);assert.equal(f.timers.size,2);
  f.w.history.replaceState(null,'',destination);assert.equal(f.probe(),false);f.tick();assert.equal(f.w.document.querySelector('#cheesemoa-site-host'),null);assert.ok(frames.every(frame=>!frame.isConnected));assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.probe(),false);assert.deepEqual([...f.w.document.body.children],f.unrelated);assert.ok(f.unrelated.every(el=>el.isConnected));
 }finally{f.dom.window.close()}
});
for(const event of ['hashchange','popstate'])test(`idle host handles ${event} route exit without requiring a player timer`,async()=>{
 const f=await fixture();try{assert.equal(f.timers.size,0);f.w.history.replaceState(null,'','/lives');f.w.dispatchEvent(new f.w.Event(event));assert.equal(f.w.document.querySelector('#cheesemoa-site-host'),null);assert.equal(f.listeners.size,0);assert.deepEqual([...f.w.document.body.children],f.unrelated);f.w.dispatchEvent(new f.w.Event(event));assert.equal(f.listeners.size,0);
 }finally{f.dom.window.close()}
});
test('query-bearing route does not mount or read settings, exact route remains functional',async()=>{
 const invalid=await fixture('https://chzzk.naver.com/lives?unexpected=1#cheesemoa-multiview');try{assert.equal(invalid.host,null);assert.equal(invalid.reads(),0);assert.equal(invalid.listeners.size,0)}finally{invalid.dom.window.close()}
 const f=await fixture();try{f.start();f.w.dispatchEvent(new f.w.Event('popstate'));f.tick();assert.equal(f.host.isConnected,true);assert.equal(f.probe(),true);assert.equal(f.listeners.size,1);assert.equal(f.timers.size,2)}finally{f.dom.window.close()}
});

test('start after silent idle route exit cleans the host without creating a player',async()=>{
 const f=await fixture();try{
  const start=[...f.host.shadowRoot.querySelectorAll('button')].find(button=>button.textContent==='방송 시작');
  let createdFrames=0;const create=f.w.document.createElement.bind(f.w.document);f.w.document.createElement=(name,...args)=>{if(name.toLowerCase()==='iframe')createdFrames++;return create(name,...args)};
  f.w.history.replaceState(null,'','/lives');start.click();assert.equal(createdFrames,0);assert.equal(f.host.shadowRoot.querySelectorAll('iframe').length,0);assert.equal(f.w.document.querySelector('#cheesemoa-site-host'),null);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.deepEqual([...f.w.document.body.children],f.unrelated);
 }finally{f.dom.window.close()}
});


test('route exit rejects balance and claim requests before the watchdog without any HTTP dispatch',async()=>{
 const f=await fixture();let fetches=0;f.w.fetch=async()=>{fetches++;throw new Error('Unexpected HTTP dispatch')};
 try{f.start();assert.equal(f.probe(),true);f.w.history.replaceState(null,'','/lives');
  // Capture the already-registered listener; no timer or route event has run yet.
  for(const kind of ['balance','claim']){
   const result=await new Promise(resolve=>f.listener({type:'cheesemoa-power-request',kind,channelId:f.channels[0],claimId:'fixture-claim'},{id:'test',url:'chrome-extension://test/src/viewer/viewer.html'},resolve));
   assert.equal(result.error,'POWER_PLAYBACK_WAIT');assert.equal(result.mutationDispatched,false);assert.equal(result.phase,'eligibility');assert.equal(fetches,0);
  }
  assert.equal(f.timers.size,2);assert.equal(f.host.isConnected,true);
 }finally{f.dom.window.close()}
});
