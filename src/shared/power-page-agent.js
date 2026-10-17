import {POWER_BUILD} from './power-build.js';
import {REWARD_TYPES} from './log-power.js';
// Runs only in the normal logged-in CHZZK page. No cookies/tokens are extracted.
export function createPagePowerAgent({isPlaying,fetcher=fetch}) {
  const send=async(url,method='GET')=>fetcher(url,{method,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(8000)});
  return async function handle(request){
    const id=request.channelId;
    if(request.kind==='probe')return {build:POWER_BUILD,playing:/^[a-f0-9]{32}$/i.test(id||'')&&isPlaying(id)};
    let mutationDispatched=false;
    try{
      if(!/^[a-f0-9]{32}$/i.test(id||''))throw new Error('INVALID_CHANNEL');
      if(!isPlaying(id))return {build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
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
        if(!isPlaying(id))return {build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
        url=`${base}/claims/${encodeURIComponent(request.claimId)}`;method='PUT';
      }else throw new Error('UNSUPPORTED_REQUEST');
      if(method==='PUT')mutationDispatched=true;
      const response=await send(url,method);let body=await response.text();
      if(body.length>262144)throw new Error('RESPONSE_TOO_LARGE');
      if(request.kind==='account'){if(response.ok){const data=JSON.parse(body);body=JSON.stringify({code:data?.code,content:{loggedIn:data?.content?.loggedIn,userIdHash:data?.content?.userIdHash}})}else body=''}
      return {build:POWER_BUILD,status:response.status,body,retryAfter:response.headers.get('Retry-After')||''};
    }catch(error){return {build:POWER_BUILD,status:0,error:'POWER_TRANSPORT_FAILED',mutationDispatched,phase:mutationDispatched?'mutation':'eligibility',timeout:error?.name==='TimeoutError',schema:['INVALID_CHANNEL','INVALID_ELIGIBILITY','UNSUPPORTED_REQUEST'].includes(error?.message)}}
  };
}
