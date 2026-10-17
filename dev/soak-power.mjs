import {mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPowerCoordinator,safePowerError} from '../src/background/power-coordinator.js';
import {createPagePowerOwner} from '../src/shared/power-page-owner.js';
import {createPagePowerAgent} from '../src/shared/power-page-agent.js';
import {POWER_BUILD} from '../src/shared/power-build.js';
import {POWER_STORAGE_KEY} from '../src/shared/power-collector.js';
import {memoryStore,memoryLocks} from './power-runtime-simulation.js';
const options=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const duration=Number(options['duration-ms']||5400000),scale=Number(options.scale||1);
if(!Number.isFinite(duration)||duration<1000||!Number.isFinite(scale)||scale<1)throw new Error('Invalid duration/scale');
const mode=scale===1?'real-elapsed-time':'accelerated-clock';
const directory=new URL(`./soak-v${POWER_BUILD.split('.').at(-1)}${scale===1?'':'-accelerated'}/`,import.meta.url);await mkdir(directory,{recursive:true});
const started=Date.now(),startMono=performance.now(),simNow=()=>started+(performance.now()-startMono)*scale;
const end=started+duration/scale;
const toKst=t=>new Date(t+9*3600000).toISOString().replace('T',' ').replace('Z',' KST');
const hashes={};for(const path of ['../src/shared/power-page-owner.js','../src/background/power-coordinator.js','../src/shared/power-page-agent.js','../src/shared/power-collector.js','../src/shared/power-session.js','../src/shared/power-transport.js'])hashes[path]=createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex');
hashes.runner=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const local=memoryStore(),session=memoryStore(),locks=memoryLocks(),agents=new Map(),owners=[],puts=new Map(),faults=[],actions=[],scopeChecks=[];
let channel='a'.repeat(32),accountFailureBudget=0,failedAccountGet=0,accountGets=0,accountGetsAtSwitch;
let epoch=0,tab=1,doc=1,owner,lastStatus={enabled:false,status:'off'},lastChecked=null,totalGet=0,totalPut=0,failedGet=0,failureBudget=0,done=false,violation=null,writes=Promise.resolve();
function journal(event,data={}){const row={atUtc:new Date().toISOString(),wallElapsedMs:Math.round(performance.now()-startMono),simulatedElapsedMs:Math.round(simNow()-started),event,...data};writes=writes.then(()=>appendFile(new URL('events.jsonl',directory),JSON.stringify(row)+'\n'));}
const state=()=>local.snapshot()[POWER_STORAGE_KEY]||{receipts:[],attempts:[]};
async function snapshot(phase='running'){
 const data=state();const report={version:POWER_BUILD,mode,phase,pid:process.pid,startedUtc:new Date(started).toISOString(),startedKst:toKst(started),expectedEndUtc:new Date(end).toISOString(),expectedEndKst:toKst(end),lastHeartbeatUtc:new Date().toISOString(),wallElapsedMs:Math.round(performance.now()-startMono),simulatedElapsedMs:Math.round(simNow()-started),durationMs:duration,clockScale:scale,server:'simulated only; zero CHZZK requests',status:{enabled:lastStatus.enabled,status:lastStatus.status,detail:lastStatus.detail||'',staleMarked:['waiting','error','auth-required'].includes(lastStatus.status)},lastCheckedUtc:lastChecked?new Date(lastChecked).toISOString():null,getCount:totalGet,putCount:totalPut,failedGetCount:failedGet,failedAccountGetCount:failedAccountGet,accountGetCount:accountGets,scopeChecks,confirmed:data.receipts.length,unconfirmed:data.attempts.filter(a=>a.status==='unconfirmed').length,duplicatePutCount:[...puts.values()].reduce((n,c)=>n+Math.max(0,c-1),0),actions,faults,violation,sourceHashes:hashes,realServerVerified:false};
 await writes;await writeFile(new URL('status.json',directory),JSON.stringify(report,null,2));
}
function assertRun(ok,message){if(!ok&&!violation){violation=message;journal('FAIL',{message})}}
const fetcher=async(url,opt)=>{
 if(opt.method==='PUT'){
  const claimId=decodeURIComponent(url.split('/').at(-1)),rewardKey=url;totalPut++;puts.set(rewardKey,(puts.get(rewardKey)||0)+1);journal('PUT',{claimId,count:puts.get(rewardKey)});assertRun(puts.get(rewardKey)===1,'duplicate PUT for same eligible reward');return new Response(null,{status:204});
 }
 totalGet++;
 if(url.includes('getUserStatus')){accountGets++;if(accountFailureBudget){accountFailureBudget--;failedAccountGet++;journal('ACCOUNT_GET429');return new Response(null,{status:429,headers:{'Retry-After':'120'}})}return new Response(JSON.stringify({code:200,content:{loggedIn:true,userIdHash:'soak_test_account'}}))}
 if(failureBudget){failureBudget--;failedGet++;journal('GET503');return new Response(null,{status:503})}
 const index=Math.floor((simNow()-started)/300000);
 return new Response(JSON.stringify({code:200,content:{active:true,amount:1000+totalPut*20,claims:[{claimId:`soak-${index}`,claimType:'WATCH_5_MIN',state:'COMPLIED',saveType:'ACTIVE',amount:20}]}}));
};
const api={runtime:{id:'soak-extension'},storage:{local,session},tabs:{sendMessage:async(id,message,opts)=>{const agent=agents.get(`${id}:${opts.documentId}`);if(!agent)throw new Error('document closed');return agent(message)}}};
const coordinator=createPowerCoordinator({chromeApi:api,locks,now:simNow,uuid:()=>`soak-epoch-${++epoch}`});
function newOwner(){
 const documentId=`soak-document-${doc}`,tabId=tab;const agent=createPagePowerAgent({isPlaying:()=>true,fetcher});let current;
 const sender={id:api.runtime.id,frameId:0,tab:{id:tabId},documentId,url:`https://chzzk.naver.com/live/${channel}`};
 current=createPagePowerOwner({getChannelId:()=>channel,send:async m=>{try{return {ok:true,result:await coordinator.handle(m,sender)}}catch(e){return {ok:false,error:safePowerError(e)}}},now:simNow,schedule:(fn,delay)=>setTimeout(fn,delay/scale),cancel:clearTimeout,
  onState:s=>{if(current===owner){lastStatus=s;if(['checked','blocked'].includes(s.status))lastChecked=Date.now();journal('state',{enabled:s.enabled,status:s.status,detail:s.detail||''});void snapshot()}}});
 agents.set(`${tabId}:${documentId}`,m=>{if(m.type==='cheesemoa-owner-state'){current.deactivate(m.epoch);return Promise.resolve({})}return agent(m)});owners.push(current);return current;
}
function scheduleAt(minutes,label,fn){return setTimeout(async()=>{if(done)return;actions.push({label,atUtc:new Date().toISOString(),simulatedMinute:minutes});journal('action',{label});try{await fn();await snapshot()}catch(e){assertRun(false,`${label}: ${e.message}`)}},minutes*60000/scale)}
owner=newOwner();await writeFile(new URL('events.jsonl',directory),'');journal('start',{mode,build:POWER_BUILD,sourceHashes:hashes});await snapshot();
console.log(JSON.stringify({phase:'started',mode,pid:process.pid,startUtc:new Date(started).toISOString(),startKst:toKst(started),endUtc:new Date(end).toISOString(),endKst:toKst(end),statusPath:new URL('status.json',directory).pathname,eventsPath:new URL('events.jsonl',directory).pathname}));
await owner.start();
const planned=[];
for(const min of [10,35,70])planned.push(scheduleAt(min,`inject one GET503 at ${min}m`,()=>{failureBudget++;faults.push({kind:'GET503',atSimulatedMinute:min})}));
let offPuts;
planned.push(scheduleAt(20,'explicit OFF',async()=>{await owner.stop();offPuts=totalPut}));
planned.push(scheduleAt(21,'assert OFF and explicitly ON',async()=>{assertRun(!lastStatus.enabled,'OFF was not retained');assertRun(totalPut===offPuts,'PUT while explicitly OFF');await owner.start()}));
planned.push(scheduleAt(25,'inject account GET429 with 120-second deadline',()=>{accountFailureBudget++}));
planned.push(scheduleAt(26,'switch channel while account deadline remains',async()=>{
 const deadline=session.snapshot()['cheesemoa.power.owner.v1']?.backoffs?.account?.retryAt;
 assertRun(deadline>simNow(),'account Retry-After was not active at channel switch');
 accountGetsAtSwitch=accountGets;owner.suspend();channel='b'.repeat(32);doc++;owner=newOwner();await owner.start();
 assertRun(accountGets===accountGetsAtSwitch,'channel switch bypassed account endpoint deadline');
 scopeChecks.push({kind:'channel-switch-account-deadline',passed:accountGets===accountGetsAtSwitch});
}));
planned.push(scheduleAt(26.5,'verify no account requests before shared deadline',()=>{
 assertRun(accountGets===accountGetsAtSwitch,'account GET occurred before shared deadline');scopeChecks.push({kind:'before-shared-deadline',passed:accountGets===accountGetsAtSwitch});
}));
planned.push(scheduleAt(45,'document replacement / resume prior ON',async()=>{owner.suspend();doc++;owner=newOwner();await owner.restore()}));
planned.push(scheduleAt(60,'explicit takeover by another tab',async()=>{tab++;doc++;owner=newOwner();await owner.start()}));
const heartbeat=setInterval(()=>{journal('heartbeat',{lastCheckedUtc:lastChecked?new Date(lastChecked).toISOString():null,enabled:lastStatus.enabled,status:lastStatus.status});void snapshot()},Math.max(1000,30000/scale));
async function finish(reason){if(done)return;done=true;clearInterval(heartbeat);planned.forEach(clearTimeout);await owner.stop();owners.forEach(o=>o.suspend());
 if(reason==='duration-completed'){
  assertRun(performance.now()-startMono>=duration/scale-100,'ended before requested duration');assertRun(failedGet===3,'not all three transient GET failures occurred');assertRun(failedAccountGet===1,'account429 scenario did not occur');assertRun(scopeChecks.length===2&&scopeChecks.every(s=>s.passed),'account scope checks did not pass');assertRun(state().receipts.length>=15,'insufficient periodic reward confirmations');assertRun(lastChecked!==null,'no successful checks');
 }
 journal('finish',{reason,completed:reason==='duration-completed',passed:reason==='duration-completed'&&!violation});await snapshot(reason==='duration-completed'?(violation?'failed':'passed'):'interrupted');await writes;console.log(JSON.stringify({phase:reason,completed:reason==='duration-completed',passed:reason==='duration-completed'&&!violation,puts:totalPut,receipts:state().receipts.length,violation}));process.exitCode=violation?1:0;
}
const endTimer=setTimeout(()=>void finish('duration-completed'),duration/scale);
process.on('SIGTERM',()=>{clearTimeout(endTimer);void finish('terminated')});process.on('SIGINT',()=>{clearTimeout(endTimer);void finish('interrupted')});
