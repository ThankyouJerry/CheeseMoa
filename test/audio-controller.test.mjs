import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {createAudioController} from '../src/viewer/audio-controller.js';
test('solo preserves individual mute/volume, ignores malformed reports, and restores on removal',async()=>{
 const dom=new JSDOM(await readFile(new URL('../src/viewer/viewer.html',import.meta.url),'utf8'),{url:'https://test.invalid'});
 const ctl=createAudioController(()=>{});const records=[];const cards=[];
 for(let i=0;i<2;i++){
  const card=dom.window.document.querySelector('template').content.firstElementChild.cloneNode(true);dom.window.document.body.append(card);cards.push(card);
  card.querySelector('iframe').contentWindow.postMessage=data=>records.push({i,...data});
  ctl.attach(card,{id:`video:${i}`,audio:{volume:i?.8:.2,muted:i===0}});
  ctl.receive(card.querySelector('iframe'),{available:true,muted:false,volume:i?.8:.2,reason:'command'});
 }
 ctl.receive(cards[0].querySelector('iframe'),{available:true,muted:false,volume:NaN});
 assert.equal(cards[0].querySelector('input').value,'20');
 cards[0].querySelector('[data-action=solo]').click();
 assert.equal(records.at(-2).muted,false);assert.equal(records.at(-1).muted,true);assert.equal(records.at(-1).volume,.8);
 cards[0].querySelector('[data-action=solo]').click();
 assert.equal(records.at(-2).muted,true);assert.equal(records.at(-1).muted,false);
 cards[0].querySelector('[data-action=solo]').click();ctl.detach('video:0');assert.equal(records.at(-1).muted,false);
 assert.equal(cards[1].querySelector('[data-action=solo]').getAttribute('aria-pressed'),'false');
 dom.window.close();
});

test('volume drag and pending save resist stale storage updates; later external changes apply',async()=>{
 const dom=new JSDOM(await readFile(new URL('../src/viewer/viewer.html',import.meta.url),'utf8'),{url:'https://test.invalid'});
 const card=dom.window.document.querySelector('template').content.firstElementChild.cloneNode(true);dom.window.document.body.append(card);
 const saves=[];let resolveSave;
 const ctl=createAudioController(()=>assert.fail('unexpected save failure'),{persistAudio:op=>{saves.push(op);return new Promise(r=>{resolveSave=r;});}});
 const channel={id:'video:1',audio:{volume:.25,muted:false}};
 ctl.attach(card,channel);ctl.receive(card.querySelector('iframe'),{available:true,muted:false,volume:.25,reason:'command'});
 const slider=card.querySelector('[data-action=volume]');slider.value='80';slider.dispatchEvent(new dom.window.Event('input'));
 ctl.update({...channel,streamerName:'new metadata'});assert.equal(slider.value,'80');
 slider.dispatchEvent(new dom.window.Event('change'));ctl.update(channel);assert.equal(slider.value,'80');assert.equal(saves[0].audio.volume,.8);
 resolveSave();await new Promise(r=>setImmediate(r));ctl.update({...channel,audio:{volume:.4,muted:true}});assert.equal(slider.value,'40');
 slider.value='60';slider.dispatchEvent(new dom.window.Event('input'));ctl.update({...channel,audio:{volume:.1,muted:false}},{force:true});assert.equal(slider.value,'10');
 dom.window.close();
});

test('failed volume save releases the update guard and reports failure',async()=>{
 const dom=new JSDOM(await readFile(new URL('../src/viewer/viewer.html',import.meta.url),'utf8'),{url:'https://test.invalid'});
 const card=dom.window.document.querySelector('template').content.firstElementChild.cloneNode(true);dom.window.document.body.append(card);
 const errors=[];const ctl=createAudioController(message=>errors.push(message),{persistAudio:async()=>{throw Error('disk full');}});
 ctl.attach(card,{id:'video:1',audio:{volume:.2,muted:false}});
 const slider=card.querySelector('[data-action=volume]');slider.value='70';slider.dispatchEvent(new dom.window.Event('input'));slider.dispatchEvent(new dom.window.Event('change'));
 await new Promise(r=>setImmediate(r));assert.equal(errors.length,1);
 ctl.update({id:'video:1',audio:{volume:.3,muted:false}});assert.equal(slider.value,'30');dom.window.close();
});
