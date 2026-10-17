import {createPowerSession} from './power-session.js';
export function createPagePowerOwner({send,getChannelId,onState,schedule=setTimeout,cancel=clearTimeout,now=Date.now,requestId=()=>crypto.randomUUID()}){
 let epoch=null,channelId=null,startRequestId=null,generation=0,suspended=false,locallyEnabled=false;
 async function request(action,extra={}){
  const reply=await send({type:'cheesemoa-power-core',action,channelId,epoch,startRequestId,...extra});
  if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'수집 연결 응답을 확인하지 못했습니다.'),reply?.error||{});
  return reply.result;
 }
 const cancelStart=(id,channel,remember=false)=>id?request('cancel-start',{startRequestId:id,channelId:channel,remember}):remember?request('disable-default'):Promise.resolve();
 const session=createPowerSession({schedule,cancel,now,getChannels:()=>channelId?[{id:channelId,resourceId:channelId,type:'live'}]:[],
  checkAccount:async()=>(await request('account')).accountId,collector:{collect:()=>request('collect')},
  onStatus(state){locallyEnabled=state.enabled===true;onState(state);if(!suspended&&['error','auth-required'].includes(state.status)&&epoch)void request('stop').catch(()=>{})}});
 const api={
  async start({automatic=false}={}){
   const previousId=startRequestId,previousChannel=channelId;
   const turn=++generation;session.stop();epoch=null;channelId=getChannelId();suspended=false;startRequestId=requestId();
   const id=startRequestId,channel=channelId;
   if(previousId)void cancelStart(previousId,previousChannel).catch(()=>{});
   if(!/^[a-f0-9]{32}$/i.test(channel||'')){onState({enabled:false,status:'error',detail:'재생할 방송을 선택하세요.'});return}
   onState({enabled:false,status:'connecting',canStop:true,detail:'자동수령 시작을 연결하고 있습니다. OFF로 취소할 수 있습니다.'});
   try{
    const prepared=await request('start',{startRequestId:id,channelId:channel,automatic});
    if(turn!==generation){await cancelStart(id,channel);return}
    epoch=prepared.epoch;
    const active=await request('activate',{startRequestId:id,channelId:channel});
    if(turn!==generation){await cancelStart(id,channel);return}
    session.start(active);
   }catch(error){
    let saved=true;try{await cancelStart(id,channel)}catch{saved=false}
    if(turn===generation)onState({enabled:false,status:'error',detail:saved?error.message:'이 화면의 조회는 중단했습니다. 시작 취소 저장은 아직 확인되지 않았습니다.'});
   }
  },
  async stop({remember=false}={}){generation++;suspended=false;session.stop();try{await cancelStart(startRequestId,channelId,remember)}catch(error){onState({enabled:false,status:'error',detail:error.code==='POWER_PREFERENCE_SAVE_FAILED'?'자동수령을 중단했습니다. 다음 실행의 OFF 설정 저장은 확인하지 못했습니다.':'이 화면의 조회는 중단했습니다. 실행 주체의 OFF 저장을 확인하지 못했습니다.'})}},
  suspend(){generation++;suspended=true;session.stop()},
  deactivate(expectedEpoch){if(expectedEpoch!==epoch||!locallyEnabled)return;generation++;suspended=true;session.stop()},
  async restore(){
   const turn=++generation;channelId=getChannelId();suspended=false;
   if(!/^[a-f0-9]{32}$/i.test(channelId||''))return;
   try{const state=await request('status');if(turn!==generation)return;epoch=state.epoch;startRequestId=state.startRequestId;
    if(state.enabled)session.start(state);else if(state.defaultOn===true)await api.start({automatic:true});else onState({enabled:false,status:'off',detail:state.otherEnabled?'다른 방송 창에서 자동수령 중입니다. 이 창에서 ON을 누르면 실행 창을 전환합니다.':'자동수령 OFF · 직접 ON을 눌러 시작하세요.'});
   }catch{onState({enabled:false,status:'error',detail:'수집 연결을 확인하지 못했습니다. 자동수령은 시작하지 않았습니다.'})}
  },checkNow:()=>session.checkNow(),
 };
 return api;
}
