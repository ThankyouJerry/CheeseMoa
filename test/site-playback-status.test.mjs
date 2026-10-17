import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
async function fixture(){
 const dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'}),w=dom.window,timers=new Map();let timer=0;
 w.setInterval=fn=>{timers.set(++timer,fn);return timer};w.clearInterval=id=>timers.delete(id);w.fetch=async()=>{throw new Error('No network allowed')};
 w.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener(){},removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':['a','b','c','d'].map(c=>({url:'https://chzzk.naver.com/live/'+c.repeat(32)}))})}}};
 w.eval(source);await new Promise(resolve=>setImmediate(resolve));const host=w.document.querySelector('#cheesemoa-site-host'),root=host.shadowRoot,cards=[...root.querySelectorAll('article')];const button=(i,label)=>[...cards[i].querySelectorAll('button')].find(b=>b.textContent===label),frames=[],docs=[],videos=[];
 for(let i=0;i<4;i++){button(i,'방송 시작').click();const frame=cards[i].querySelector('iframe'),video=new w.EventTarget();Object.assign(video,{paused:false,readyState:4,currentTime:10,muted:true,volume:.5,ended:false,error:null});const doc={URL:frame.src,querySelectorAll:selector=>selector==='video,audio'?[video]:[]};Object.defineProperty(frame,'contentDocument',{configurable:true,get:()=>doc});frames.push(frame);docs.push(doc);videos.push(video);}
 return {dom,w,root,cards,frames,docs,videos,button,timers,tick:()=>[...timers.values()].forEach(fn=>fn()),summary:()=>root.querySelector('[role=status]').textContent,states:()=>frames.map(frame=>frame.dataset.cheesemoaPlaybackState),close:()=>{[...root.querySelectorAll('button')].find(b=>b.textContent==='멀티뷰 닫기').click();w.close()}};
}
test('four opened players with media errors report zero verified playback',async()=>{
 const f=await fixture();try{for(const video of f.videos)video.error={code:3};f.tick();assert.match(f.summary(),/열린 플레이어 4개/);assert.match(f.summary(),/재생 확인 0개/);assert.deepEqual(f.states(),['error','error','error','error']);for(const card of f.cards)assert.doesNotMatch(card.querySelector('.state').textContent,/^재생 중/)}finally{f.close()}
});
test('mixed players count only progressing video, and no progress becomes stalled',async()=>{
 const f=await fixture();try{f.videos[2].paused=true;f.videos[3].error={code:2};f.tick();assert.match(f.summary(),/재생 확인 0개/);f.videos[0].currentTime++;f.videos[1].currentTime++;f.tick();assert.match(f.summary(),/열린 플레이어 4개/);assert.match(f.summary(),/재생 확인 2개/);assert.deepEqual(f.states(),['playing','playing','paused','error']);for(let i=0;i<3;i++)f.tick();assert.match(f.summary(),/재생 확인 0개/);assert.deepEqual(f.states(),['stalled','stalled','paused','error'])}finally{f.close()}
});
test('readiness, buffering and ended media do not imply actual playback',async()=>{
 const f=await fixture();try{f.videos[1].readyState=1;f.videos[2].paused=true;f.videos[2].readyState=0;f.videos[3].ended=true;f.tick();assert.match(f.summary(),/재생 확인 0개/);assert.deepEqual(f.states(),['verifying','buffering','unverified','ended']);f.videos[0].currentTime++;f.tick();assert.match(f.summary(),/재생 확인 1개/)}finally{f.close()}
});
test('decoded frame progress can verify playback when currentTime is unavailable',async()=>{
 const f=await fixture();try{let decoded=10;f.videos[0].currentTime=NaN;f.videos[0].getVideoPlaybackQuality=()=>({totalVideoFrames:decoded});f.tick();assert.equal(f.states()[0],'verifying');decoded++;f.tick();assert.equal(f.states()[0],'playing');assert.match(f.summary(),/재생 확인 1개/)}finally{f.close()}
});
test('navigated or inaccessible documents lose playback proof and stopped frames leave open count',async()=>{
 const f=await fixture();try{f.tick();for(const video of f.videos)video.currentTime++;f.tick();assert.match(f.summary(),/재생 확인 4개/);f.docs[0].URL='https://chzzk.naver.com/login';Object.defineProperty(f.frames[1],'contentDocument',{get(){throw new Error('temporarily inaccessible')}});f.videos[2].currentTime++;f.videos[3].currentTime++;f.tick();assert.equal(f.states()[0],'unverified');assert.equal(f.states()[1],'unverified');assert.match(f.summary(),/재생 확인 2개/);f.button(2,'정지').click();assert.match(f.summary(),/열린 플레이어 3개/);assert.match(f.summary(),/재생 확인 1개/);assert.equal(f.frames[2].isConnected,false)}finally{f.close()}
});

test('replaced document and late media removal reset previous playback evidence',async()=>{
 const f=await fixture();try{f.tick();f.videos[0].currentTime++;f.tick();assert.equal(f.states()[0],'playing');const replacement={...f.docs[0]};Object.defineProperty(f.frames[0],'contentDocument',{get:()=>replacement});f.videos[0].currentTime++;f.tick();assert.equal(f.states()[0],'verifying');f.videos[0].currentTime++;f.tick();assert.equal(f.states()[0],'playing');replacement.querySelectorAll=()=>[];f.tick();assert.equal(f.states()[0],'unverified');assert.match(f.summary(),/재생 확인 0개/)}finally{f.close()}
});
test('an unrecognized official gate without video remains unverified rather than successful playback',async()=>{
 const f=await fixture();try{f.docs[0].body={textContent:'로그인 또는 연령 확인이 필요합니다'};f.docs[0].querySelectorAll=()=>[];f.tick();assert.equal(f.states()[0],'unverified');assert.match(f.summary(),/재생 확인 0개/);assert.doesNotMatch(f.cards[0].querySelector('.state').textContent,/^재생 중/)}finally{f.close()}
});

test('a new iframe load clears visible playback immediately before the next sample',async()=>{
 const f=await fixture();try{f.tick();f.videos[0].currentTime++;f.tick();assert.equal(f.states()[0],'playing');assert.match(f.summary(),/재생 확인 1개/);f.frames[0].dispatchEvent(new f.w.Event('load'));assert.equal(f.states()[0],'unverified');assert.match(f.summary(),/재생 확인 0개/);f.button(0,'정지').click();const summary=f.summary();f.frames[0].dispatchEvent(new f.w.Event('load'));assert.equal(f.summary(),summary)}finally{f.close()}
});
