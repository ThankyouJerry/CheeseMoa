import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {attachFloatingPowerPanel} from '../src/viewer/floating-power-panel.js';
const key='cheesemoa.power.panel.v1';
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(saved,override){
 const dom=new JSDOM('<aside></aside>');const win=dom.window,holder=win.document.querySelector('aside'),root=holder.attachShadow({mode:'open'});const section=win.document.createElement('section'),heading=win.document.createElement('h2');section.append(heading);root.append(section);
 let data=saved?{[key]:saved}:{};
 holder.getBoundingClientRect=()=>({left:parseFloat(holder.style.left)||100,top:parseFloat(holder.style.top)||100,width:360,height:section.hidden?40:240});
 const storage=override||{get:async()=>data,set:async value=>{data=structuredClone(value)}};
 attachFloatingPowerPanel({holder,root,section,heading,storage,win});
 const button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 const pointer=(type,x,y)=>{const e=new win.Event(type,{cancelable:true});Object.assign(e,{button:0,pointerId:1,clientX:x,clientY:y});button('패널 이동').dispatchEvent(e)};
 return {dom,win,holder,section,root,button,pointer,data:()=>data};
}
test('drag via handle persists position; unrelated controls cannot drag',async()=>{
 const f=fixture();await flush();f.pointer('pointerdown',110,110);f.pointer('pointermove',210,160);f.pointer('pointerup',210,160);await flush();assert.deepEqual(f.data()[key].position,{x:200,y:150});
 f.button('숨기기').dispatchEvent(new f.win.MouseEvent('pointerdown',{clientX:800,clientY:800}));assert.equal(f.holder.style.left,'200px');f.dom.window.close();
});
test('hide/show restores focus and persisted visibility without touching collector controls',async()=>{
 const f=fixture();await flush();let calls=0;const on=f.win.document.createElement('button');on.textContent='ON';on.onclick=()=>calls++;f.section.append(on);
 f.button('숨기기').click();await flush();assert.equal(f.section.hidden,true);assert.equal(f.button('표시').hidden,false);assert.equal(f.root.activeElement,f.button('표시'));assert.equal(f.data()[key].hidden,true);assert.equal(calls,0);
 f.button('표시').click();await flush();assert.equal(f.section.hidden,false);assert.equal(f.root.activeElement,f.button('숨기기'));assert.equal(f.data()[key].hidden,false);assert.equal(calls,0);f.dom.window.close();
});
test('saved offscreen position recovers on restore, show, and viewport resize',async()=>{
 const f=fixture({hidden:true,position:{x:99999,y:99999}});await flush();assert.equal(f.section.hidden,true);assert.equal(f.holder.style.left,'656px');assert.equal(f.holder.style.top,'720px');
 f.button('표시').click();assert.equal(f.holder.style.top,'520px');Object.defineProperties(f.win,{innerWidth:{value:400,configurable:true},innerHeight:{value:300,configurable:true}});f.win.dispatchEvent(new f.win.Event('resize'));await flush();assert.equal(f.holder.style.left,'32px');assert.equal(f.holder.style.top,'52px');assert.deepEqual(f.data()[key].position,{x:32,y:52});f.dom.window.close();
});
test('keyboard arrows, Shift, and Home are available on dedicated handle',async()=>{
 const f=fixture();await flush();const handle=f.button('패널 이동');assert.ok(handle.getAttribute('aria-describedby'));
 handle.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,cancelable:true}));assert.equal(f.holder.style.left,'140px');handle.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Home',cancelable:true}));await flush();assert.equal(f.holder.style.left,'');assert.equal(f.holder.style.right,'16px');assert.equal(f.data()[key].position,null);f.dom.window.close();
});

