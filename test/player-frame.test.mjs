import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/viewer/player-frame.js',import.meta.url),'utf8');
function harness(kind='extension') {
 const reports=[],events=new Map(),documentEvents=new Map();let mutation,poll,disconnected=0;
 const parent={postMessage:(...a)=>reports.push(a)};
 const win={parent,top:parent,location:{ancestorOrigins:[kind==='extension'?'chrome-extension://owner':'https://chzzk.naver.com']},addEventListener:(n,f)=>{if(!events.has(n))events.set(n,new Set());events.get(n).add(f);},removeEventListener:(n,f)=>events.get(n)?.delete(f)};
 const h={reports,win,parent,media:[{muted:false,volume:.7,getBoundingClientRect:()=>({x:1,y:2,width:900,height:500})}],events};
 if(kind!=='extension') {
  parent.location={origin:'https://chzzk.naver.com',pathname:kind==='site'?'/lives':'/live/unrelated',search:'',hash:'#cheesemoa-multiview'};
  parent.document={getElementById:()=>({shadowRoot:{querySelectorAll:()=>[{contentWindow:win}]}})};
 }
 const document={documentElement:{setAttribute(){}},querySelectorAll:()=>h.media,addEventListener:(n,f)=>documentEvents.set(n,f),removeEventListener:(n,f)=>{if(documentEvents.get(n)===f)documentEvents.delete(n);}};
 const context=vm.createContext({window:win,chrome:{runtime:{id:'owner'}},document,MutationObserver:class{constructor(f){mutation=f;}observe(){}disconnect(){disconnected++;}},setInterval:f=>{poll=f;return 1;},clearInterval:()=>poll=null});
 h.load=()=>vm.runInContext(source,context);h.load();
 h.send=(data,origin=win.location.ancestorOrigins[0],from=parent)=>{for(const f of [...(events.get('message')||[])])f({data,origin,source:from});};
 h.event=n=>{for(const f of [...(events.get(n)||[])])f();};
 h.mutate=()=>mutation();h.changed=()=>documentEvents.get('volumechange')?.();h.poll=()=>poll;h.disconnected=()=>disconnected;
 return h;
}
for(const kind of ['extension','site'])test(`${kind} parent uses exact target for ready, bounds, audio, mute and volume`,()=>{
 const h=harness(kind),origin=h.win.location.ancestorOrigins[0];
 assert.equal(h.reports[0][0].type,'cheesemoa-player-ready');assert.ok(h.reports.every(r=>r[1]===origin));h.reports.length=0;
 h.send({type:'cheesemoa-measure-player',enabled:true},origin,{});h.send({type:'cheesemoa-measure-player',enabled:true},'https://evil.example');assert.equal(h.reports.length,0);
 h.send({type:'cheesemoa-measure-player',enabled:true});assert.equal(h.reports[0][0].rect.width,900);assert.equal(typeof h.poll(),'function');
 h.send({type:'cheesemoa-measure-player',enabled:'false'});assert.equal(typeof h.poll(),'function');
 h.send({type:'cheesemoa-measure-player',enabled:false});assert.equal(h.poll(),null);
 for(const v of [-1,2,NaN,Infinity,'0.5'])h.send({type:'cheesemoa-set-audio',muted:false,volume:v});assert.equal(h.media[0].volume,.7);
 h.send({type:'cheesemoa-set-muted',muted:'true'});assert.equal(h.media[0].muted,false);
 h.send({type:'cheesemoa-set-audio',muted:true,volume:0});assert.equal(h.media[0].volume,0);assert.equal(h.media[0].muted,true);
 h.media=[{muted:false,volume:1}];h.mutate();assert.equal(h.media[0].muted,true);assert.equal(h.media[0].volume,0);
 h.send({type:'cheesemoa-set-muted',muted:false});assert.equal(h.media[0].volume,.5);
 h.media[0].volume=.3;h.changed();h.send({type:'cheesemoa-audio-query'});assert.equal(h.reports.at(-1)[0].volume,.3);
 assert.ok(h.reports.every(r=>r[1]===origin));h.event('pagehide');
});
test('unrelated same-origin, foreign, detached and non-top host parents receive nothing',()=>{
 const h=harness('unrelated');assert.equal(h.reports.length,0);
 h.send({type:'cheesemoa-set-muted',muted:true});assert.equal(h.media[0].muted,false);
 h.parent.location.pathname='/lives';h.parent.document.getElementById=()=>null;h.send({type:'cheesemoa-audio-query'});assert.equal(h.reports.length,0);
 h.win.location.ancestorOrigins=['https://evil.example'];h.send({type:'cheesemoa-audio-query'},'chrome-extension://owner');assert.equal(h.reports.length,0);
});
test('repeated injection, pagehide and bfcache restore leave one listener and clean polling',()=>{
 const h=harness('site');h.send({type:'cheesemoa-measure-player',enabled:true});h.load();assert.equal(h.poll(),null);assert.equal(h.events.get('message').size,1);
 h.send({type:'cheesemoa-measure-player',enabled:true});h.event('pagehide');assert.equal(h.poll(),null);assert.equal(h.events.get('message').size,0);
 const count=h.reports.length;h.send({type:'cheesemoa-audio-query'});assert.equal(h.reports.length,count);
 h.event('pageshow');h.event('pageshow');assert.equal(h.events.get('message').size,1);assert.equal(h.reports.length,count+2);assert.ok(h.disconnected()>=2);
 h.parent.location.hash='#other';h.reports.length=0;h.send({type:'cheesemoa-audio-query'});h.changed();assert.equal(h.reports.length,0);h.event('pagehide');
});
test('replacement media is not controlled after the parent leaves multiview',()=>{
 const h=harness('site');
 h.send({type:'cheesemoa-set-audio',muted:true,volume:.2});
 h.parent.location.hash='#other';
 h.media=[{muted:false,volume:.8}];h.mutate();
 assert.equal(h.media[0].muted,false);
 assert.equal(h.media[0].volume,.8);
 h.event('pagehide');
});
test('native volume events outside the trusted host do not seed commands after return',()=>{
 const h=harness('site');
 h.send({type:'cheesemoa-set-audio',muted:true,volume:.2});
 h.parent.location.hash='#other';h.media=[{muted:false,volume:.8}];h.mutate();
 h.changed();
 h.parent.location.hash='#cheesemoa-multiview';h.media=[{muted:false,volume:.6}];h.mutate();
 assert.equal(h.media[0].volume,.6);
 assert.equal(h.media[0].muted,false);
 h.send({type:'cheesemoa-set-audio',muted:true,volume:.4});
 assert.equal(h.media[0].volume,.4);assert.equal(h.media[0].muted,true);
 h.event('pagehide');
});
