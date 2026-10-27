import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatApi, normalizeChatPage, abortableWait} from '../src/vod/chat-api.js';
const source='https://chzzk.naver.com/video/000123';
const chat=(time=0,content='안녕',extra={})=>({playerMessageTime:time,content,profile:'{"nickname":"이름"}',...extra});
const data=rows=>({code:200,content:{videoChats:rows}});
const response=rows=>new Response(JSON.stringify(data(rows)));

test('API uses fixed public GET URL, exact ms and no credentials; strips identity/profile',async()=>{
  let call;
  const api=createChatApi({fetcher:async(...args)=>{call=args;return response([chat(101,'🙂',{userIdHash:'private',messageId:42})]);}});
  assert.deepEqual(await api.page(source,101),[{elapsedMs:101,nickname:'이름',message:'🙂',messageId:'42'}]);
  assert.equal(call[0],'https://api.chzzk.naver.com/service/v1/videos/000123/chats?playerMessageTime=101');
  assert.equal(call[1].credentials,'omit');assert.equal(call[1].redirect,'error');assert.equal(call[1].method,'GET');
});
test('normalization preserves same-ms real repeated messages and masks blind/system text',()=>{
  const rows=normalizeChatPage(data([chat(0),chat(0),chat(1,'bad',{messageStatusType:'CBOTBLIND',userIdHash:'SYSTEM_MESSAGE'})]));
  assert.equal(rows.length,3);assert.deepEqual(rows[0],rows[1]);assert.equal(rows[2].nickname,'[SYSTEM]');assert.notEqual(rows[2].message,'bad');
  assert.equal(normalizeChatPage(data([chat(0,'x',{messageId:''})]))[0].messageId,undefined);
});
test('application errors, malformed profiles, unsorted or invalid times and nontext bodies fail schema',()=>{
  for(const payload of [{code:500,content:{videoChats:[]}},data([chat(2),chat(1)]),data([chat(-1)]),data([chat(1.1)]),data([chat(0,null)]),data([chat(0,'x',{profile:'{'})])])
    assert.throws(()=>normalizeChatPage(payload),{code:'SCHEMA'});
});
test('large UTF-8 row fails explicitly without truncation',()=>{
  assert.throws(()=>normalizeChatPage(data([chat(0,'가'.repeat(100))]),100),{code:'ROW_LIMIT',partial:true});
});
test('429 and 5xx retry at most four attempts with bounded backoff and callback per attempt',async()=>{
  let requests=0,attempts=0;const waits=[];
  const api=createChatApi({fetcher:async()=>{requests++;return new Response('',{status:requests===1?429:503,headers:requests===1?{'Retry-After':'2'}:{}});},wait:async ms=>waits.push(ms)});
  await assert.rejects(api.page(source,0,{onAttempt:async()=>attempts++}),{code:'HTTP',status:503});
  assert.equal(requests,4);assert.equal(attempts,4);assert.deepEqual(waits,[2000,2000,4000]);
});
test('retry success resets retry budget on the next page',async()=>{
  let requests=0;const api=createChatApi({fetcher:async()=>++requests%4?new Response('',{status:500}):response([]),wait:async()=>{}});
  await api.page(source,0);await api.page(source,0);assert.equal(requests,8);
});
test('long Retry-After pauses without sleeping; HTTP-date also parsed',async()=>{
  const api=createChatApi({now:()=>0,fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'Thu, 01 Jan 1970 00:02:00 GMT'}}),wait:async()=>assert.fail('must not wait')});
  await assert.rejects(api.page(source,0),{code:'RATE_WAIT',retryAt:120000});
});
test('401/403/404, malformed JSON and application errors never become empty success or retry',async()=>{
  for(const make of [()=>new Response('',{status:401}),()=>new Response('',{status:403}),()=>new Response('',{status:404}),()=>new Response('{'),()=>new Response('{"code":500}')]){
    let calls=0;const api=createChatApi({fetcher:async()=>{calls++;return make();},wait:async()=>assert.fail('must not retry')});
    await assert.rejects(api.page(source,0));assert.equal(calls,1);
  }
});
test('cancellation before request and during retry wait prevents further requests',async()=>{
  const before=new AbortController();before.abort();let calls=0;
  await assert.rejects(createChatApi({fetcher:async()=>{calls++;}}).page(source,0,{signal:before.signal}),{name:'AbortError'});assert.equal(calls,0);
  const during=new AbortController();
  const api=createChatApi({fetcher:async()=>{calls++;return new Response('',{status:500});},wait:async(ms,signal)=>{during.abort();await abortableWait(ms,signal);}});
  await assert.rejects(api.page(source,0,{signal:during.signal}),{name:'AbortError'});assert.equal(calls,1);
});
test('timeout covers pending body, cancels reader and bounds retry count',async()=>{
  let cancelled=0,calls=0;
  const api=createChatApi({timeoutMs:5,fetcher:async()=>{calls++;return new Response(new ReadableStream({cancel(){cancelled++;}}));},wait:async()=>{}});
  await assert.rejects(api.page(source,0),{code:'TIMEOUT'});assert.equal(calls,4);assert.equal(cancelled,4);
});
test('aborting uncooperative fetch returns promptly and discards its late body',async()=>{
  let resolveFetch,cancelled=0;const controller=new AbortController();
  const api=createChatApi({fetcher:()=>new Promise(resolve=>{resolveFetch=resolve;})});
  const promise=api.page(source,0,{signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await assert.rejects(promise,{name:'AbortError'});
  resolveFetch(new Response(new ReadableStream({cancel(){cancelled++;}})));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);
});
test('stream response byte limit cancels body; HTTP errors discard their body too',async()=>{
  let cancelled=0;
  const api=createChatApi({responseBytes:2,fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(10));},cancel(){cancelled++;}}))});
  await assert.rejects(api.page(source,0),{code:'RESPONSE_LIMIT'});assert.equal(cancelled,1);
  const denied=createChatApi({fetcher:async()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{status:403})});
  await assert.rejects(denied.page(source,0),{code:'HTTP'});assert.equal(cancelled,2);
});
test('attempt persistence failure prevents network and invalid input never fetches',async()=>{
  const api=createChatApi({fetcher:async()=>assert.fail('no fetch')});
  await assert.rejects(api.page(source,0,{onAttempt:async()=>{throw new Error('quota');}}),/quota/);
  for(const input of ['https://evil.invalid/video/1','https://chzzk.naver.com/live/'+'a'.repeat(32)])await assert.rejects(api.page(input,0));
  for(const time of [-1,NaN,Infinity,0.1])await assert.rejects(api.page(source,time));
});
