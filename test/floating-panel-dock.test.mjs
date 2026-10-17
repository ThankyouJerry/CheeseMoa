import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {attachFloatingPowerPanel} from '../src/viewer/floating-power-panel.js';
const key='cheesemoa.power.panel.v1',flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({path='/lives#cheesemoa-multiview',slot=true,saved={hidden:false,position:{x:2000,y:1500}}}={}){
 const dom=new JSDOM('<body></body>',{url:'https://chzzk.naver.com'+path}),w=dom.window;
 const host=w.document.createElement('div');host.id='cheesemoa-site-host';const hostRoot=host.attachShadow({mode:'open'});if(slot){const dock=w.document.createElement('slot');dock.name='cheesemoa-power-dock';hostRoot.append(dock)}w.document.body.append(host);
 const holder=w.document.createElement('aside');holder.id='cheesemoa-power-control';holder.style.cssText='position:fixed;right:16px;bottom:16px;width:360px';const root=holder.attachShadow({mode:'open'}),section=w.document.createElement('section'),heading=w.document.createElement('h2'),collector=w.document.createElement('button'),receipt=w.document.createElement('p');collector.textContent='자동수령 ON';collector.dataset.enabled='true';receipt.textContent='확정 수령 2건 · 100 파워';section.append(heading,collector,receipt);root.append(section);w.document.body.append(holder);
 let collectorCalls=0;collector.onclick=()=>collectorCalls++;const writes=[];holder.getBoundingClientRect=()=>({left:100,top:100,width:360,height:240});
 const syncLayout=attachFloatingPowerPanel({holder,root,section,heading,storage:{get:async()=>({[key]:saved}),set:async value=>writes.push(structuredClone(value))},win:w});
 const button=label=>[...root.querySelectorAll('button')].find(b=>b.textContent.includes(label));
 return {dom,w,host,holder,root,section,collector,receipt,writes,button,syncLayout,collectorCalls:()=>collectorCalls};
}
test('multiview docks the existing collector without changing collection or saved floating preferences',async()=>{
 const f=fixture();try{await flush();assert.equal(f.holder.parentElement,f.host);assert.equal(f.holder.slot,'cheesemoa-power-dock');assert.equal(f.holder.dataset.panelLayout,'docked');assert.equal(f.holder.style.position,'static');assert.equal(f.holder.style.width,'100%');assert.equal(f.holder.shadowRoot,f.root);assert.equal(f.root.querySelector('section'),f.section);assert.equal(f.collector.dataset.enabled,'true');assert.equal(f.receipt.textContent,'확정 수령 2건 · 100 파워');
  const handle=f.button('패널 이동');assert.equal(handle.hidden,true);assert.equal(handle.disabled,true);for(let i=0;i<100;i++)f.w.dispatchEvent(new f.w.Event('resize'));handle.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',cancelable:true}));for(const type of ['pointerdown','pointermove','pointerup']){const event=new f.w.Event(type,{cancelable:true});Object.assign(event,{button:0,pointerId:1,clientX:200,clientY:200});handle.dispatchEvent(event)}await flush();assert.equal(f.writes.length,0);
  f.button('숨기기').click();await flush();assert.equal(f.section.hidden,true);assert.deepEqual(f.writes.at(-1)[key],{hidden:true,position:{x:2000,y:1500}});f.button('표시').click();await flush();assert.equal(f.section.hidden,false);assert.deepEqual(f.writes.at(-1)[key],{hidden:false,position:{x:2000,y:1500}});assert.equal(f.root.querySelector('section'),f.section);assert.equal(f.section.contains(f.collector),true);assert.equal(f.section.contains(f.receipt),true);assert.equal(f.collectorCalls(),0);assert.equal(f.collector.dataset.enabled,'true');assert.equal(f.receipt.textContent,'확정 수령 2건 · 100 파워');
 }finally{f.dom.window.close()}
});
for(const options of [{path:'/live/'+'a'.repeat(32)},{slot:false}])test(`non-dock context retains floating behavior ${JSON.stringify(options)}`,async()=>{
 const f=fixture({...options,saved:{hidden:false,position:{x:100,y:100}}});try{await flush();assert.notEqual(f.holder.parentElement,f.host);assert.equal(f.holder.style.position,'fixed');assert.notEqual(f.holder.dataset.panelLayout,'docked');assert.equal(f.button('패널 이동').disabled,false);f.button('패널 이동').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',cancelable:true}));await flush();assert.deepEqual(f.writes.at(-1)[key].position,{x:110,y:100});assert.equal(f.collectorCalls(),0)}finally{f.dom.window.close()}
});


test('route changes undock and redock the same collector without persisting or resetting its state',async()=>{
 const f=fixture({saved:{hidden:false,position:{x:100,y:120}}});try{await flush();f.host.remove();f.w.history.pushState(null,'','/live/'+'a'.repeat(32));f.syncLayout();assert.equal(f.holder.parentElement,f.w.document.documentElement);assert.equal(f.holder.style.position,'fixed');assert.equal(f.holder.style.left,'100px');assert.equal(f.holder.style.top,'120px');assert.equal(f.button('패널 이동').disabled,false);assert.equal(f.holder.shadowRoot,f.root);assert.equal(f.root.querySelector('section'),f.section);
  f.w.history.pushState(null,'','/lives#cheesemoa-multiview');const replacement=f.w.document.createElement('div');replacement.id='cheesemoa-site-host';const root=replacement.attachShadow({mode:'open'}),slot=f.w.document.createElement('slot');slot.name='cheesemoa-power-dock';root.append(slot);f.w.document.body.append(replacement);f.syncLayout();await flush();assert.equal(f.holder.parentElement,replacement);assert.equal(f.holder.style.position,'static');assert.equal(f.button('패널 이동').disabled,true);assert.equal(f.root.querySelector('section'),f.section);assert.equal(f.section.contains(f.collector),true);assert.equal(f.section.contains(f.receipt),true);assert.equal(f.collector.dataset.enabled,'true');assert.equal(f.receipt.textContent,'확정 수령 2건 · 100 파워');assert.equal(f.writes.length,0);assert.equal(f.collectorCalls(),0);
 }finally{f.dom.window.close()}
});
