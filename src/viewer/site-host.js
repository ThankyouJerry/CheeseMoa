// Same-origin CHZZK host. Independent implementation; no security headers changed.
(() => {
  'use strict';
  // Adapted from Gemini's reviewed draft (2026-10-17); use the UI's multiplication sign.
  function formatVideoDims(w,h){return Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0?`${w}×${h}`:'';}
  let restoreOnShow=false;
  const isHostRoute=()=>location.origin==='https://chzzk.naver.com'&&location.pathname==='/lives'&&!location.search&&location.hash==='#cheesemoa-multiview';
  // Adapted from Gemini desktop review (2026-10-17): read-only, allowlisted media values.
  // Isolate optional API failures and measure buffer only in the range containing playback.
  function mediaSnapshot(video){
    const read=fn=>{try{return fn();}catch{return undefined;}};
    const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
    const int=v=>Number.isSafeInteger(v)&&v>=0?v:null;
    const currentTime=num(read(()=>video.currentTime));
    const paused=read(()=>video.paused),ready=int(read(()=>video.readyState)),error=int(read(()=>video.error?.code));
    const quality=read(()=>video.getVideoPlaybackQuality?.());
    let bufferAheadSec=null;
    const buffered=read(()=>video.buffered),length=int(read(()=>buffered.length));
    if(currentTime!==null&&length!==null&&length<=1000){
      bufferAheadSec=0;
      for(let i=0;i<length;i++){
        const start=num(read(()=>buffered.start(i))),end=num(read(()=>buffered.end(i)));
        if(start===null||end===null||end<start){bufferAheadSec=null;break;}
        if(start<=currentTime&&currentTime<=end){bufferAheadSec=end-currentTime;break;}
      }
    }
    return {videoWidth:int(read(()=>video.videoWidth)),videoHeight:int(read(()=>video.videoHeight)),currentTime,paused:typeof paused==='boolean'?paused:null,readyState:ready!==null&&ready<=4?ready:null,
      mediaError:error!==null&&error>=1&&error<=4?error:null,totalFrames:int(read(()=>quality.totalVideoFrames)),
      droppedFrames:int(read(()=>quality.droppedVideoFrames)),bufferAheadSec};
  }
  // These exact player messages/selectors were observed in official CHZZK DOM.
  // Hidden error templates and text in chat, recommendations or details are not evidence.
  function officialPlayerNotice(doc){
    try{
      const text=node=>(node.textContent||'').replace(/\s+/g,' ').trim();
      const visible=node=>{
        if(!node||node.closest('aside,#aside-chatting,[role="log"],[class*="_details_"],a[class*="_link_"]'))return false;
        const rect=node.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return false;
        for(let parent=node;parent;parent=parent.parentElement){
          const style=doc.defaultView.getComputedStyle(parent);
          if(parent.hidden||parent.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;
        }
        return true;
      };
      for(const node of doc.querySelectorAll('#live_player_layout .pzp-pc-ui-error-dialog .pzp-pc-ui-error-dialog__message')){
        if(text(node)==='죄송합니다. 문제가 발생했습니다. 다시 시도해 주세요.'&&visible(node))return 'error';
      }
      for(const node of doc.querySelectorAll('main [class*="_player_"] [class*="_container_"] [class*="_description_"] > p')){
        if(text(node)!=='사용자 보호를 위해 연령 제한이 설정된 라이브입니다.'||!visible(node))continue;
        const container=node.closest('[class*="_container_"]');
        const description=[...container.querySelectorAll('[class*="_description_"] > p')].find(p=>text(p)==='시청을 원하면 로그인 후 본인 인증을 완료해주세요.'&&visible(p));
        const login=[...container.querySelectorAll('button[class*="_button_"][class*="_highlight_"]')].find(b=>text(b)==='로그인 하기'&&visible(b));
        if(description&&login)return 'age-restricted';
      }
    }catch{ /* Unknown DOM or inaccessible styles remain unverified. */ }
    return null;
  }
  function mount() {
  if (window !== window.top || !isHostRoute()) return;
  const rootId = 'cheesemoa-site-host';
  if (document.getElementById(rootId)) return;
  const MAX_ACTIVE = 4;
  const container = document.createElement('div'); container.id = rootId;
  container.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#091c29;overflow-y:auto';
  const root = container.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = `.workspace{display:grid;height:100%;min-height:0;grid-template-columns:minmax(0,1fr)}.power-dock{display:none;min-width:0;min-height:0;overflow:auto;padding:8px 8px 8px 0}:host([data-power-docked="true"]) .workspace{grid-template-columns:minmax(0,1fr) 280px}:host([data-power-docked="true"]) .power-dock{display:block}
:host{color:#f3f7fa;font:13px/1.4 system-ui,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}
main{height:100vh;height:100dvh;min-height:0;display:flex;flex-direction:column;gap:6px;overflow:hidden;padding:8px;background:#091c29}
header{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}main>header{flex:none;flex-wrap:wrap}h1{margin:0;font-size:18px}h1 small{display:block;color:#9eb4c3;font-size:11px}
button,select,a{font:inherit}button,select{min-height:28px;min-width:0;border:1px solid #617c8d;border-radius:7px;background:#19384c;color:white;padding:3px 7px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:#ffc83d;color:#172c38;border-color:#ffc83d;font-weight:800}a{color:#ffdc78}nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.note{color:#b5cad7;font-size:11px;margin:0;flex:none}
.help{flex:none;font-size:11px;color:#b5cad7}.help summary{cursor:pointer}.help[open]{max-height:100px;overflow:auto}.notice{padding:6px;border:1px solid #ffc83d60;border-radius:7px}
.grid{display:grid;flex:1;min-width:0;min-height:0;grid-template-columns:repeat(var(--columns,2),minmax(0,1fr));grid-template-rows:repeat(var(--rows,2),minmax(0,1fr));gap:8px}
article{display:grid;grid-template-rows:28px 64px minmax(0,1fr) 24px;min-width:0;min-height:0;border:1px solid #36556b;border-radius:10px;overflow:hidden;background:#102d40}article header{padding:3px 8px}article h2{flex:1;min-width:0;font-size:13px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}article header a{flex:none;font-size:11px}article header button{flex:none;min-height:22px;padding:1px 5px;font-size:11px}article .actions{display:flex;flex-wrap:wrap;align-content:center;align-items:center;gap:4px;padding:2px 6px;overflow-x:auto;white-space:nowrap}article .actions>*{flex-shrink:0}article .actions select{width:120px;min-width:100px;flex-shrink:0}
.screen{position:relative;min-height:0;min-width:0;overflow:hidden;background:#050e15;display:grid;place-items:center}.screen p{padding:12px;text-align:center;color:#b5cad7;font-size:12px}iframe{border:0;width:100%;height:100%;display:block}.state{padding:4px 8px;margin:0;font-size:11px;color:#a9c4d6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.media-diagnostic{position:static;width:100%;padding:12px;overflow-wrap:anywhere;background:#102d40;color:#f3f7fa;border:1px solid #617c8d;border-radius:10px}.media-diagnostic pre{white-space:pre-wrap;font-size:12px}.empty{padding:20px}.volume{width:64px}button:focus-visible,a:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #ffc83d;outline-offset:2px}
@media(max-width:1100px){article{grid-template-rows:28px 64px minmax(0,1fr) 24px}article .actions{flex-wrap:wrap;align-content:center;overflow:auto}}
@media(max-width:900px){:host([data-power-docked="true"]) .workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:max-content 280px;overflow:auto}.power-dock{height:280px;max-height:280px;padding:8px}}
@media(max-width:640px),(max-height:480px){.workspace{overflow:auto;grid-template-rows:max-content}main{height:auto;min-height:100vh;min-height:100dvh;overflow:visible}.grid{flex:none;grid-template-columns:minmax(0,1fr);grid-template-rows:none;grid-auto-rows:300px}article .actions select{min-width:100px}}`;
  root.append(style);
  const workspace=document.createElement('div');workspace.className='workspace';root.append(workspace);
  const main = document.createElement('main');workspace.append(main);
  const dock=document.createElement('aside');dock.className='power-dock';dock.setAttribute('aria-label','자동수령 패널');const dockSlot=document.createElement('slot');dockSlot.name='cheesemoa-power-dock';dock.append(dockSlot);workspace.append(dock);
  const heading = document.createElement('header'); main.append(heading);
  const title = document.createElement('h1'); title.textContent = '🧀 치즈모아 멀티뷰';
  const subtitle = document.createElement('small'); subtitle.textContent = '치지직 동일 출처 · 방송은 직접 시작'; title.append(subtitle); heading.append(title);
  const nav = document.createElement('nav'); heading.append(nav);
  function button(label, onClick, parent=nav) {const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',onClick);parent.append(b);return b;}
  const layoutLabel=document.createElement('label');layoutLabel.textContent='동시에 볼 방송 수 ';
  const layout = document.createElement('select'); layout.setAttribute('aria-label','동시에 볼 방송 수');layout.disabled=true;
  layoutLabel.append(layout);nav.append(layoutLabel);
  const notice = document.createElement('p'); notice.className='note notice';notice.textContent=`최대 ${MAX_ACTIVE}개를 이 화면에서 시청합니다. 방송 시작 전에는 플레이어를 불러오지 않습니다. 자동수령 패널에서 수집할 방송과 ON/OFF 상태를 확인하세요. 새 설정은 기본 ON이며 저장한 OFF와 현재 실행의 OFF는 유지합니다. 관리 창을 열어둘 필요가 없습니다. 실제 ON·최근 조회·확정 수령은 자동수령 패널에서 확인하세요.`;const help=document.createElement('details');help.className='help';const summary=document.createElement('summary');summary.textContent='시청·자동수령 안내';help.append(summary,notice);main.append(help);
  const status=document.createElement('p');status.className='note';status.setAttribute('role','status');main.append(status);
  const grid=document.createElement('section');grid.className='grid';grid.setAttribute('aria-label','멀티뷰 방송 목록');main.append(grid);

  const active=new Map(); let disposed=false;
  // Requests arrive only from this extension's management document, never from
  // web postMessage. No arbitrary URL, credentials, header or script is accepted.
  const powerBuild='power-20261011.7';
  const powerTypes=new Set(['WATCH_1_HOUR','WATCH_5_MIN','FOLLOW','DONATE','DONATE_MONTHLY','SUBSCRIPTION_GIFT','SUBSCRIPTION_GIFT_MONTHLY']);
  const liveUrl=id=>`https://chzzk.naver.com/live/${id}`;
  const mediaReady=items=>items.some(v=>!v.paused && v.readyState>=2);
  const playing=id=>!disposed && isHostRoute() && active.has(liveUrl(id)) && mediaReady(media(active.get(liveUrl(id)).frame));
  const trusted=sender=>sender?.id===chrome.runtime.id && sender.url===chrome.runtime.getURL('src/viewer/viewer.html');
  async function powerFetch(url,method='GET') {
    return fetch(url,{method,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(8000)});
  }
  async function servePower(request) {
    let mutationDispatched=false;
    try {
    const id=request.channelId;
    if(!/^[a-f0-9]{32}$/i.test(id||'')) throw new Error('INVALID_CHANNEL');
    if(!playing(id)) return {build:powerBuild,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
    const base=`https://api.chzzk.naver.com/service/v1/channels/${id}/log-power`;
    let url,method='GET';
    if(request.kind==='account') url='https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus';
    else if(request.kind==='balance') url=base;
    else if(request.kind==='claim' && typeof request.claimId==='string' && request.claimId.length>0 && request.claimId.length<=200) {
      // Recheck immediately before PUT: a human may have collected since polling.
      const check=await powerFetch(base);
      if(!check.ok) return {build:powerBuild,status:check.status,body:'',phase:'eligibility',mutationDispatched:false,retryAfter:check.headers.get('Retry-After')||''};
      const data=await check.json();
      if(data?.code!==200 || data.content?.active!==true || !Array.isArray(data.content.claims)) throw new Error('INVALID_ELIGIBILITY');
      const claim=data.content.claims.find(c=>String(c?.claimId)===request.claimId &&
        String(c.state).toUpperCase()==='COMPLIED' && String(c.saveType).toUpperCase()==='ACTIVE' && powerTypes.has(String(c.claimType).toUpperCase()));
      if(!claim) return {build:powerBuild,status:409,body:'{"code":409}',phase:'eligibility',mutationDispatched:false};
      if(!playing(id)) return {build:powerBuild,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
      url=`${base}/claims/${encodeURIComponent(request.claimId)}`;method='PUT';
    } else throw new Error('UNSUPPORTED_REQUEST');
    if(method==='PUT') mutationDispatched=true;
    const response=await powerFetch(url,method);
    let body=await response.text();
    if(body.length>262144) throw new Error('RESPONSE_TOO_LARGE');
    if(request.kind==='account') {
      // Pass only the identity fields needed by the existing account guard.
      const data=JSON.parse(body);body=JSON.stringify({code:data?.code,content:{loggedIn:data?.content?.loggedIn,userIdHash:data?.content?.userIdHash}});
    }
    return {build:powerBuild,status:response.status,body,retryAfter:response.headers.get('Retry-After')||''};
    } catch(error) {
      return {build:powerBuild,error:'POWER_TRANSPORT_FAILED',status:0,
        mutationDispatched,phase:mutationDispatched?'mutation':'eligibility',
        timeout:error?.name==='TimeoutError',schema:['INVALID_CHANNEL','INVALID_ELIGIBILITY','UNSUPPORTED_REQUEST'].includes(error?.message)};
    }
  }
  const powerListener=(request,sender,respond)=>{
    if(!trusted(sender)) return;
    if(request?.type==='cheesemoa-power-probe') {respond({build:powerBuild,playing:playing(request.channelId)});return;}
    if(request?.type!=='cheesemoa-power-request') return;
    void servePower(request).then(respond,()=>respond({build:powerBuild,error:'POWER_TRANSPORT_FAILED'}));
    return true;
  };
  chrome.runtime?.onMessage?.addListener(powerListener);
  window.addEventListener('pagehide',()=>chrome.runtime?.onMessage?.removeListener(powerListener),{once:true});
  let lastPowerHint=0;
  function hintPower(frame,channel) {
    if(Date.now()-lastPowerHint<5000 || !/^https:\/\/chzzk\.naver\.com\/live\/[a-f0-9]{32}$/i.test(channel.url))return;
    let available=false;
    try {
      available=[...frame.contentDocument.querySelectorAll('aside#aside-chatting button')].some(b=>{
        const text=(b.textContent||'').trim();
        return !b.disabled && b.getClientRects().length>0 &&
          ((text.includes('받기')&&(text.includes('통나무 파워')||text.includes('배달')||b.querySelector('[class*="_icon_power_"]')))||text.includes('배달 완료'));
      });
    }catch{}
    if(!available)return;
    lastPowerHint=Date.now();
    void chrome.runtime?.sendMessage?.({type:'cheesemoa-power-available',build:powerBuild,channelId:channel.url.split('/').at(-1)}).catch(()=>{});
  }

  function media(frame){try{return [...frame.contentDocument.querySelectorAll('video,audio')];}catch{return [];}}
  function stop(id){const item=active.get(id);if(!item)return;clearInterval(item.timer);item.cleanupAudio();item.cleanupLayout();item.frame.remove();active.delete(id);item.start.disabled=false;item.start.hidden=false;item.stop.disabled=true;item.state.textContent='정지됨 · 이 창의 플레이어만 닫았습니다.';}
  function cleanup(){
    if(disposed)return;
    disposed=true;for(const id of [...active.keys()])stop(id);
    const panel=container.querySelector(':scope > #cheesemoa-power-control[slot="cheesemoa-power-dock"]');
    if(panel)document.documentElement.append(panel);
    container.remove();window.dispatchEvent(new Event('cheesemoa-power-layout-change'));
    chrome.runtime?.onMessage?.removeListener(powerListener);
    window.removeEventListener('hashchange',routeChanged);window.removeEventListener('popstate',routeChanged);
  }
  function routeChanged(){if(!isHostRoute())cleanup();}
  window.addEventListener('hashchange',routeChanged);window.addEventListener('popstate',routeChanged);
  button('멀티뷰 닫기',cleanup);
  async function render(){
    try{
      const result=await chrome.storage.local.get('cheesemoa.channels');
      if(disposed)return;
      const seen=new Set();
      const channels=(Array.isArray(result['cheesemoa.channels'])?result['cheesemoa.channels']:[]).filter(c=>{
        try{const u=new URL(c.url);if(u.origin!=='https://chzzk.naver.com'||!/^\/(live\/[a-f0-9]{32}|video\/\d+)$/i.test(u.pathname)||u.search||u.hash||u.username||u.password||seen.has(u.href))return false;seen.add(u.href);return true;}catch{return false;}
      });
      let slotCount=Math.min(MAX_ACTIVE,channels.length);
      let visible=channels.slice(0,slotCount).map(c=>c.url);
      const cards=new Map();
      for(let count=1;count<=slotCount;count++) {const o=document.createElement('option');o.value=String(count);o.textContent=`${count}개 보기`;layout.append(o);}
      layout.value=String(slotCount);layout.disabled=!slotCount;
      function syncPlaybackStatus(){
        const counts={playing:0,buffering:0,paused:0,error:0,'age-restricted':0,stalled:0,ended:0,unverified:0};
        for(const {frame} of active.values()){
          const state=frame.dataset.cheesemoaPlaybackState;
          counts[Object.hasOwn(counts,state)?state:'unverified']++;
        }
        status.textContent=`저장된 ${channels.length}개 · 선택 ${slotCount}칸 · 열린 플레이어 ${active.size}개 · 재생 확인 ${counts.playing}개 · 버퍼링 ${counts.buffering}개 · 일시정지 ${counts.paused}개 · 오류 ${counts.error}개 · 연령 제한 ${counts['age-restricted']}개 · 진행 정체 ${counts.stalled}개 · 종료 ${counts.ended}개 · 미확인 ${counts.unverified}개`;
      }
      function syncSlots(){
        grid.style.setProperty('--columns',slotCount===1?'1':'2');
        grid.style.setProperty('--rows',String(Math.max(1,Math.ceil(slotCount/2))));
        for(const [url,item] of cards){
          item.card.hidden=!visible.includes(url);
          item.picker.value=url;item.picker.disabled=active.has(url);
          for(const o of item.picker.options)o.disabled=o.value!==url && visible.includes(o.value);
        }
        syncPlaybackStatus();
      }
      layout.addEventListener('change',()=>{
        const requested=Number(layout.value);
        if(!Number.isInteger(requested)||requested<1||requested>Math.min(MAX_ACTIVE,channels.length)) {layout.value=String(slotCount);return;}
        if(active.size>requested){
          layout.value=String(slotCount);
          status.textContent=`현재 플레이어 ${active.size}개가 열려 있습니다. ${requested}개로 줄이려면 먼저 유지하지 않을 방송의 ‘정지’를 눌러주세요. 열린 플레이어는 그대로 유지했습니다.`;
          return;
        }
        // Keep every active frame in place. Visibility changes never move/reload it.
        const keep=new Set([...active.keys()]);
        for(const url of [...visible,...channels.map(c=>c.url)])if(keep.size<requested)keep.add(url);
        visible=[...keep];slotCount=requested;syncSlots();
      });
      syncSlots();
      if(!channels.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='확장 팝업에서 방송을 추가한 뒤 새 멀티뷰를 열어주세요.';grid.append(empty);}
      for(const [index,channel] of channels.entries()){
        const card=document.createElement('article');grid.append(card);
        const head=document.createElement('header');card.append(head);
        const label=document.createElement('h2');label.textContent=`${index+1}. ${channel.name||channel.streamerName||'CHZZK 방송'}`;head.append(label);
        const external=document.createElement('a');external.href=channel.url;external.target='_blank';external.rel='noopener noreferrer';external.textContent='공식 방송';head.append(external);
        const actions=document.createElement('div');actions.className='actions';card.append(actions);
        const picker=document.createElement('select');picker.setAttribute('aria-label',`${label.textContent} 칸의 방송 선택`);
        for(const choice of channels){const o=document.createElement('option');o.value=choice.url;o.textContent=choice.name||choice.streamerName||choice.url;picker.append(o);}
        picker.value=channel.url;actions.append(picker);cards.set(channel.url,{card,picker});
        picker.addEventListener('change',()=>{
          const next=picker.value;
          if(active.has(channel.url)||!visible.includes(channel.url)||visible.includes(next)||!cards.has(next)){picker.value=channel.url;return;}
          visible=visible.map(url=>url===channel.url?next:url);syncSlots();
        });
        const screen=document.createElement('div');screen.className='screen';card.append(screen);
        const placeholder=document.createElement('p');placeholder.textContent='방송 시작을 누르면 이 칸에서 재생합니다.\n다른 방송 시청은 통나무 시청 집계 대상에 영향을 줄 수 있습니다.';screen.append(placeholder);
        const state=document.createElement('p');state.className='state';state.textContent='방송 시작 전 · 수집 상태는 자동수령 패널에서 확인';card.append(state);

        let qualityPending=null,qualityDiagnostic={status:'idle'};
        function qualityDocumentNow(){
          const frame=active.get(channel.url)?.frame;if(!frame)return null;
          try{const doc=frame.contentDocument;return doc?.URL===channel.url?{frame,doc}:null;}catch{return null;}
        }
        function qualityRejection(item,allowSettingsAutohide=false){
          const rejected=(reason,node=item)=>({reason,node:node?`${node.tagName}.${String(node.className||'').replace(/[^a-zA-Z0-9_ -]/g,'').slice(0,96).trim().replace(/ +/g,'.')}`:'none'});
          if(!item?.isConnected)return rejected('detached');
          if(item.disabled||item.getAttribute('aria-disabled')==='true')return rejected('disabled');
          const settingsEntry=allowSettingsAutohide&&item.matches('#live_player_layout .pzp button.pzp-setting-button[aria-label="설정"]');
          const rect=item.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return rejected('zeroRect');
          // Live diagnostics confirmed the official settings button itself also fades.
          // Only this exact entry may tolerate opacity; all other hidden gates remain.
          for(let node=item;node;node=node.parentElement){
            const style=node.ownerDocument.defaultView.getComputedStyle(node);
            if(node.hidden)return rejected('hidden',node);
            if(node.getAttribute('aria-hidden')==='true')return rejected('ariahidden',node);
            if(style.display==='none')return rejected('display',node);
            if(style.visibility==='hidden'||style.visibility==='collapse')return rejected('visibility',node);
            if(style.opacity==='0'&&!settingsEntry)return rejected('opacity',node);
          }
          return null;
        }
        function qualityClickable(item,allowSettingsAutohide=false){return !qualityRejection(item,allowSettingsAutohide);}
        function updateQuality(){
          const pending=qualityPending;if(!pending)return;
          const current=qualityDocumentNow();
          if(disposed||!isHostRoute()||current?.frame!==pending.frame||current?.doc!==pending.doc){qualityPending=null;qualityDiagnostic={status:'cancelled'};return;}
          if(++pending.steps>10){qualityPending=null;qualityDiagnostic={...qualityDiagnostic,status:'timeout'};return;}
          const settings=current.doc.querySelector('#live_player_layout .pzp button.pzp-setting-button[aria-label="설정"]');
          const resolution=[...current.doc.querySelectorAll('#live_player_layout .pzp .pzp-settings .pzp-setting-intro-quality[role="menuitem"]')].find(node=>qualityClickable(node));
          const options=[...current.doc.querySelectorAll('#live_player_layout .pzp li.pzp-ui-setting-quality-item[role="menuitem"]')].filter(node=>qualityClickable(node));
          const rejection=qualityRejection(settings,true);
          qualityDiagnostic={status:'opening',phase:pending.phase,settingsPresent:!!settings,gate:rejection?.reason||'none',node:rejection?.node||'none'};
          if(options.length){qualityPending=null;qualityDiagnostic={status:'menu-visible'};return;}
          if(pending.phase<2&&resolution){pending.phase=2;resolution.click();return;}
          if(pending.phase===0&&qualityClickable(settings,true)){pending.phase=1;if(settings.getAttribute('aria-expanded')!=='true')settings.click();}
        }
        const qualityMenu=button('화질 메뉴',()=>{
          const current=qualityDocumentNow();if(!current||disposed||!isHostRoute()||qualityPending)return;
          focusVideo=false;view.textContent='영상 맞춤';fitPlayer();
          qualityPending={...current,steps:0,phase:0};qualityDiagnostic={status:'opening'};updateQuality();
        },actions);
        qualityMenu.title='공식 메뉴를 엽니다. 원하는 화질은 방송 화면에서 직접 선택하세요.';
        let muted=true,trackedMedia=[],focusVideo=true;
        function updateAudioLabel(){mute.textContent=muted?'음소거 ON':'음소거 OFF';}
        function applyAudio(items){for(const v of items){if(v.muted!==muted)v.muted=muted;const level=Number(volume.value)/100;if(v.volume!==level)v.volume=level;}}
        function nativeAudio(event){
          if(disposed||!isHostRoute())return;
          const frame=active.get(channel.url)?.frame;
          // Detached/replaced players must not change the current card's settings.
          const items=frame?media(frame):[];
          if(event.target!==items[0])return;
          muted=items[0].muted;volume.value=String(items[0].volume*100);updateAudioLabel();
        }
        function cleanupAudio(){for(const v of trackedMedia)v.removeEventListener?.('volumechange',nativeAudio);trackedMedia=[];}
        function syncAudio(items){
          for(const v of trackedMedia)if(!items.includes(v))v.removeEventListener?.('volumechange',nativeAudio);
          const added=items.filter(v=>!trackedMedia.includes(v));
          for(const v of added)v.addEventListener?.('volumechange',nativeAudio);
          trackedMedia=items;applyAudio(added);
        }
        function commandAudio(){const frame=active.get(channel.url)?.frame;if(frame){const items=media(frame);syncAudio(items);applyAudio(items);}}
        function fitPlayer(){
          const frame=active.get(channel.url)?.frame,width=screen.clientWidth,height=screen.clientHeight;
          if(!frame||width<=0||height<=0)return;
          // Keep a stable desktop viewport; only transform this existing iframe.
          // Match fitFrame's contain scaling, then focus the measured video when available.
          let rect=null;
          if(focusVideo)try{
            const doc=frame.contentDocument;
            if(doc&&new URL(doc.URL).href===channel.url&&!officialPlayerNotice(doc)){
              rect=[...doc.querySelectorAll('video')].filter(v=>v.readyState>=2).map(v=>v.getBoundingClientRect())
                .filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1280&&b.y+b.height<=720)
                .sort((a,b)=>b.width*b.height-a.width*a.height)[0]||null;
            }
          }catch{ /* Loading/login/inaccessible documents retain their whole page. */ }
          const scale=rect?Math.min(width/rect.width,height/rect.height):Math.min(width/1280,height/720);
          const styles={position:'absolute',width:'1280px',height:'720px',transformOrigin:'top left',transform:`scale(${scale})`,
            left:`${rect?(width-rect.width*scale)/2-rect.x*scale:(width-1280*scale)/2}px`,
            top:`${rect?(height-rect.height*scale)/2-rect.y*scale:(height-720*scale)/2}px`,
            clipPath:rect?`inset(${rect.y}px ${1280-rect.x-rect.width}px ${720-rect.y-rect.height}px ${rect.x}px)`:'none'};
          for(const [key,value]of Object.entries(styles))if(frame.style[key]!==value)frame.style[key]=value;
          frame.dataset.cheesemoaView=rect?'video':'page';
        }
        const start=button('방송 시작',()=>{
          if(!isHostRoute()){cleanup();return;}
          if(active.has(channel.url))return;
          if(!visible.includes(channel.url))return;
          if(active.size>=slotCount){state.textContent=`동시 재생 ${slotCount}개 한도입니다. 다른 칸을 정지한 뒤 시작하세요.`;return;}
          const frame=document.createElement('iframe');frame.title=label.textContent;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
          let checks=0,blankChecks=0,retried=false,sawDocument=false;
          let sampledMedia=null,sampledDocument=null,lastTime=null,lastFrames=null,stillTicks=0;
          const resetProgress=()=>{sampledMedia=null;sampledDocument=null;lastTime=null;lastFrames=null;stillTicks=0;};
          function playbackState(items){
            let doc;try{doc=frame.contentDocument;if(!doc||(typeof doc.URL==='string'&&doc.URL!==channel.url)){resetProgress();return 'unverified';}}catch{resetProgress();return 'unverified';}
            const notice=officialPlayerNotice(doc);if(notice){resetProgress();return notice;}
            const v=items.find(v=>v.tagName==='VIDEO')||items[0];
            if(!v){resetProgress();return 'unverified';}
            if(Number.isInteger(v.error?.code)&&v.error.code>=1&&v.error.code<=4){resetProgress();return 'error';}
            if(v.ended){resetProgress();return 'ended';}
            if(v.seeking){resetProgress();return 'verifying';}
            if(v.paused||v.readyState<2){resetProgress();return v.paused?(v.readyState>=2?'paused':'unverified'):'buffering';}
            let frames;try{frames=v.getVideoPlaybackQuality?.().totalVideoFrames??v.webkitDecodedFrameCount;}catch{}
            const time=Number.isFinite(v.currentTime)?v.currentTime:null;
            frames=Number.isFinite(frames)&&frames>=0?frames:null;
            if(time===null&&frames===null){resetProgress();return 'unverified';}
            if(v!==sampledMedia||doc!==sampledDocument){resetProgress();sampledMedia=v;sampledDocument=doc;lastTime=time;lastFrames=frames;return 'verifying';}
            const advanced=(time!==null&&lastTime!==null&&time>lastTime)||(frames!==null&&lastFrames!==null&&frames>lastFrames);
            const rewound=(time!==null&&lastTime!==null&&time<lastTime)||(frames!==null&&lastFrames!==null&&frames<lastFrames);
            lastTime=time;lastFrames=frames;
            if(advanced){stillTicks=0;return 'playing';}
            if(rewound){stillTicks=0;return 'verifying';}
            return ++stillTicks>=3?'stalled':'verifying';
          }
          function showPlayback(kind){
            frame.dataset.cheesemoaPlaybackState=kind;
            const labels={playing:'재생 중 · 영상 진행 확인 · 시청 집계는 치지직 서버 기준',verifying:'재생 진행 확인 중',buffering:'버퍼링 · 재생 준비 대기',paused:'일시정지 · 재개 여부는 공식 플레이어에서 확인',error:'플레이어 오류 · 공식 방송에서 오류 내용을 확인하세요','age-restricted':'연령 제한 안내 · 공식 방송에서 로그인·본인 인증을 확인하세요',stalled:'영상 진행 미확인 · 최근 재생 진행이 관측되지 않았습니다',ended:'재생 종료',unverified:'재생 미확인 · 공식 방송에서 상태를 확인하세요'};
            const snapshot=mediaSnapshot(media(frame)[0]);
            const size=formatVideoDims(snapshot.videoWidth,snapshot.videoHeight);
            const dimensions=size?` · ${size}`:'';
            state.textContent=labels[kind]+dimensions;state.title=state.textContent;syncPlaybackStatus();
          }
          frame.addEventListener('load',()=>{if(active.get(channel.url)?.frame!==frame)return;resetProgress();showPlayback('unverified');try{const doc=frame.contentDocument;if(!doc||doc.URL!=='about:blank')sawDocument=true;}catch{sawDocument=true;}});
          state.textContent='플레이어 로딩 중…';
          frame.dataset.cheesemoaLoadState='loading';
          const timer=setInterval(()=>{
            if(!isHostRoute()){cleanup();return;}
            if(disposed || !frame.isConnected){clearInterval(timer);return;}
            const items=media(frame);syncAudio(items);fitPlayer();updateQuality();showPlayback(playbackState(items));let blank=false;
            try{const doc=frame.contentDocument;blank=doc?.URL==='about:blank'&&doc.readyState==='complete'&&!!doc.body&&!doc.body.childNodes.length;if(doc&&doc.URL!=='about:blank')sawDocument=true;}catch{}
            if(items.length)sawDocument=true;
            blankChecks=blank&&!sawDocument&&!items.length?blankChecks+1:0;
            if(!items.length&&!['error','age-restricted'].includes(frame.dataset.cheesemoaPlaybackState) && ++checks>=20){
              // Mitigation for the observed initial empty document, not a policy bypass.
              // Loaded/error/login pages and any previously loaded player are never retried.
              if(blankChecks>=20&&!sawDocument&&!retried){retried=true;checks=0;blankChecks=0;frame.dataset.cheesemoaLoadState='retrying-blank';state.textContent='빈 플레이어 문서 감지 · 한 번 다시 연결합니다.';frame.src=channel.url;return;}
              frame.dataset.cheesemoaLoadState='unverified';state.textContent='재생 확인 실패 · '+(retried?'자동 재연결 1회 완료. ':'')+'공식 방송에서 상태를 확인하세요. 보안 정책은 변경하지 않습니다.';return;
            }
            hintPower(frame,channel);
            frame.dataset.cheesemoaLoadState=items.length?(mediaReady(items)?'playing':'media-pending'):(retried?'retrying-blank':'loading');
            if(!items.length&&!['error','age-restricted'].includes(frame.dataset.cheesemoaPlaybackState))state.textContent=sawDocument?'재생 미확인 · 공식 방송에서 상태를 확인하세요':retried?'빈 문서 재연결 중 · 추가 자동 재시도 없음':'플레이어 로딩 중 · 재생 미확인';
          },1000);
          const observer=typeof ResizeObserver==='function'?new ResizeObserver(fitPlayer):null;observer?.observe(screen);
          const cleanupLayout=()=>{observer?.disconnect();qualityPending=null;qualityDiagnostic={status:'idle'};};
          active.set(channel.url,{frame,timer,start,stop:stopButton,state,cleanupAudio,cleanupLayout});start.disabled=true;start.hidden=true;stopButton.disabled=false;screen.replaceChildren(frame);fitPlayer();frame.src=channel.url;
          syncSlots();
        },actions);start.className='primary';
        const stopButton=button('정지',()=>{stop(channel.url);screen.replaceChildren(placeholder);syncSlots();},actions);stopButton.disabled=true;
        const mute=button('음소거 ON',()=>{muted=!muted;updateAudioLabel();commandAudio();},actions);
        const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value='50';volume.className='volume';volume.setAttribute('aria-label',`${label.textContent} 음량`);actions.append(volume);
        volume.addEventListener('input',commandAudio);
        const view=button('전체 페이지',()=>{focusVideo=!focusVideo;view.textContent=focusVideo?'전체 페이지':'영상 맞춤';fitPlayer();},actions);view.title='같은 방송을 유지하며 영상 맞춤 또는 공식 페이지 전체를 표시합니다.';
        button('재생 진단',()=>{
          const frame=active.get(channel.url)?.frame;
          let doc=null,documentAccess='not-open';
          if(frame)try{doc=frame.contentDocument;documentAccess=doc?'accessible':'inaccessible';}catch{documentAccess='inaccessible';}
          let documentMatches=null,video=null;
          if(doc)try{documentMatches=doc.URL===channel.url;video=doc.querySelector('video');}catch{documentAccess='inaccessible';}
          const allowedStates=['playing','verifying','buffering','paused','error','age-restricted','stalled','ended','unverified'];
          const result={framePresent:!!frame,documentAccess,documentMatches,
            playbackState:allowedStates.includes(frame?.dataset.cheesemoaPlaybackState)?frame.dataset.cheesemoaPlaybackState:'unverified',
            videoPresent:!!video,...mediaSnapshot(video),qualityMenu:{...qualityDiagnostic}};
          let panel=root.querySelector('section.media-diagnostic');
          if(!panel){
            panel=document.createElement('section');panel.className='media-diagnostic';panel.setAttribute('aria-label','재생 진단');
            const heading=document.createElement('h2');heading.textContent='재생 진단';
            const note=document.createElement('p');note.textContent='요청한 시점의 상태입니다. 오류 코드만으로 네트워크 원인을 판단하지 않습니다.';
            const output=document.createElement('pre');panel.append(heading,note,output);
            button('닫기',()=>{panel.hidden=true;},panel);root.append(panel);
          }
          panel.querySelector('pre').textContent=JSON.stringify(result,null,2);panel.hidden=false;
        },head);
        button('전체화면',()=>{card.requestFullscreen?.().catch(()=>{state.textContent='전체화면을 열지 못했습니다.';});},actions);
      }
      syncSlots();
    }catch{status.textContent='저장 목록을 읽지 못했습니다. 확장 상태를 확인하세요. 기존 방송과 수집기는 변경하지 않았습니다.';}
  }
  document.documentElement.append(container);
  window.dispatchEvent(new Event('cheesemoa-power-layout-change'));
  window.addEventListener('pagehide',()=>{restoreOnShow=!disposed;cleanup();},{once:true});
  void render();
  }
  window.addEventListener('pageshow',event=>{if(event.persisted && restoreOnShow){restoreOnShow=false;mount();}});
  mount();
})();
