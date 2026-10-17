import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
async function fixture({start=true}={}){
 const id='a'.repeat(32),url='https://chzzk.naver.com/live/'+id,dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'}),w=dom.window;let tick,http=0,writes=0,sourceReads=0,srcWrites=0;
 w.setInterval=fn=>{tick=fn;return 1};w.clearInterval=()=>{};w.fetch=async()=>{http++;throw new Error('unexpected network')};w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){},removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url,name:'SECRET_CHANNEL_TITLE'}]}),set:async()=>{writes++}}}};
 w.eval(source);await new Promise(resolve=>setImmediate(resolve));const root=w.document.querySelector('#cheesemoa-site-host').shadowRoot,button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);if(start)button('방송 시작').click();const frame=root.querySelector('iframe');const video={currentTime:5,paused:false,readyState:4,error:{code:3,message:'SECRET_ERROR_URL'},getVideoPlaybackQuality:()=>({totalVideoFrames:100,droppedVideoFrames:2}),buffered:{length:2,start:i=>[0,10][i],end:i=>[8,20][i]}};for(const key of ['src','currentSrc'])Object.defineProperty(video,key,{get(){sourceReads++;return 'https://private.example/SECRET_TOKEN'}});const doc={URL:url,querySelector:s=>s==='video'?video:null,querySelectorAll:()=>[]};if(frame){Object.defineProperty(frame,'contentDocument',{configurable:true,get:()=>doc});Object.defineProperty(frame,'src',{get:()=>url,set:()=>srcWrites++});}
 return {dom,w,root,button,frame,video,doc,tick:()=>tick?.(),read:()=>{button('재생 진단').click();return JSON.parse(root.querySelector('.media-diagnostic pre').textContent)},counters:()=>({http,writes,sourceReads,srcWrites}),close:()=>{button('멀티뷰 닫기').click();w.close()}};
}
test('diagnostics are explicitly requested, allowlisted and never transmit, save, navigate or expose source text',async()=>{
 const f=await fixture();try{assert.equal(f.root.querySelector('.media-diagnostic'),null);for(let i=0;i<3;i++)f.tick();assert.equal(f.root.querySelector('.media-diagnostic'),null);const value=f.read();assert.deepEqual(Object.keys(value).sort(),['framePresent','documentAccess','documentMatches','playbackState','videoPresent','currentTime','paused','readyState','mediaError','totalFrames','droppedFrames','bufferAheadSec','videoWidth','videoHeight'].sort());assert.equal(value.currentTime,5);assert.equal(value.mediaError,3);assert.equal(value.totalFrames,100);assert.equal(value.droppedFrames,2);assert.equal(value.bufferAheadSec,3);const text=f.root.querySelector('.media-diagnostic').textContent;assert.doesNotMatch(text,/SECRET|https?:|a{32}/);f.video.currentTime=6;f.tick();assert.equal(f.root.querySelector('.media-diagnostic').textContent,text);assert.deepEqual(f.counters(),{http:0,writes:0,sourceReads:0,srcWrites:0})}finally{f.close()}
});
test('discontinuous buffered ranges do not count future segments across a current playback gap',async()=>{
 const f=await fixture();try{f.video.currentTime=9;assert.equal(f.read().bufferAheadSec,0);f.video.currentTime=12;assert.equal(f.read().bufferAheadSec,8);f.video.currentTime=21;assert.equal(f.read().bufferAheadSec,0)}finally{f.close()}
});
test('a failed optional quality API preserves independent buffer and media measurements',async()=>{
 const f=await fixture();try{f.video.getVideoPlaybackQuality=()=>{throw new Error('SECRET_QUALITY_FAILURE')};const value=f.read();assert.equal(value.totalFrames,null);assert.equal(value.droppedFrames,null);assert.equal(value.currentTime,5);assert.equal(value.bufferAheadSec,3);assert.equal(value.mediaError,3);assert.doesNotMatch(JSON.stringify(value),/SECRET/)}finally{f.close()}
});
test('absent and inaccessible players produce explicit limited diagnostics',async()=>{
 const idle=await fixture({start:false});try{const value=idle.read();assert.equal(value.framePresent,false);assert.equal(value.documentAccess,'not-open');assert.equal(value.videoPresent,false);assert.equal(value.currentTime,null);assert.equal(value.bufferAheadSec,null);assert.deepEqual(idle.counters(),{http:0,writes:0,sourceReads:0,srcWrites:0})}finally{idle.close()}
 const f=await fixture();try{Object.defineProperty(f.frame,'contentDocument',{get(){throw new Error('SECRET_NAVIGATION')}});const value=f.read();assert.equal(value.documentAccess,'inaccessible');assert.equal(value.videoPresent,false);assert.equal(value.documentMatches,null);assert.doesNotMatch(JSON.stringify(value),/SECRET/)}finally{f.close()}
});
test('navigated documents expose only a boolean mismatch and invalid numeric fields are not accepted',async()=>{
 const f=await fixture();try{f.doc.URL='https://private.example/SECRET_ID';Object.assign(f.video,{currentTime:NaN,readyState:7,error:{code:99},getVideoPlaybackQuality:()=>({totalVideoFrames:-1,droppedVideoFrames:Infinity})});const value=f.read();assert.equal(value.documentMatches,false);assert.equal(value.currentTime,null);assert.equal(value.readyState,null);assert.equal(value.mediaError,null);assert.equal(value.totalFrames,null);assert.equal(value.droppedFrames,null);assert.doesNotMatch(JSON.stringify(value),/private|SECRET|https/)}finally{f.close()}
});

test('throwing media getters degrade only their own fields without leaking exception text',async()=>{
 const f=await fixture();try{Object.defineProperty(f.video,'error',{get(){throw new Error('SECRET_ERROR_GETTER')}});let value=f.read();assert.equal(value.mediaError,null);assert.equal(value.currentTime,5);assert.equal(value.readyState,4);assert.equal(value.bufferAheadSec,3);Object.defineProperty(f.video,'currentTime',{get(){throw new Error('SECRET_TIME_GETTER')}});value=f.read();assert.equal(value.currentTime,null);assert.equal(value.bufferAheadSec,null);assert.equal(value.readyState,4);assert.equal(value.totalFrames,100);assert.doesNotMatch(JSON.stringify(value),/SECRET/)}finally{f.close()}
});
