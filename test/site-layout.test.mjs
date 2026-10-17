import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
async function fixture(){
 const dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'}),w=dom.window;
 let writes=0,network=0;const timers=new Map();let id=0;
 w.setInterval=fn=>{timers.set(++id,fn);return id};w.clearInterval=key=>timers.delete(key);
 w.fetch=async()=>{network++;throw new Error('unexpected network')};
 w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){},removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':Array.from({length:4},(_,i)=>({url:'https://chzzk.naver.com/live/'+String(i+1).repeat(32)}))}),set:async()=>{writes++}}}};
 w.eval(source);await new Promise(r=>setImmediate(r));const host=w.document.querySelector('#cheesemoa-site-host'),root=host.shadowRoot,cards=[...root.querySelectorAll('article')];
 const button=(i,label)=>[...cards[i].querySelectorAll('button')].find(b=>b.textContent===label);
 const resize=(width,height)=>{Object.defineProperties(w,{innerWidth:{value:width,configurable:true},innerHeight:{value:height,configurable:true}});w.dispatchEvent(new w.Event('resize'));};
 return {dom,w,host,root,cards,button,resize,timers,writes:()=>writes,network:()=>network,close:()=>{[...root.querySelectorAll('button')].find(b=>b.textContent==='멀티뷰 닫기').click();dom.window.close()}};
}
test('responsive layout changes preserve all four active iframe identities and per-channel audio',async()=>{
 const f=await fixture();try{f.resize(1280,800);const media=[];for(let i=0;i<4;i++){f.button(i,'방송 시작').click();const frame=f.cards[i].querySelector('iframe');const v=new f.w.EventTarget();Object.assign(v,{paused:false,readyState:4,volume:.5,muted:true});media.push(v);Object.defineProperty(frame,'contentDocument',{value:{URL:frame.src,querySelectorAll:s=>s==='video,audio'?[v]:[]}});}
  for(const tick of f.timers.values())tick();f.button(1,'음소거 ON').click();const volume=f.cards[1].querySelector('input');volume.value='23';volume.dispatchEvent(new f.w.Event('input'));
  const frames=[...f.root.querySelectorAll('iframe')],urls=frames.map(frame=>frame.src);let srcWrites=0;for(const frame of frames){const original=frame.src;Object.defineProperty(frame,'src',{get:()=>original,set:()=>{srcWrites++}})}
  for(const [width,height] of [[1920,1080],[1280,800],[900,600],[390,844],[1280,800]]){f.resize(width,height);assert.deepEqual([...f.root.querySelectorAll('iframe')],frames);assert.deepEqual(frames.map(frame=>frame.src),urls);assert.equal(f.cards.filter(card=>!card.hidden).length,4);assert.equal(media[1].muted,false);assert.equal(media[1].volume,.23);assert.ok(media.filter((_,i)=>i!==1).every(v=>v.muted&&v.volume===.5));}
  assert.equal(srcWrites,0);assert.equal(f.writes(),0);assert.equal(f.network(),0);assert.equal(f.timers.size,4);
 }finally{f.close()}
});

test('four-view layout reserves viewport rows and a separate collector slot with a small-screen scroll fallback',async()=>{
 const f=await fixture();try{const grid=f.root.querySelector('.grid'),css=f.root.querySelector('style').textContent;assert.equal(grid.style.getPropertyValue('--columns'),'2');assert.equal(grid.style.getPropertyValue('--rows'),'2');assert.equal(f.root.querySelector('details.help').open,false);assert.ok(f.root.querySelector('.power-dock slot[name="cheesemoa-power-dock"]'));assert.match(css,/height:100dvh/);assert.match(css,/grid-template-rows:repeat\(var\(--rows,2\),minmax\(0,1fr\)\)/);assert.match(css,/\.grid\{[^}]*min-height:0/);assert.match(css,/@media\(max-width:640px\),\(max-height:480px\)/);assert.match(css,/grid-auto-rows:300px/);assert.match(css,/:host\(\[data-power-docked="true"\]\) \.workspace\{grid-template-columns:minmax\(0,1fr\) 280px/);assert.match(css,/\[hidden\]\{display:none!important\}/);
  const count=f.root.querySelector('select[aria-label="동시에 볼 방송 수"]');count.value='1';count.dispatchEvent(new f.w.Event('change'));assert.equal(grid.style.getPropertyValue('--columns'),'1');assert.equal(grid.style.getPropertyValue('--rows'),'1');count.value='4';count.dispatchEvent(new f.w.Event('change'));assert.equal(grid.style.getPropertyValue('--columns'),'2');assert.equal(grid.style.getPropertyValue('--rows'),'2');assert.equal(f.writes(),0);
 }finally{f.close()}
});

test('video fit contains the complete measured video and whole-page toggle never navigates the iframe',async()=>{
 const f=await fixture();try{const screen=f.cards[0].querySelector('.screen');let width=480,height=200;Object.defineProperties(screen,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});f.button(0,'방송 시작').click();const frame=screen.querySelector('iframe'),url=frame.src;let navigations=0;Object.defineProperty(frame,'src',{get:()=>url,set:()=>{navigations++}});const rect={x:100,y:100,width:800,height:450},video={paused:false,readyState:4,muted:true,volume:.5,getBoundingClientRect:()=>rect};Object.defineProperty(frame,'contentDocument',{value:{URL:url,querySelectorAll:s=>['video','video,audio'].includes(s)?[video]:[]}});
  const tick=()=>{for(const fn of f.timers.values())fn()};
  for(const dimensions of [[480,200],[300,400],[640,360]]){[width,height]=dimensions;tick();assert.equal(frame.dataset.cheesemoaView,'video');const scale=Number(frame.style.transform.match(/scale\(([^)]+)\)/)[1]),left=parseFloat(frame.style.left)+rect.x*scale,top=parseFloat(frame.style.top)+rect.y*scale;assert.ok(left>=-1e-8&&top>=-1e-8);assert.ok(left+rect.width*scale<=width+1e-8);assert.ok(top+rect.height*scale<=height+1e-8);assert.equal(scale,Math.min(width/rect.width,height/rect.height));}
  f.button(0,'전체 페이지').click();assert.equal(frame.dataset.cheesemoaView,'page');assert.equal(frame.style.clipPath,'none');f.button(0,'영상 맞춤').click();assert.equal(frame.dataset.cheesemoaView,'video');assert.equal(screen.querySelector('iframe'),frame);assert.equal(navigations,0);assert.equal(f.network(),0);
 }finally{f.close()}
});

