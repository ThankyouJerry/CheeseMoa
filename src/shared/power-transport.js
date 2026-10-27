import {PowerRequestError} from './log-power.js';
// Protocol .7 distinguishes proven preflight failure from an uncertain mutation.
const HOST_BUILD = 'power-20261011.7';
const HOST = 'https://chzzk.naver.com/lives#cheesemoa-multiview';
const ACCOUNT = 'https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus';
// The extension-origin collector retains the single storage lock. Only networking
// runs in an already-open CHZZK content script, with the browser's normal cookies.
export function createPowerTransport({chromeApi = chrome, getChannelId,
  schedule = setTimeout, cancel = clearTimeout, messageTimeoutMs = 20000, targetContext=null, protocol=HOST_BUILD}) {
  let tabId = null;
  // A suspended/disconnected receiver may never settle a Chrome message promise.
  // This only bounds waiting; it cannot cancel or replay a dispatched mutation.
  async function bounded(operation, timeoutMs=messageTimeoutMs) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = schedule(() => reject(Object.assign(
            new Error('치지직 연결 응답 시간이 초과되었습니다.'), {name:'TimeoutError'})), timeoutMs);
        }),
      ]);
    } finally { cancel(timer); }
  }
  function descriptor(url, method, channelId) {
    if (url === ACCOUNT && method === 'GET') return {kind:'account',channelId};
    const base=`https://api.chzzk.naver.com/service/v1/channels/${channelId}/log-power`;
    if (url === base && method === 'GET') return {kind:'balance',channelId};
    if (url.startsWith(base+'/claims/') && method === 'PUT') {
      const claimId=decodeURIComponent(url.slice((base+'/claims/').length));
      if (claimId && claimId.length<=200 && encodeURIComponent(claimId)===url.slice((base+'/claims/').length)) return {kind:'claim',channelId,claimId};
    }
    throw new Error('허용되지 않은 보상 요청입니다.');
  }
  function hostError(reason, method) {
    const details = {
      missing: '열린 치즈모아 방송 창을 찾지 못했습니다. 방송 창을 유지해주세요.',
      unavailable: '방송 창의 연결 응답을 받지 못했습니다.',
      playback: '선택 채널이 일시정지·버퍼링 중이거나 재생 준비가 되지 않았습니다.',
      version: '방송 창의 수령 연결 버전이 다릅니다. 확장을 다시 로드한 뒤 새 멀티뷰를 열어주세요.',
    };
    // A failed local probe proves even a requested PUT has not been dispatched.
    if(reason==='playback')method='GET';
    const retryable = method === 'GET' && reason !== 'version';
    return Object.assign(new Error(details[reason]), {
      code: reason==='playback'&&method==='GET'?'POWER_PLAYBACK_WAIT':'POWER_HOST_REQUIRED', hostReason: reason, method, retryable, mutationDispatched: false,
    });
  }
  async function target(channelId, method, identityOnly=false) {
    let tabs;
    if(targetContext)tabs=[{id:targetContext.tabId,url:HOST}];
    else try { tabs = await bounded(()=>chromeApi.tabs.query({url:'https://chzzk.naver.com/lives*'})); }
    catch { throw hostError('unavailable', method); }
    const candidates = tabs.filter(t=>t.url===HOST).sort((a,b)=>(b.id===tabId)-(a.id===tabId));
    let reason = candidates.length ? 'unavailable' : 'missing';
    for (const tab of candidates) {
      try {
        const p=await bounded(()=>chromeApi.tabs.sendMessage(tab.id,targetContext?{type:'cheesemoa-page-network',kind:'probe',channelId}:{type:'cheesemoa-power-probe',channelId},targetContext?{documentId:targetContext.documentId}:{frameId:0}));
        if (p?.build===protocol) {
          // Fresh identity verification must survive a pause after PUT. Only a
          // pinned document may do this; reward requests still require playback.
          if (p.playing===true || (identityOnly && targetContext && p.playing===false)) {tabId=tab.id;return tab.id;}
          reason = 'playback';
        } else if (typeof p?.build === 'string' && reason !== 'playback') {
          reason = 'version';
        }
      } catch { /* Keep GET recovery bounded by the session; never resend PUT. */ }
    }
    throw hostError(reason, method);
  }
  return {
    async collectWatchReward(channelId, reward) {
      if (!targetContext || channelId !== getChannelId() || reward?.claimType !== 'WATCH_1_HOUR')
        throw Object.assign(new Error('공식 보상 UI를 연결하지 못했습니다.'),
          {code:'POWER_WATCH_UI_WAIT',method:'GET',status:0,retryable:true,mutationDispatched:false});
      const id=await target(channelId,'GET');
      let result;
      try {
        result=await bounded(()=>chromeApi.tabs.sendMessage(id,{type:'cheesemoa-page-network',kind:'watch-ui',
          channelId,claimId:reward.claimId},{documentId:targetContext.documentId}),45000);
      } catch {
        throw Object.assign(new Error('공식 버튼 수령 결과를 확인하지 못했습니다.'),
          {code:'WATCH_UI_UNCONFIRMED',method:'UI',status:0,retryable:false,mutationDispatched:true});
      }
      const r=result?.receipt;
      const expected=Number.isSafeInteger(reward.amount)&&reward.amount>0?reward.amount:1;
      if(result?.build===protocol&&result.kind==='confirmed'&&r?.collectionMethod==='official-ui'&&
        r.confirmation==='claim-and-balance'&&r.channelId===channelId&&r.claimId===reward.claimId&&
        r.claimType==='WATCH_1_HOUR'&&Number.isFinite(r.confirmedAt)&&
        Number.isSafeInteger(r.balanceBefore)&&r.balanceBefore>=0&&Number.isSafeInteger(r.balanceAfter)&&
        r.balanceAfter-r.balanceBefore>=expected) return {...r,amount:reward.amount,amountSource:reward.amount===null?'unknown':'offered-reward'};
      const unsent=result?.build===protocol&&result.mutationDispatched===false&&result.phase==='eligibility';
      const wait=unsent&&result.error==='POWER_WATCH_UI_WAIT';
      const status=unsent&&Number.isInteger(result.status)?result.status:0;
      throw Object.assign(new PowerRequestError(status,{method:unsent?'GET':'UI',
        httpStatus:result?.httpStatus??(status>=100?status:null),applicationCode:result?.applicationCode??null,
        schema:result?.schema===true,retryAfterMs:Number.isFinite(result?.retryAfterMs)?Math.max(0,result.retryAfterMs):0,
        errorCode:wait?'POWER_WATCH_UI_WAIT':unsent?'PREFLIGHT_FAILED':'WATCH_UI_UNCONFIRMED'}),
        {code:wait?'POWER_WATCH_UI_WAIT':unsent?'WATCH_UI_PREFLIGHT_FAILED':'WATCH_UI_UNCONFIRMED',
          mutationDispatched:!unsent,phase:unsent?'eligibility':'mutation'});
    },
    async fetcher(url, options={}) {
      const channelId=getChannelId();
      if (!/^[a-f0-9]{32}$/i.test(channelId||'')) throw new Error('주 채널을 선택하세요.');
      const request=descriptor(url,options.method||'GET',channelId);
      const identityOnly=request.kind==='account'&&!!targetContext&&options.postMutationIdentity===true;
      if(identityOnly)request.postMutationIdentity=true;
      const id=await target(channelId, options.method || 'GET',identityOnly);
      const result=await bounded(()=>chromeApi.tabs.sendMessage(id,{type:targetContext?'cheesemoa-page-network':'cheesemoa-power-request',...request},targetContext?{documentId:targetContext.documentId}:{frameId:0}));
      // Only explicit, proven-unsent local readiness may bypass HTTP backoff.
      if(result?.build===protocol && result.error==='POWER_PLAYBACK_WAIT' && result.status===0 &&
          result.mutationDispatched===false && result.phase==='eligibility'){
        throw Object.assign(hostError('playback','GET'),{phase:'eligibility'});
      }
      if (request.kind==='claim' && result?.build===protocol && result.mutationDispatched===false && result.phase==='eligibility') {
        const seconds=Number(result.retryAfter);
        const retryAfterMs=result.retryAfter ? (Number.isFinite(seconds) ? Math.max(0,seconds*1000) : Math.max(0,Date.parse(result.retryAfter)-Date.now())||0) : 0;
        const status=Number.isInteger(result.status) ? result.status : 0;
        const error=new PowerRequestError(status,{method:'GET',retryAfterMs,schema:result.schema===true,
          httpStatus:status>=100&&status<=599?status:null,errorCode:result.timeout?'TIMEOUT':'PREFLIGHT_FAILED'});
        if(result.timeout)error.name='TimeoutError';
        error.mutationDispatched=false;error.phase='eligibility';
        throw error;
      }
      if (result?.build===protocol && result.error && result.mutationDispatched===true) {
        const error=new PowerRequestError(0,{method:'PUT',errorCode:result.timeout?'TIMEOUT':'NETWORK_ERROR'});
        if(result.timeout)error.name='TimeoutError';
        throw error;
      }
      if (result?.build!==protocol || !Number.isInteger(result.status) || result.status<100 || result.status>599) {
        throw new Error('치지직 보상 요청을 확인하지 못했습니다. 자동 재전송하지 않습니다.');
      }
      return new Response([204,205,304].includes(result.status)?null:result.body,{status:result.status,headers:result.retryAfter?{'Retry-After':result.retryAfter}:{}});
    },
    reset() { tabId=null; },
    subscribe(onAvailable) {
      const listener=(message,sender)=>{
        if (sender.id===chromeApi.runtime.id && sender.tab?.id===tabId && sender.frameId===0 && sender.url===HOST &&
            message?.type==='cheesemoa-power-available' && message.build===HOST_BUILD && message.channelId===getChannelId()) onAvailable();
      };
      chromeApi.runtime?.onMessage?.addListener(listener);
      return ()=>chromeApi.runtime?.onMessage?.removeListener(listener);
    },
  };
}
