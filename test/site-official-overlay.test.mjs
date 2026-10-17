import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const source=await readFile(new URL('../src/viewer/site-host.js',import.meta.url),'utf8');
const error='<div id="live_player_layout"><div class="pzp-pc-ui-error-dialog"><p class="pzp-pc-ui-error-dialog__message">죄송합니다. 문제가 발생했습니다. 다시 시도해 주세요.</p></div></div>';
const age='<div class="_container_test"><div class="_description_test"><p>사용자 보호를 위해 연령 제한이 설정된 라이브입니다.</p><p>시청을 원하면 로그인 후 본인 인증을 완료해주세요.</p></div><button class="_button_test _highlight_test">로그인 하기</button></div>';
async function fixture(markup,{video=true}={}){
 const url='https://chzzk.naver.com/live/'+'a'.repeat(32),dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'}),w=dom.window,child=new JSDOM('<body>'+markup+(video?'<video></video>':'')+'</body>',{url});let tick;
 w.setInterval=fn=>{tick=fn;return 1};w.clearInterval=()=>{};w.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){},removeListener(){}}},storage:{local:{get:async()=>({'cheesemoa.channels':[{url}]})}}};w.eval(source);await new Promise(r=>setImmediate(r));const root=w.document.querySelector('#cheesemoa-site-host').shadowRoot,button=t=>[...root.querySelectorAll('button')].find(b=>b.textContent===t),screen=root.querySelector('.screen');Object.defineProperties(screen,{clientWidth:{value:480},clientHeight:{value:200}});button('방송 시작').click();const frame=root.querySelector('iframe');Object.defineProperty(frame,'contentDocument',{value:child.window.document});for(const node of child.window.document.querySelectorAll('*'))node.getBoundingClientRect=()=>({x:0,y:0,width:100,height:30});const media=child.window.document.querySelector('video');if(media){Object.defineProperties(media,{paused:{value:false},readyState:{value:4},currentTime:{value:10,writable:true}});media.getBoundingClientRect=()=>({x:0,y:0,width:800,height:450});}
 return {dom,child,root,frame,media,tick:()=>tick(),kind:()=>frame.dataset.cheesemoaPlaybackState,close:()=>{button('멀티뷰 닫기').click();child.window.close();w.close()}};
}
test('observed visible official error overrides healthy stale video and preserves the whole error page',async()=>{
 const f=await fixture(error);try{f.tick();f.media.currentTime++;f.tick();assert.equal(f.kind(),'error');assert.equal(f.frame.dataset.cheesemoaView,'page');assert.equal(f.frame.style.clipPath,'none');assert.match(f.root.querySelector('[role=status]').textContent,/재생 확인 0개/)}finally{f.close()}
});
for(const hidden of ['display:none','visibility:hidden','opacity:0','hidden','aria-hidden'])test(`hidden official error template is ignored (${hidden})`,async()=>{
 const f=await fixture(error);try{const parent=f.child.window.document.querySelector('.pzp-pc-ui-error-dialog');if(hidden==='hidden')parent.hidden=true;else if(hidden==='aria-hidden')parent.setAttribute('aria-hidden','true');else parent.setAttribute('style',hidden);f.tick();f.media.currentTime++;f.tick();assert.equal(f.kind(),'playing');assert.equal(f.frame.dataset.cheesemoaView,'video')}finally{f.close()}
});
test('observed age gate requires both descriptions and the login button in the player container',async()=>{
 const f=await fixture('<main><div class="_player_test">'+age+'</div></main>',{video:false});try{f.tick();assert.equal(f.kind(),'age-restricted');assert.equal(f.frame.dataset.cheesemoaView,'page');assert.equal(f.frame.style.clipPath,'none');assert.match(f.root.querySelector('[role=status]').textContent,/재생 확인 0개/)}finally{f.close()}
});
for(const wrapper of ['header','aside','div class="_details_test"','a class="_link_test"','div id="aside-chatting"','div role="log"'])test(`non-player age text never classifies the playing broadcast (${wrapper})`,async()=>{
 const tag=wrapper.split(' ')[0],markup=wrapper==='header'?'<header>'+age+'</header><main><div class="_player_test"></div></main>':'<main><div class="_player_test"><'+wrapper+'>'+age+'</'+tag+'></div></main>',f=await fixture(markup);try{f.tick();f.media.currentTime++;f.tick();assert.equal(f.kind(),'playing')}finally{f.close()}
});
test('partial age wording or a header login button is insufficient to label age restriction',async()=>{
 for(const markup of [age.replace('시청을 원하면 로그인 후 본인 인증을 완료해주세요.','일반 안내'),age.replace('<button class="_button_test _highlight_test">로그인 하기</button>','')]){const f=await fixture('<header><button class="_login_button_test">로그인</button></header><main><div class="_player_test">'+markup+'</div></main>');try{f.tick();f.media.currentTime++;f.tick();assert.equal(f.kind(),'playing')}finally{f.close()}}
});