test('late hydration never overwrites an early drag and cancellation persists once',async()=>{
 let resolveRead,writes=[];const f=fixture(null,{get:()=>new Promise(r=>resolveRead=r),set:async p=>writes.push(structuredClone(p))});
 try{await flush();f.pointer('pointerdown',110,110);f.pointer('pointermove',210,160);f.pointer('pointercancel',210,160);f.pointer('lostpointercapture',210,160);resolveRead({[key]:{hidden:true,position:{x:10,y:10}}});await flush();assert.equal(f.section.hidden,false);assert.equal(f.holder.style.left,'200px');assert.equal(writes.length,1);assert.deepEqual(writes[0][key].position,{x:200,y:150})}finally{f.dom.window.close()}
});
test('visibility aria-expanded follows hide, restore, and saved hydration',async()=>{
 for(const saved of [undefined,{hidden:true},{hidden:false}]){
  const f=fixture(saved);
  try{await flush();const expanded=String(!saved?.hidden);for(const label of ['숨기기','표시'])assert.equal(f.button(label).getAttribute('aria-expanded'),expanded);
   f.button('숨기기').click();for(const label of ['숨기기','표시'])assert.equal(f.button(label).getAttribute('aria-expanded'),'false');
   f.button('표시').click();for(const label of ['숨기기','표시'])assert.equal(f.button(label).getAttribute('aria-expanded'),'true');
  }finally{f.dom.window.close()}
 }
});
test('unchanged viewport resize bursts never persist redundant preferences',async()=>{
 let writes=[];const f=fixture(null,{get:async()=>({[key]:{hidden:false,position:{x:200,y:150}}}),set:async p=>writes.push(structuredClone(p))});
 try{await flush();for(let i=0;i<100;i++)f.win.dispatchEvent(new f.win.Event('resize'));await flush();assert.equal(writes.length,0);assert.equal(f.holder.style.left,'200px');assert.equal(f.holder.style.top,'150px')}finally{f.dom.window.close()}
});
test('slow storage keeps one active write and only the latest pending preference',async()=>{
 let active=0,max=0,releases=[],values=[];const f=fixture(null,{get:async()=>({}),set:p=>{active++;max=Math.max(max,active);values.push(structuredClone(p));return new Promise(r=>releases.push(()=>{active--;r()}))}});
 try{
  await flush();f.button('숨기기').click();await flush();assert.equal(values.length,1);
  // Every intermediate preference is superseded while the first write is blocked.
  for(let i=0;i<99;i++){f.button('표시').click();f.button('숨기기').click()}
  f.button('표시').click();await flush();assert.equal(values.length,1);assert.equal(releases.length,1);
  releases.shift()();await flush();assert.equal(values.length,2);assert.equal(values[1][key].hidden,false);assert.equal(releases.length,1);
  releases.shift()();await flush();assert.equal(values.length,2);assert.equal(releases.length,0);assert.equal(active,0);assert.equal(max,1);
 }finally{for(const release of releases)release();f.dom.window.close()}
});
test('rejected storage write drains the latest pending preference and permits future writes',async()=>{
 let writes=[],releases=[],active=0,max=0;const f=fixture(null,{get:async()=>({}),set:p=>{writes.push(structuredClone(p));active++;max=Math.max(max,active);return new Promise((resolve,reject)=>releases.push(error=>{active--;error?reject(error):resolve()}))}});
 try{
  await flush();f.button('숨기기').click();await flush();f.button('표시').click();f.button('숨기기').click();f.button('표시').click();
  releases.shift()(new Error('storage temporarily unavailable'));await flush();assert.equal(writes.length,2);assert.equal(writes[1][key].hidden,false);assert.equal(releases.length,1);
  releases.shift()();await flush();assert.equal(writes.length,2);assert.equal(releases.length,0);
  f.button('숨기기').click();await flush();assert.equal(writes.length,3);assert.equal(writes[2][key].hidden,true);releases.shift()();await flush();assert.equal(active,0);assert.equal(max,1);
 }finally{for(const release of releases)release();f.dom.window.close()}
});
test('late hydration cannot overwrite an early visibility preference or its aria state',async()=>{
 let resolveRead;const writes=[];const f=fixture(null,{get:()=>new Promise(r=>resolveRead=r),set:async p=>writes.push(structuredClone(p))});
 try{await flush();f.button('숨기기').click();resolveRead({[key]:{hidden:false,position:{x:10,y:10}}});await flush();assert.equal(f.section.hidden,true);assert.equal(f.button('표시').getAttribute('aria-expanded'),'false');assert.equal(f.button('숨기기').getAttribute('aria-expanded'),'false');assert.equal(f.holder.style.left,'');assert.equal(writes.length,1);assert.equal(writes[0][key].hidden,true)}finally{f.dom.window.close()}
});
test('pending preference combines the latest position and visibility while storage is blocked',async()=>{
 const writes=[],releases=[];const f=fixture(null,{get:async()=>({}),set:p=>{writes.push(structuredClone(p));return new Promise(resolve=>releases.push(resolve))}});
 try{
  await flush();f.button('숨기기').click();await flush();assert.equal(writes.length,1);
  f.button('표시').click();const handle=f.button('패널 이동');handle.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,cancelable:true}));
  f.button('숨기기').click();f.button('표시').click();handle.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowDown',cancelable:true}));
  await flush();assert.equal(writes.length,1);releases.shift()();await flush();assert.equal(writes.length,2);assert.deepEqual(writes[1][key],{hidden:false,position:{x:140,y:110}});
  releases.shift()();await flush();assert.equal(writes.length,2);assert.equal(releases.length,0);
 }finally{for(const release of releases)release();f.dom.window.close()}
});
test('a synchronous storage exception does not prevent later preference writes',async()=>{
 const writes=[];let calls=0;const f=fixture(null,{get:async()=>({}),set:p=>{calls++;if(calls===1)throw new Error('synchronous storage failure');writes.push(structuredClone(p));return Promise.resolve()}});
 try{await flush();assert.doesNotThrow(()=>f.button('숨기기').click());await flush();f.button('표시').click();await flush();assert.equal(calls,2);assert.deepEqual(writes,[{[key]:{hidden:false,position:null}}]);assert.equal(f.section.hidden,false)}finally{f.dom.window.close()}
});
