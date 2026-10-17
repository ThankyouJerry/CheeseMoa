import {attachPowerReceiptPanel} from './power-receipt-panel.js';
import {attachFloatingPowerPanel} from './floating-power-panel.js';
// Bundled with the exact shared session/owner/adapter code by build-power-page.mjs.
if(window===window.top&&location.origin==='https://chzzk.naver.com'&&
 (/^\/live\/[a-f0-9]{32}$/i.test(location.pathname)||(location.pathname==='/lives'&&location.hash==='#cheesemoa-multiview'))){
 const id='cheesemoa-power-control';
 if(!document.getElementById(id)){
  let direct=location.pathname.match(/^\/live\/([a-f0-9]{32})$/i)?.[1];
  const holder=document.createElement('aside');holder.id=id;holder.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px))';
  const root=holder.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=':host{font:13px/1.5 system-ui;color:#eff6ff}section{background:#102a40;border:1px solid #b7cddd;border-radius:12px;padding:12px;box-shadow:0 4px 18px #0005}h2{font-size:15px;margin:0 0 6px}p{margin:6px 0}button,select{font:inherit;padding:6px;border-radius:6px;margin:3px;border:1px solid #8196a9}button:focus-visible,select:focus-visible{outline:3px solid #ffcc40}button:disabled{opacity:.5}select{max-width:100%}';root.append(style);
  const section=document.createElement('section');root.append(section);
  const heading=document.createElement('h2');heading.textContent='🪵 치즈모아 자동수령';section.append(heading);
  const build=document.createElement('small');build.textContent=POWER_BUILD;section.append(build);
  const label=document.createElement('label');label.textContent='수집할 방송 ';const select=document.createElement('select');select.setAttribute('aria-label','자동수령 주 채널');label.append(select);section.append(label);
  const on=document.createElement('button');on.textContent='자동수령 ON';const off=document.createElement('button');off.textContent='자동수령 OFF';section.append(on,off);
  const state=document.createElement('p');state.setAttribute('role','status');state.setAttribute('aria-live','polite');section.append(state);
  const detail=document.createElement('p');section.append(detail);
  const counts=document.createElement('p');counts.textContent='이 실행의 확정 수령 0건 · 최근 조회 없음';section.append(counts);
  const receiptPanel=attachPowerReceiptPanel({section,document});
  let enabled=false,confirmed=0,lastCheck=null,poll,restoredForChoices=false;
  function frames(){return [...(document.querySelector('#cheesemoa-site-host')?.shadowRoot?.querySelectorAll('iframe')||[])]}
  function playing(channel){try{const doc=location.pathname===`/live/${channel}`?document:frames().find(f=>f.src===`https://chzzk.naver.com/live/${channel}`)?.contentDocument;return !!doc&&[...doc.querySelectorAll('video,audio')].some(v=>!v.paused&&v.readyState>=2)}catch{return false}}
  function syncChannels(){
   const currentDirect=location.pathname.match(/^\/live\/([a-f0-9]{32})$/i)?.[1];
   if(currentDirect!==direct){void owner.stop();direct=currentDirect;restoredForChoices=true;}
   const choices=direct?[{id:direct,name:`현재 방송 (${direct.slice(0,8)}…)`}]:frames().map(f=>({id:f.src.match(/\/live\/([a-f0-9]{32})$/i)?.[1],name:f.title})).filter(c=>c.id);
   const current=select.value;
   if(enabled){if(!choices.some(c=>c.id===current))void owner.stop();return;}
   select.replaceChildren();for(const c of choices){const option=document.createElement('option');option.value=c.id;option.textContent=c.name;select.append(option)}
   if(choices.some(c=>c.id===current))select.value=current;
   on.disabled=!choices.length;
   if(!choices.length){state.textContent='OFF · 먼저 멀티뷰에서 방송을 시작하세요.';off.disabled=true}
   if(choices.length&&!restoredForChoices){restoredForChoices=true;void owner.restore()}
  }
  function message(value){return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Object.assign(new Error('수집 실행 응답이 지연되어 중단했습니다. 수령 결과는 기록 확인이 필요합니다.'),{name:'TimeoutError',method:value.action==='collect'?'PUT':'GET',retryable:false})),90000);
   Promise.resolve(chrome.runtime.sendMessage(value)).then(resolve,reject).finally(()=>clearTimeout(timer));
  })}
  const owner=createPagePowerOwner({send:message,getChannelId:()=>select.value,onState(value){
   enabled=value.enabled===true;select.disabled=enabled;on.disabled=enabled||!select.value;off.disabled=!enabled&&!value.canStop;
   const names={'playback-wait':'재생 대기',checking:'확인 중',checked:'응답 확인',inactive:'보상 비활성',blocked:'이전 미확인 보상 보존',waiting:'재조회 대기',error:'중단',off:'꺼짐','auth-required':'로그인 확인 필요',connecting:'시작 연결 중'};
   state.textContent=`${enabled?'ON':'OFF'} · ${names[value.status]||'상태 확인 중'}`;detail.textContent=value.detail||'서버의 적격 보상만 확인합니다.';
   if(['checked','blocked','inactive'].includes(value.status))lastCheck=Date.now();
   confirmed+=value.result?.collected||0;
   receiptPanel.update(value,select.selectedOptions[0]?.textContent||'선택 방송');
   counts.textContent=`이 실행의 확정 수령 ${confirmed}건 · 최근 조회 ${lastCheck?new Date(lastCheck).toLocaleTimeString('ko-KR'):'없음'}${['waiting','error','auth-required'].includes(value.status)?' · 최신 조회 미확인':''}`;
  }});
  const agent=createPagePowerAgent({isPlaying:playing});
  const listener=(message,sender,respond)=>{
   if(sender.id!==chrome.runtime.id||(sender.url&&!sender.url.startsWith(chrome.runtime.getURL(''))))return;
   if(message?.type==='cheesemoa-owner-state'){owner.deactivate(message.epoch);return;}
   if(message?.type!=='cheesemoa-page-network')return;
   void agent(message).then(respond);return true;
  };
  let connected=false;
  function connect(){if(connected)return;connected=true;chrome.runtime.onMessage.addListener(listener);poll=setInterval(syncChannels,1000)}
  function disconnect(){if(!connected)return;connected=false;clearInterval(poll);chrome.runtime.onMessage.removeListener(listener);restoredForChoices=false;owner.suspend()}
  on.addEventListener('click',()=>void owner.start());off.addEventListener('click',()=>void owner.stop());select.addEventListener('change',()=>void owner.stop());
  document.documentElement.append(holder);
  attachFloatingPowerPanel({holder,root,section,heading,storage:chrome.storage?.local});
  connect();syncChannels();
  // Discover player starts without restarting or changing any existing player.
  const observer=new MutationObserver(()=>syncChannels());const host=document.querySelector('#cheesemoa-site-host')?.shadowRoot;if(host)observer.observe(host,{childList:true,subtree:true});
  window.addEventListener('pagehide',disconnect);window.addEventListener('pageshow',event=>{if(event.persisted){connect();syncChannels()}});
 }
}
