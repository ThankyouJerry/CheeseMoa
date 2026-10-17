import {parentPort,workerData} from 'node:worker_threads';
import {createPowerCoordinator} from '../../src/background/power-coordinator.js';
import {createPagePowerAgent} from '../../src/shared/power-page-agent.js';
let seq=0;const replies=new Map();
parentPort.on('message',m=>{const p=replies.get(m.id);if(!p)return;replies.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.value)});
const rpc=(op,args={})=>new Promise((resolve,reject)=>{const id=++seq;replies.set(id,{resolve,reject});parentPort.postMessage({kind:'rpc',id,op,...args})});
const store=area=>({get:async key=>rpc('get',{area,key}),set:async patch=>rpc('set',{area,patch})});
const locks={request:async(name,options,callback)=>{if(typeof options==='function')callback=options;await rpc('acquire',{name});try{return await callback()}finally{await rpc('release',{name})}}};
const agent=createPagePowerAgent({isPlaying:()=>true,fetcher:async(url,options)=>{const response=await rpc('fetch',{url,method:options.method});return new Response(response.body,{status:response.status})}});
const api={runtime:{id:'test'},storage:{local:store('local'),session:store('session')},tabs:{sendMessage:async(_,m)=>m.type==='cheesemoa-owner-state'?{}:agent(m)}};
const coordinator=createPowerCoordinator({chromeApi:api,locks});
const channel='a'.repeat(32),sender={id:'test',frameId:0,tab:{id:1},documentId:workerData.documentId,url:`https://chzzk.naver.com/live/${channel}`};
const m={channelId:channel,startRequestId:'request-'+workerData.documentId};
try{
 const prepared=await coordinator.handle({...m,action:'start'},sender);
 await coordinator.handle({...m,action:'activate',epoch:prepared.epoch},sender);
 const result=await coordinator.handle({...m,action:'collect',epoch:prepared.epoch},sender);
 parentPort.postMessage({kind:'done',result});parentPort.close();
}catch(e){parentPort.postMessage({kind:'failed',error:e.message});parentPort.close()}
