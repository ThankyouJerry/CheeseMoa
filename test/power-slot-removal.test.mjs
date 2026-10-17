import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {attachPowerReceiptPanel} from '../src/viewer/power-receipt-panel.js';
const source=(await readFile(new URL('../src/viewer/power-page-entry.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
test('removing selected multiview slot ends readiness wait and disables the absent channel',()=>{
 const dom=new JSDOM('<div id="cheesemoa-site-host"></div>',{url:'https://chzzk.naver.com/lives#cheesemoa-multiview',runScripts:'outside-only'});let poll,stops=0;
 const w=dom.window,host=w.document.querySelector('div').attachShadow({mode:'open'}),frame=w.document.createElement('iframe');frame.src='https://chzzk.naver.com/live/'+'a'.repeat(32);frame.title='Hasiyo test';host.append(frame);
 w.setInterval=fn=>{poll=fn;return 1};w.clearInterval=()=>{};w.attachPowerReceiptPanel=attachPowerReceiptPanel;w.POWER_BUILD='test';w.attachFloatingPowerPanel=()=>{};w.createPagePowerAgent=()=>()=>{};
 w.chrome={runtime:{onMessage:{addListener(){},removeListener(){}}}};
 w.createPagePowerOwner=({onState})=>({restore(){},start(){onState({enabled:true,status:'playback-wait'})},stop(){stops++;onState({enabled:false,status:'off'})},suspend(){}});
 try{w.eval(source);const root=w.document.querySelector('#cheesemoa-power-control').shadowRoot;const on=[...root.querySelectorAll('button')].find(b=>b.textContent==='자동수령 ON');on.click();assert.match(root.querySelector('[role=status]').textContent,/ON/);frame.remove();poll();poll();assert.equal(stops,1);assert.match(root.querySelector('[role=status]').textContent,/OFF/);assert.equal(on.disabled,true)}finally{dom.window.close()}
});
