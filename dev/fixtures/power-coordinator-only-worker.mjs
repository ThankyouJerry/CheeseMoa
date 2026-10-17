import {parentPort,workerData} from 'node:worker_threads';
import {createPowerCoordinator} from '../../src/background/power-coordinator.js';
let seq=0;const replies=new Map();
parentPort.on('message',m=>{const entry=replies.get(m.id);if(!entry)return;replies.delete(m.id);m.error?entry.reject(new Error(m.error)):entry.resolve(m.value)});
const rpc=(op,args={})=>new Promise((resolve,reject)=>{const id=++seq;replies.set(id,{resolve,reject});parentPort.postMessage({kind:'rpc',id,op,...args})});
const store=area=>({get:key=>rpc('get',{area,key}),set:patch=>rpc('set',{area,patch})});
const locks={request:async(name,options,callback)=>{if(typeof options==='function')callback=options;await rpc('acquire',{name});try{return await callback()}finally{await rpc('release',{name})}}};
// The page agent is a separate, surviving execution region in the parent process.
const api={runtime:{id:'test'},storage:{local:store('local'),session:store('session')},tabs:{sendMessage:(_,message)=>rpc('page-message',{message})}};
const coordinator=createPowerCoordinator({chromeApi:api,locks});
const channel='a'.repeat(32),sender={id:'test',frameId:0,tab:{id:1},documentId:'surviving-content-page',url:`https://chzzk.naver.com/live/${channel}`};
const base={channelId:channel,startRequestId:'original-content-start-request'};
try{
 let epoch,restored=false;
 if(workerData.restore){const status=await coordinator.handle({...base,action:'status'},sender);if(!status.enabled)throw new Error('existing page intent was not restored');epoch=status.epoch;restored=true}
 else{const prepared=await coordinator.handle({...base,action:'start'},sender);epoch=prepared.epoch;await coordinator.handle({...base,action:'activate',epoch},sender)}
 const result=await coordinator.handle({...base,action:'collect',epoch},sender);
 parentPort.postMessage({kind:'done',result,restored,epoch});parentPort.close();
}catch(error){parentPort.postMessage({kind:'failed',error:error.message});parentPort.close()}
