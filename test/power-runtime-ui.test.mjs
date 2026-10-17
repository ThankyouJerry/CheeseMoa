import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../dev/power-runtime.html',import.meta.url),'utf8');
const source=(await readFile(new URL('../dev/power-runtime-ui.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const flush=()=>new Promise(r=>setImmediate(r));
test('local runtime UI retains an execution failure instead of repainting it as normal',async()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only'});const states=[{enabled:false,status:'off'}];
 dom.window.eval(`const POWER_BUILD='test-build';const POWER_STORAGE_KEY='test';const createRuntimeSimulation=()=>({states:[{enabled:false,status:'off'}],local:{snapshot:()=>({})},calls:[],timers:new Map([[1,1]]),flush:async()=>{},owner:{},advance:async()=>{throw new Error('테스트 실행 예외')},dispose(){}});`+source);
 try{dom.window.document.querySelector('#tick').click();await flush();assert.match(dom.window.document.querySelector('#status').textContent,/검증 실행 실패.*테스트 실행 예외/);assert.equal(dom.window.document.querySelector('#status').getAttribute('role'),'alert');assert.match(dom.window.document.querySelector('#detail').textContent,/통과로 처리하지/)}finally{dom.window.close()}
});
test('connecting UI leaves OFF available and labels receipt counts as simulated',async()=>{
 const dom=new JSDOM(html,{runScripts:'outside-only'});
 dom.window.eval(`const POWER_BUILD='test-build';const POWER_STORAGE_KEY='test';const createRuntimeSimulation=()=>({states:[{enabled:false,status:'connecting',canStop:true}],local:{snapshot:()=>({})},calls:[],timers:new Map(),flush:async()=>{},owner:{},dispose(){}});`+source);
 try{assert.equal(dom.window.document.querySelector('#off').disabled,false);assert.match(dom.window.document.querySelector('#status').textContent,/시작 연결 중/);assert.match(dom.window.document.querySelector('#counts').textContent,/모의 확정/)}finally{dom.window.close()}
});
