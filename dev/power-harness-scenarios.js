import {createPowerCollector,POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {createPowerSession} from '../src/shared/power-session.js';
const channel='a'.repeat(32),account='b'.repeat(64),other='c'.repeat(64);
const options={enabled:true,accountId:account};
const reward={claimId:'eligible-one',claimType:'WATCH_1_HOUR',state:'COMPLIED',saveType:'ACTIVE',amount:20};
const check=(ok,message)=>{if(!ok)throw new Error(message)};
// Response.text() uses browser stream tasks, not just Promise microtasks.
const flush=async()=>{for(let i=0;i<12;i++){for(let n=0;n<12;n++)await Promise.resolve();await new Promise(resolve=>{const task=new MessageChannel();task.port1.onmessage=()=>{task.port1.close();task.port2.close();resolve()};task.port2.postMessage(null)})}};
export function createSimulation({mode='ok',blockLock=false,collectorFactory=createPowerCollector}={}){
 let now=100000,id=0,data={},identity=account,selected=channel,claimed=false,locked=blockLock;
 const timers=new Map(),waiters=[],events=[],calls=[];
 const clock={schedule(fn,delay){timers.set(++id,{fn,at:now+delay});return id},cancel(id){timers.delete(id)},now:()=>now};
 const advance=async()=>{await flush();const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first)throw new Error('예약된 작업 없음');timers.delete(first[0]);now=first[1].at;first[1].fn();await flush()};
 const storage={get:async()=>structuredClone(data),set:async patch=>{data=structuredClone(patch)}};
 const locks={request(_,options,fn){return new Promise((resolve,reject)=>{
  let active=false;
  const aborted=()=>{if(!active)reject(new DOMException('Stopped','AbortError'))};
  options.signal.addEventListener('abort',aborted,{once:true});
  const run=()=>{if(options.signal.aborted)return aborted();active=true;locked=true;options.signal.removeEventListener('abort',aborted);Promise.resolve().then(fn).then(resolve,reject).finally(()=>{locked=false;waiters.shift()?.()})};
  if(locked)waiters.push(run);else run();
 })}};
 const response=(status,body,headers)=>new Response(body===undefined?null:JSON.stringify(body),{status,headers});
 const fetcher=async(_,options)=>{
  calls.push(options.method);events.push({at:now,event:`모의 서버 ${options.method}`});
  if(options.method==='GET'){
   if(mode==='get-once'){mode='ok';return response(503,{code:503})}
   if(mode==='deadline'){return new Promise((_,reject)=>clock.schedule(()=>reject(Object.assign(new Error('모의 서버 무응답 시간 초과'),{name:'TimeoutError'})),8000))}
   return response(200,{code:200,content:{active:true,amount:claimed?120:100,claims:[reward]}});
  }
  if(mode==='403')return response(403,{code:403});
  claimed=true;
  if(mode==='uncertain')throw Object.assign(new Error('PUT 후 응답 유실'),{name:'TimeoutError'});
  return response(204);
 };
 const newCollector=()=>collectorFactory({storage,locks,fetcher,...clock});
 const collector=newCollector();
 const states=[];
 const session=createPowerSession({collector,checkAccount:async()=>identity,getChannels:()=>selected?[{id:selected,resourceId:selected,type:'live'}]:[],onStatus:s=>{states.push(s);events.push({at:now,event:`상태 ${s.status}`,detail:s.detail})},...clock});
 return {session,collector,newCollector,advance,states,calls,events,timers,flush,state:()=>data[POWER_STORAGE_KEY],identity:v=>identity=v,channel:v=>selected=v,mode:v=>mode=v,release(){locked=false;waiters.shift()?.()}};
}
export const scenarios=[
 ['success','적격 보상 1회 수령·중복 방지'],['get-recovery','GET 503 후 예약 복구'],['forbidden','403 중단·재시도 없음'],['uncertain','PUT 응답 유실·중복 방지'],['off','OFF로 잠금 대기 취소'],['account','계정 변경 중단'],['channel','주 채널 제거 중단'],['lifecycle','페이지 종료·복원 후 OFF 유지'],['deadline','서버 무응답 시간 제한'],['lock-deadline','잠금 무응답 시간 제한'],['two-clients','두 수집기 동시 실행·PUT 1회']
];
export async function runScenario(key,{collectorFactory=createPowerCollector}={}){
 const h=createSimulation({collectorFactory,mode:({'get-recovery':'get-once',forbidden:'403',uncertain:'uncertain',deadline:'deadline'})[key]||'ok',blockLock:['off','lock-deadline'].includes(key)});
 try{
  if(key==='two-clients'){
   await Promise.all([h.collector.collect(channel,{enabled:true,accountId:account}),h.newCollector().collect(channel,{enabled:true,accountId:account})]);
   check(h.calls.filter(x=>x==='PUT').length===1,'두 수집기가 PUT을 중복 전송함');
   check(h.state().receipts.length===1,'성공 기록 중복');
  }else{
   h.session.start();await h.flush();
   if(key==='success'){
    check(h.state()?.receipts.length===1,'성공 기록 없음');await h.advance();await h.newCollector().collect(channel,options);check(h.calls.filter(x=>x==='PUT').length===1,'성공 보상 재전송');
   }else if(key==='get-recovery'){
    check(h.states.at(-1).status==='waiting','GET 실패가 대기로 전환되지 않음');check(!h.calls.includes('PUT'),'조회 실패 전에 PUT 전송');await h.advance();check(h.state()?.receipts.length===1,'GET 복구 후 수령 실패');
   }else if(key==='forbidden'){
    check(h.states.at(-1).enabled===false,'403 이후 ON 유지');check(h.state().receipts.length===0,'403 허위 성공');check(h.timers.size===0,'403 이후 재시도 예약');
   }else if(key==='uncertain'){
    check(h.state().attempts[0].status==='unconfirmed','결과 불명 보존 실패');check(h.state().receipts.length===0,'결과 불명 허위 성공');h.mode('ok');h.session.start();await h.flush();check(h.calls.filter(x=>x==='PUT').length===1,'미확인 보상 재전송');
   }else if(key==='off'){
    h.session.stop();await h.flush();h.release();await h.flush();check(h.calls.length===0,'OFF 이후 요청 발생');check(h.states.at(-1).status==='off','OFF 표시 불일치');
   }else if(key==='account'){
    const before=h.calls.length;h.identity(other);await h.advance();check(h.states.at(-1).enabled===false,'계정 변경 이후 ON 유지');check(h.calls.length===before,'계정 변경 이후 요청');
   }else if(key==='channel'){
    const before=h.calls.length;h.channel(null);await h.advance();check(h.states.at(-1).enabled===false,'주 채널 제거 이후 ON 유지');check(h.calls.length===before,'주 채널 제거 이후 요청');
   }else if(key==='lifecycle'){
    // The standalone owner uses these same explicit pagehide/pageshow handlers.
    h.session.stop();const before=h.calls.length;await h.flush();check(h.timers.size===0,'종료 후 타이머 잔류');check(h.states.at(-1).enabled===false,'복원 전 OFF 누락');await h.flush();check(h.calls.length===before,'복원만으로 재시작');
   }else if(key==='deadline'){
    await h.advance();check(h.states.at(-1).status==='waiting','무응답이 checking에 고착');check(!h.calls.includes('PUT'),'무응답 중 PUT');h.session.stop();
   }else if(key==='lock-deadline'){
    await h.advance();check(h.states.at(-1).enabled===false,'잠금 무응답 ON 고착');check(h.calls.length===0,'잠금 없이 요청');h.release();h.session.start();await h.flush();check(h.state()?.receipts.length===1,'잠금 해제 후 명시 시작 실패');
   }
  }
  return {key,passed:true,server:'모의 서버',getCount:h.calls.filter(x=>x==='GET').length,putCount:h.calls.filter(x=>x==='PUT').length,receipts:h.state()?.receipts.length||0,unconfirmed:h.state()?.attempts.filter(a=>a.status==='unconfirmed').length||0,finalStatus:h.states.at(-1)?.status||'completed',events:h.events};
 }finally{h.session.stop()}
}
