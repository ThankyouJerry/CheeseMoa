import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('adding a channel opens same-origin viewer; management keeps extension route', async () => {
 const dom=new JSDOM(await readFile(new URL('../src/popup/popup.html',import.meta.url),'utf8'),{url:'https://test.invalid'});
 globalThis.window=dom.window; globalThis.document=dom.window.document;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_,options,fn)=>(fn||options)()}}});
 globalThis.fetch=async()=>{throw new Error('offline test');};
 let data={}, opened=[]; dom.window.close=()=>{};
 globalThis.chrome={storage:{local:{get:async()=>data,set:async v=>Object.assign(data,v)},onChanged:{addListener(){}}},tabs:{create:async v=>opened.push(v.url)},runtime:{getManifest:()=>({content_scripts:[{js:['src/viewer/site-host.js']}]}),getURL:p=>'chrome-extension://test/'+p,getContexts:async()=>[]}};
 await import('../src/popup/popup.js');
 document.querySelector('#url-input').value='https://chzzk.naver.com/video/123';
 document.querySelector('#add-button').click();
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(opened,['https://chzzk.naver.com/lives#cheesemoa-multiview']);
 assert.equal(data['cheesemoa.channels'].length,1);
 document.querySelector('#open-button').click();
 await new Promise(r=>setImmediate(r));
 assert.equal(opened[1],'chrome-extension://test/src/viewer/viewer.html');
});
