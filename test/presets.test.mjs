import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPresets,savePreset,deletePreset,validatePreset} from '../src/shared/presets.js';
let data={};let fail=false;let queue=Promise.resolve();
globalThis.chrome={storage:{local:{get:async()=>structuredClone(data),set:async value=>{if(fail)throw Error('disk full');Object.assign(data,structuredClone(value));}}}};
Object.defineProperty(globalThis,'navigator',{value:{locks:{request(_,fn){const p=queue.then(fn);queue=p.catch(()=>{});return p;}}},configurable:true});
const snapshot={name:'게임',channels:[{url:'https://chzzk.naver.com/video/1',audio:{volume:.25,muted:true}}],columns:3};
test('presets retain audio/layout, serialize concurrent saves, delete only chosen preset',async()=>{
  const [a,b]=await Promise.all([savePreset(snapshot),savePreset({...snapshot,name:'휴식'})]);
  assert.notEqual(a.id,b.id);assert.equal((await loadPresets()).length,2);
  await deletePreset(a.id); const saved=await loadPresets();assert.equal(saved[0].name,'휴식');assert.deepEqual(saved[0].channels[0].audio,{volume:.25,muted:true});
});
test('invalid and failed presets never overwrite saved configurations',async()=>{
  const before=structuredClone(data);
  for(const channels of [[{url:'https://evil.test'}],Array(7).fill(snapshot.channels[0]),[{...snapshot.channels[0],audio:{volume:NaN,muted:false}}]])assert.throws(()=>validatePreset({...snapshot,channels}));
  fail=true;await assert.rejects(savePreset(snapshot));fail=false;assert.deepEqual(data,before);
  data['cheesemoa.presets.v1']={bad:true};await assert.rejects(savePreset(snapshot));assert.deepEqual(data['cheesemoa.presets.v1'],{bad:true});
});

test('legacy six-channel presets remain readable, restorable, and unchanged by another save',async()=>{
  const legacy={...snapshot,id:'legacy-six',channels:Array.from({length:6},(_,i)=>({url:'https://chzzk.naver.com/video/'+(i+1),audio:{volume:.2,muted:true}}))};
  data={'cheesemoa.presets.v1':[legacy]};
  const before=structuredClone((await loadPresets())[0]);
  assert.equal((await loadPresets())[0].channels.length,6);
  const saved=await savePreset({...snapshot,name:'new'});
  assert.deepEqual(data['cheesemoa.presets.v1'][0],before);
  await deletePreset(saved.id);
  assert.deepEqual(data['cheesemoa.presets.v1'],[before]);
});
