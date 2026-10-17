import {createRuntimeSimulation} from './power-runtime-simulation.js';
import {POWER_BUILD} from '../src/shared/power-build.js';
import {POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
document.querySelector('#build').textContent=POWER_BUILD;
const names={off:'꺼짐',connecting:'시작 연결 중',checking:'확인 중',checked:'조회 정상',waiting:'재조회 대기',blocked:'미확인 보상 보존',error:'중단','auth-required':'로그인 확인 필요'};
let env=createRuntimeSimulation({onState:()=>queueMicrotask(paint)}),owner=env.owner,doc=1,tab=1,busy=false,operationError=null,operation=0;
function paint(){
 const s=env.states.at(-1),record=env.local.snapshot()[POWER_STORAGE_KEY],status=document.querySelector('#status');
 status.textContent=operationError?`검증 실행 실패 · ${operationError}`:`${s?.enabled?'ON':'OFF'} · ${names[s?.status]||'시작 전'}`;
 status.setAttribute('role',operationError?'alert':'status');
 document.querySelector('#detail').textContent=operationError?'검증 프로그램의 실행이 끝나지 못했습니다. 정상 수령이나 검증 통과로 처리하지 않았습니다. 새 모의 환경에서 다시 확인할 수 있습니다.':s?.detail||'직접 ON을 눌러 모의 수집을 시작하세요.';
 document.querySelector('#counts').textContent=`조회 요청 ${env.calls.filter(c=>c.method==='GET').length} · 수령 요청 ${env.calls.filter(c=>c.method==='PUT').length} · 모의 확정 ${record?.receipts.length||0}건 · 미확인 ${record?.attempts.filter(a=>a.status==='unconfirmed').length||0}건`;
 document.querySelector('#events').textContent=JSON.stringify(env.states.map(s=>({enabled:s.enabled,status:s.status,detail:s.detail})),null,2);
 for(const id of ['reset','restore','takeover'])document.querySelector('#'+id).disabled=busy;
 document.querySelector('#on').disabled=busy||s?.enabled===true;
 // OFF stays available while a start is still connecting.
 document.querySelector('#off').disabled=!(s?.enabled||s?.canStop);
 document.querySelector('#tick').disabled=busy||!env.timers.size;
}
async function action(fn){
 const turn=++operation;busy=true;operationError=null;paint();
 try{await fn();await env.flush()}catch(e){if(turn===operation)operationError=e.message}
 finally{if(turn===operation)busy=false;paint()}
}
document.querySelector('#on').onclick=()=>action(()=>owner.start());
document.querySelector('#off').onclick=()=>action(()=>owner.stop());
document.querySelector('#tick').onclick=()=>action(()=>env.advance());
document.querySelector('#reset').onclick=()=>action(()=>{env.dispose();env=createRuntimeSimulation({mode:document.querySelector('#condition').value,onState:()=>queueMicrotask(paint)});owner=env.owner;doc=1;tab=1});
document.querySelector('#restore').onclick=()=>action(async()=>{owner.suspend();owner=env.createOwner({tabId:tab,documentId:`restored-${++doc}`});await owner.restore()});
document.querySelector('#takeover').onclick=()=>action(async()=>{owner=env.createOwner({tabId:++tab,documentId:`tab-${tab}`});await owner.start()});
window.addEventListener('pagehide',()=>env.dispose());paint();
