import {scenarios,runScenario,createSimulation} from './power-harness-scenarios.js';
const select=document.querySelector('#scenario'),status=document.querySelector('#status'),results=document.querySelector('#results'),diagnostics=document.querySelector('#diagnostics');
for(const [key,name]of scenarios){const o=document.createElement('option');o.value=key;o.textContent=name;select.append(o)}
async function run(entries){
 document.querySelectorAll('button').forEach(b=>b.disabled=true);results.replaceChildren();let passed=0;const details=[];
 try{for(const [key,name] of entries){status.textContent=`실행 중: ${name}`;let result;try{result=await runScenario(key);passed++}catch(e){result={key,passed:false,error:e.message}}details.push(result);
 const row=document.createElement('tr');for(const text of [name,result.passed?'통과':'실패',`${result.getCount??'-'} / ${result.putCount??'-'}`,`${result.receipts??'-'} / ${result.unconfirmed??'-'}`]){const td=document.createElement('td');td.textContent=text;row.append(td)}row.children[1].className=result.passed?'pass':'fail';if(!result.passed){const reason=document.createElement('p');reason.textContent='실패 이유: '+result.error;row.children[0].append(reason)}results.append(row)}
 status.textContent=`${passed}/${entries.length} 통과 · 모의 서버 검증 · 실서버 수령 미검증`;diagnostics.textContent=JSON.stringify(details,null,2);
 }finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);paintLive()}
}
document.querySelector('#run-all').addEventListener('click',()=>run(scenarios));document.querySelector('#run-one').addEventListener('click',()=>run(scenarios.filter(([key])=>key===select.value)));

let live=createSimulation();
function paintLive(){
 const state=live.states.at(-1);
 document.querySelector('#live-status').textContent=`${state?.enabled?'ON':'OFF'} · ${state?.status||'시작 전'} · ${state?.detail||''}`;
 document.querySelector('#live-counts').textContent=`GET ${live.calls.filter(x=>x==='GET').length} · PUT ${live.calls.filter(x=>x==='PUT').length} · 확정 ${live.state()?.receipts.length||0} · 미확인 ${live.state()?.attempts.filter(a=>a.status==='unconfirmed').length||0}`;
 document.querySelector('#next-live').disabled=live.timers.size===0;
}
async function liveAction(action){try{await action();await live.flush();paintLive()}catch(e){document.querySelector('#live-status').textContent=`실패 · ${e.message}`}}
document.querySelector('#reset-live').addEventListener('click',()=>liveAction(()=>{live.session.stop();live=createSimulation({mode:document.querySelector('#live-mode').value})}));
document.querySelector('#start-live').addEventListener('click',()=>liveAction(()=>live.session.start()));
document.querySelector('#stop-live').addEventListener('click',()=>liveAction(()=>live.session.stop()));
document.querySelector('#next-live').addEventListener('click',()=>liveAction(()=>live.advance()));
window.addEventListener('pagehide',()=>{live.session.stop();paintLive()});
window.addEventListener('pageshow',()=>paintLive());
paintLive();
