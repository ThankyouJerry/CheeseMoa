// Same-origin CHZZK host. Independent implementation; no security headers changed.
(() => {
  'use strict';
  let restoreOnShow=false;
  const isHostRoute=()=>location.origin==='https://chzzk.naver.com'&&location.pathname==='/lives'&&!location.search&&location.hash==='#cheesemoa-multiview';
  function mount() {
  if (window !== window.top || !isHostRoute()) return;
  const rootId = 'cheesemoa-site-host';
  if (document.getElementById(rootId)) return;
  const MAX_ACTIVE = 4;
  const container = document.createElement('div'); container.id = rootId;
  container.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#091c29';
  const root = container.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = `.workspace{display:grid;height:100%;min-height:0;grid-template-columns:minmax(0,1fr)}.power-dock{display:none;min-width:0;min-height:0;overflow:auto;padding:8px 8px 8px 0}:host([data-power-docked="true"]) .workspace{grid-template-columns:minmax(0,1fr) 280px}:host([data-power-docked="true"]) .power-dock{display:block}
:host{color:#f3f7fa;font:13px/1.4 system-ui,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}
main{height:100vh;height:100dvh;min-height:0;display:flex;flex-direction:column;gap:6px;overflow:hidden;padding:8px;background:#091c29}
header{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}main>header{flex:none;flex-wrap:wrap}h1{margin:0;font-size:18px}h1 small{display:block;color:#9eb4c3;font-size:11px}
button,select,a{font:inherit}button,select{min-height:28px;min-width:0;border:1px solid #617c8d;border-radius:7px;background:#19384c;color:white;padding:3px 7px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:#ffc83d;color:#172c38;border-color:#ffc83d;font-weight:800}a{color:#ffdc78}nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.note{color:#b5cad7;font-size:11px;margin:0;flex:none}
.help{flex:none;font-size:11px;color:#b5cad7}.help summary{cursor:pointer}.help[open]{max-height:100px;overflow:auto}.notice{padding:6px;border:1px solid #ffc83d60;border-radius:7px}
.grid{display:grid;flex:1;min-width:0;min-height:0;grid-template-columns:repeat(var(--columns,2),minmax(0,1fr));grid-template-rows:repeat(var(--rows,2),minmax(0,1fr));gap:8px}
article{display:grid;grid-template-rows:28px 34px minmax(0,1fr) 24px;min-width:0;min-height:0;border:1px solid #36556b;border-radius:10px;overflow:hidden;background:#102d40}article header{padding:3px 8px}article h2{font-size:13px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}article header a{flex:none;font-size:11px}article .actions{display:flex;align-items:center;gap:4px;padding:2px 6px;overflow-x:auto;white-space:nowrap}article .actions>*{flex-shrink:0}article .actions select{width:120px;min-width:100px;flex-shrink:0}
.screen{position:relative;min-height:0;min-width:0;overflow:hidden;background:#050e15;display:grid;place-items:center}.screen p{padding:12px;text-align:center;color:#b5cad7;font-size:12px}iframe{border:0;width:100%;height:100%;display:block}.state{padding:4px 8px;margin:0;font-size:11px;color:#a9c4d6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{padding:20px}.volume{width:64px}button:focus-visible,a:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #ffc83d;outline-offset:2px}
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
      function syncSlots(){
        grid.style.setProperty('--columns',slotCount===1?'1':'2');
        grid.style.setProperty('--rows',String(Math.max(1,Math.ceil(slotCount/2))));
        for(const [url,item] of cards){
          item.card.hidden=!visible.includes(url);
          item.picker.value=url;item.picker.disabled=active.has(url);
          for(const o of item.picker.options)o.disabled=o.value!==url && visible.includes(o.value);
        }
        status.textContent=`저장된 ${channels.length}개 · ${slotCount}개 보기 · 이 창 재생 ${active.size}개 · 방송은 각 칸에서 선택하고 직접 시작하세요. 저장 목록은 유지됩니다.`;
      }
      layout.addEventListener('change',()=>{
        const requested=Number(layout.value);
        if(!Number.isInteger(requested)||requested<1||requested>Math.min(MAX_ACTIVE,channels.length)) {layout.value=String(slotCount);return;}
        if(active.size>requested){
          layout.value=String(slotCount);
          status.textContent=`현재 ${active.size}개 방송이 재생 중입니다. ${requested}개로 줄이려면 먼저 유지하지 않을 방송의 ‘정지’를 눌러주세요. 재생 중인 방송은 그대로 유지했습니다.`;
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
            if(doc&&new URL(doc.URL).href===channel.url){
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
          frame.addEventListener('load',()=>{try{const doc=frame.contentDocument;if(!doc||doc.URL!=='about:blank')sawDocument=true;}catch{sawDocument=true;}});
          state.textContent='플레이어 로딩 중…';
          frame.dataset.cheesemoaLoadState='loading';
          const timer=setInterval(()=>{
            if(!isHostRoute()){cleanup();return;}
            if(disposed || !frame.isConnected){clearInterval(timer);return;}
            const items=media(frame);syncAudio(items);fitPlayer();let blank=false;
            try{const doc=frame.contentDocument;blank=doc?.URL==='about:blank'&&doc.readyState==='complete'&&!!doc.body&&!doc.body.childNodes.length;if(doc&&doc.URL!=='about:blank')sawDocument=true;}catch{}
            if(items.length)sawDocument=true;
            blankChecks=blank&&!sawDocument&&!items.length?blankChecks+1:0;
            if(!items.length && ++checks>=20){
              // Mitigation for the observed initial empty document, not a policy bypass.
              // Loaded/error/login pages and any previously loaded player are never retried.
              if(blankChecks>=20&&!sawDocument&&!retried){retried=true;checks=0;blankChecks=0;frame.dataset.cheesemoaLoadState='retrying-blank';state.textContent='빈 플레이어 문서 감지 · 한 번 다시 연결합니다.';frame.src=channel.url;return;}
              frame.dataset.cheesemoaLoadState='unverified';state.textContent='재생 확인 실패 · '+(retried?'자동 재연결 1회 완료. ':'')+'공식 방송에서 상태를 확인하세요. 보안 정책은 변경하지 않습니다.';return;
            }
            hintPower(frame,channel);
            frame.dataset.cheesemoaLoadState=items.length?(mediaReady(items)?'playing':'media-pending'):(retried?'retrying-blank':'loading');
            state.textContent=items.length?(mediaReady(items)?'재생 중 · 시청 집계는 치지직 서버 기준':items.some(v=>!v.paused)?'버퍼링 · 재생 준비 대기 · 보상 요청 대기':'일시정지 · 플레이어에서 재생 가능'):(retried?'빈 문서 재연결 중 · 추가 자동 재시도 없음':'플레이어 로딩 중…');
          },1000);
          const observer=typeof ResizeObserver==='function'?new ResizeObserver(fitPlayer):null;observer?.observe(screen);
          const cleanupLayout=()=>observer?.disconnect();
          active.set(channel.url,{frame,timer,start,stop:stopButton,state,cleanupAudio,cleanupLayout});start.disabled=true;start.hidden=true;stopButton.disabled=false;screen.replaceChildren(frame);fitPlayer();frame.src=channel.url;
          syncSlots();
        },actions);start.className='primary';
        const stopButton=button('정지',()=>{stop(channel.url);screen.replaceChildren(placeholder);syncSlots();},actions);stopButton.disabled=true;
        const mute=button('음소거 ON',()=>{muted=!muted;updateAudioLabel();commandAudio();},actions);
        const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value='50';volume.className='volume';volume.setAttribute('aria-label',`${label.textContent} 음량`);actions.append(volume);
        volume.addEventListener('input',commandAudio);
        const view=button('전체 페이지',()=>{focusVideo=!focusVideo;view.textContent=focusVideo?'전체 페이지':'영상 맞춤';fitPlayer();},actions);view.title='같은 방송을 유지하며 영상 맞춤 또는 공식 페이지 전체를 표시합니다.';
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
