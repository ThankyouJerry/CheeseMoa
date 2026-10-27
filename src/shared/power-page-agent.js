import {POWER_BUILD} from './power-build.js';
import {REWARD_TYPES} from './log-power.js';
import {collectWatchUiReward} from './watch-ui-claim.js';
// Runs only in the normal logged-in CHZZK page. No cookies/tokens are extracted.
export function createPagePowerAgent({isPlaying,getDocument,isEnabled,fetcher=fetch}) {
  const send=async(url,method='GET')=>fetcher(url,{method,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(8000)});
  return async function handle(request){
    const id=request.channelId;
    if(request.kind==='probe')return {build:POWER_BUILD,playing:/^[a-f0-9]{32}$/i.test(id||'')&&isPlaying(id)};
    let mutationDispatched=false;
    try{
      if(!/^[a-f0-9]{32}$/i.test(id||''))throw new Error('INVALID_CHANNEL');
      // Account identity is freshly verified even if playback stopped after PUT.
      // Balance and claim requests remain gated on the selected player's state.
      if(!(request.kind==='account'&&request.postMutationIdentity===true)&&!isPlaying(id))return {build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
      if(request.kind==='watch-ui'&&typeof request.claimId==='string'&&request.claimId.length>0&&request.claimId.length<=200){
        const receipt=await collectWatchUiReward({channelId:id,claimId:request.claimId,getDocument,isPlaying,isEnabled,fetcher});
        return {build:POWER_BUILD,kind:'confirmed',receipt};
      }
      const base=`https://api.chzzk.naver.com/service/v1/channels/${id}/log-power`;
      let url,method='GET';
      if(request.kind==='account')url='https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus';
      else if(request.kind==='balance')url=base;
      else if(request.kind==='claim'&&typeof request.claimId==='string'&&request.claimId.length>0&&request.claimId.length<=200){
        const check=await send(base);
        if(!check.ok)return {build:POWER_BUILD,status:check.status,body:'',phase:'eligibility',mutationDispatched:false,retryAfter:check.headers.get('Retry-After')||''};
        const data=await check.json();
        if(data?.code!==200||data.content?.active!==true||!Array.isArray(data.content.claims))throw new Error('INVALID_ELIGIBILITY');
        const claim=data.content.claims.find(c=>String(c?.claimId)===request.claimId&&c.state==='COMPLIED'&&c.saveType==='ACTIVE'&&Object.hasOwn(REWARD_TYPES,c.claimType));
        if(!claim)return {build:POWER_BUILD,status:409,body:'',phase:'eligibility',mutationDispatched:false};
        if(claim.claimType==='WATCH_1_HOUR')return {build:POWER_BUILD,status:422,error:'WATCH_UI_REQUIRED',mutationDispatched:false,phase:'eligibility',schema:true};
        if(!isPlaying(id))return {build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
        url=`${base}/claims/${encodeURIComponent(request.claimId)}`;method='PUT';
      }else throw new Error('UNSUPPORTED_REQUEST');
      if(method==='PUT')mutationDispatched=true;
      const response=await send(url,method);let body=await response.text();
      if(body.length>262144)throw new Error('RESPONSE_TOO_LARGE');
      if(request.kind==='account'){if(response.ok){const data=JSON.parse(body);body=JSON.stringify({code:data?.code,content:{loggedIn:data?.content?.loggedIn,userIdHash:data?.content?.userIdHash}})}else body=''}
      return {build:POWER_BUILD,status:response.status,body,retryAfter:response.headers.get('Retry-After')||''};
    }catch(error){
      const dispatched=mutationDispatched||error.mutationDispatched===true;
      const safeCode=['POWER_WATCH_UI_WAIT','WATCH_UI_UNCONFIRMED','WATCH_ALREADY_UNAVAILABLE'].includes(error.code)?error.code:'POWER_TRANSPORT_FAILED';
      return {build:POWER_BUILD,status:Number.isInteger(error.status)?error.status:0,error:safeCode,
        mutationDispatched:dispatched,phase:dispatched?'mutation':'eligibility',
        httpStatus:error.httpStatus,applicationCode:error.applicationCode,
        retryAfterMs:Number.isFinite(error.retryAfterMs)&&error.retryAfterMs>=0?error.retryAfterMs:0,
        timeout:error?.name==='TimeoutError',schema:error.status==='schema'||['INVALID_CHANNEL','INVALID_ELIGIBILITY','UNSUPPORTED_REQUEST'].includes(error?.message)};
    }
  };
}
