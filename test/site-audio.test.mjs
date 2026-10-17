import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
async function fixture(){
 const dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'}),w=dom.window;
 const timers=new Map();let next=0;w.setInterval=fn=>{timers.set(++next,fn);return next};w.clearInterval=id=>timers.delete(id);
 w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){},removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':['a','b'].map(id=>({url:'https://chzzk.naver.com/live/'+id.repeat(32)}))})}}};
 w.eval(source);await new Promise(r=>setImmediate(r));const root=w.document.querySelector('#cheesemoa-site-host').shadowRoot,cards=[...root.querySelectorAll('article')];
 const button=(i,text)=>[...cards[i].querySelectorAll('button')].find(b=>b.textContent===text);
 const media=[[],[]],frames=[];cards.forEach((_,i)=>{button(i,'방송 시작').click();frames[i]=cards[i].querySelector('iframe');Object.defineProperty(frames[i],'contentDocument',{get:()=>({URL:frames[i].src,querySelectorAll:s=>s==='video,audio'?media[i]:[]})})});
 function video(){const v=new w.EventTarget();const listeners=new Set(),add=v.addEventListener.bind(v),remove=v.removeEventListener.bind(v);v.addEventListener=(type,fn)=>{if(type==='volumechange')listeners.add(fn);add(type,fn)};v.removeEventListener=(type,fn)=>{if(type==='volumechange')listeners.delete(fn);remove(type,fn)};v.listenerCount=()=>listeners.size;let muted=false,volume=1;v.writes=0;Object.defineProperties(v,{muted:{get:()=>muted,set:n=>{muted=n;v.writes++}},volume:{get:()=>volume,set:n=>{volume=n;v.writes++}},paused:{value:false},readyState:{value:4}});v.native=(m,n)=>{muted=m;volume=n;v.dispatchEvent(new w.Event('volumechange'))};return v;}
 return {dom,w,cards,frames,media,button,video,tick:()=>[...timers.values()].forEach(fn=>fn()),volume:(i,n)=>{const input=cards[i].querySelector('input');input.value=String(n);input.dispatchEvent(new w.Event('input'));},close:()=>{[...root.querySelectorAll('button')].find(b=>b.textContent==='멀티뷰 닫기').click();dom.window.close()}};
}
test('same-origin multiview applies mute and volume immediately to only the selected card',async()=>{
 const f=await fixture();try{const a=f.video(),b=f.video();f.media[0]=[a];f.media[1]=[b];f.tick();assert.equal(a.muted,true);assert.equal(b.muted,true);
  f.button(0,'음소거 ON').click();assert.equal(a.muted,false);assert.equal(b.muted,true);f.volume(0,20);assert.equal(a.volume,.2);assert.equal(b.volume,.5);
  f.button(1,'음소거 ON').click();f.volume(1,80);assert.equal(b.muted,false);assert.equal(b.volume,.8);assert.equal(a.volume,.2);assert.equal(f.cards[0].querySelector('iframe'),f.frames[0]);assert.equal(f.cards[1].querySelector('iframe'),f.frames[1]);
 }finally{f.close()}
});
test('native player audio changes persist and unchanged watchdog ticks do not write media',async()=>{
 const f=await fixture();try{const a=f.video(),b=f.video();f.media[0]=[a];f.media[1]=[b];f.tick();a.native(false,.2);assert.ok(f.button(0,'음소거 OFF'));assert.equal(f.cards[0].querySelector('input').value,'20');const writes=[a.writes,b.writes];for(let i=0;i<30;i++)f.tick();assert.equal(a.muted,false);assert.equal(a.volume,.2);assert.equal(b.muted,true);assert.equal(b.volume,.5);assert.deepEqual([a.writes,b.writes],writes);
 }finally{f.close()}
});
test('replacement retains current preferences and stale or stopped media cannot change the card',async()=>{
 const f=await fixture();try{const old=f.video();f.media[0]=[old];f.tick();old.native(false,.3);const replacement=f.video();f.media[0]=[replacement];old.native(true,.9);assert.equal(f.cards[0].querySelector('input').value,'30');f.tick();assert.equal(replacement.muted,false);assert.equal(replacement.volume,.3);old.native(true,.8);assert.equal(f.cards[0].querySelector('input').value,'30');f.button(0,'정지').click();replacement.native(true,.7);assert.equal(f.cards[0].querySelector('input').value,'30');assert.ok(f.button(0,'음소거 OFF'));assert.equal(f.cards[0].querySelector('iframe'),null);
 }finally{f.close()}
});

test('media removal after the loading deadline detaches native audio listeners',async()=>{
 const f=await fixture();try{for(let i=0;i<21;i++)f.tick();const a=f.video();f.media[0]=[a];f.tick();assert.equal(a.listenerCount(),1);a.native(false,.4);f.media[0]=[];f.tick();assert.equal(a.listenerCount(),0);a.native(true,.9);assert.equal(f.cards[0].querySelector('input').value,'40');assert.ok(f.button(0,'음소거 OFF'));
 }finally{f.close()}
});

test('queued programmatic volumechange events observe current preferences without replaying old volume',async()=>{
 const f=await fixture();try{
  const pending=[];let muted=false,volume=1,writes=0;
  const a=new f.w.EventTarget();Object.defineProperties(a,{paused:{value:false},readyState:{value:4},muted:{get:()=>muted,set:value=>{muted=value;writes++;pending.push(()=>a.dispatchEvent(new f.w.Event('volumechange')))}},volume:{get:()=>volume,set:value=>{volume=value;writes++;pending.push(()=>a.dispatchEvent(new f.w.Event('volumechange')))}}});
  f.media[0]=[a];f.tick();assert.equal(a.volume,.5);assert.equal(pending.length,2);
  f.volume(0,20);assert.equal(a.volume,.2);assert.equal(pending.length,3);const before=writes;
  // Browser media events carry no historical volume payload; handlers read the current element.
  for(const dispatch of pending.splice(0))dispatch();assert.equal(a.volume,.2);assert.equal(f.cards[0].querySelector('input').value,'20');assert.equal(writes,before);assert.equal(pending.length,0);
  f.tick();assert.equal(a.volume,.2);assert.equal(writes,before);
 }finally{f.close()}
});

test('secondary media volume events cannot overwrite the authoritative player preference',async()=>{
 const f=await fixture();try{const primary=f.video(),secondary=f.video();f.media[0]=[primary,secondary];f.tick();f.volume(0,20);assert.equal(primary.volume,.2);assert.equal(secondary.volume,.2);secondary.native(false,.9);assert.equal(f.cards[0].querySelector('input').value,'20');assert.ok(f.button(0,'음소거 ON'));assert.equal(primary.volume,.2);assert.equal(primary.muted,true);
 }finally{f.close()}
});