test('unready video or a login/error document retains whole-page display',async()=>{
 const f=await fixture();try{const screen=f.cards[0].querySelector('.screen');Object.defineProperties(screen,{clientWidth:{value:480},clientHeight:{value:200}});f.button(0,'방송 시작').click();const frame=screen.querySelector('iframe');const v={paused:true,readyState:1,muted:true,volume:.5,getBoundingClientRect:()=>({x:0,y:0,width:800,height:450})},doc={URL:frame.src,querySelectorAll:s=>['video','video,audio'].includes(s)?[v]:[]};Object.defineProperty(frame,'contentDocument',{value:doc});const tick=()=>{for(const fn of f.timers.values())fn()};tick();assert.equal(frame.dataset.cheesemoaView,'page');v.readyState=4;doc.URL='https://chzzk.naver.com/login';tick();assert.equal(frame.dataset.cheesemoaView,'page');assert.equal(frame.style.clipPath,'none');
 }finally{f.close()}
});


// Gemini-authored regression, independently adapted to the frame dataset and strict no-navigation checks.
test("invalid video bounds fall back to whole-page and recover video fit without iframe replacement", async () => {
  const f = await fixture();
  try {
    const screen = f.cards[0].querySelector(".screen");
    Object.defineProperties(screen, {
      clientWidth: { value: 480, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    f.button(0, "방송 시작").click();
    const frame = screen.querySelector("iframe");
    assert.ok(frame);
    const initialSrc = frame.src;
    let srcWrites = 0;
    Object.defineProperty(frame, "src", {get: () => initialSrc, set: () => {srcWrites++;}});
    let rect = { x: 100, y: 100, width: 800, height: 450 };
    const v = {
      paused: false,
      readyState: 4,
      muted: true,
      volume: 0.5,
      getBoundingClientRect: () => rect,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(frame, "contentDocument", {
      value: { URL: initialSrc, querySelectorAll: selector => ["video", "video,audio"].includes(selector) ? [v] : [] },
      configurable: true,
    });
    const tick = () => {
      for (const fn of f.timers.values()) fn();
    };
    tick();
    assert.equal(frame.dataset.cheesemoaView, "video");
    const invalidRects = [
      { x: -1, y: 100, width: 800, height: 450 },
      { x: 100, y: 100, width: 0, height: 450 },
      { x: 100, y: 100, width: 800, height: Number.NaN },
      { x: 500, y: 100, width: 800, height: 450 },
      { x: 100, y: 300, width: 800, height: 450 },
    ];
    for (const bad of invalidRects) {
      rect = bad;
      tick();
      assert.equal(frame.dataset.cheesemoaView, "page");
      assert.equal(frame.style.clipPath || "none", "none");
      assert.equal(screen.querySelector("iframe"), frame);
      assert.equal(frame.src, initialSrc);
    }
    rect = { x: 100, y: 100, width: 800, height: 450 };
    tick();
    assert.equal(frame.dataset.cheesemoaView, "video");
    assert.notEqual(frame.style.clipPath || "none", "none");
    assert.equal(screen.querySelector("iframe"), frame);
    assert.equal(frame.src, initialSrc);
    assert.equal(srcWrites, 0);
    assert.equal(f.network(), 0);
  } finally {
    f.close();
  }
});
