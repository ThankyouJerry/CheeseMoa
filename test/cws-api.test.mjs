import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs, runRelease, REPOSITORY, obtainAccessToken} from '../scripts/cws-api.mjs';
const sha256 = 'a'.repeat(64);
const config = {repository: REPOSITORY, publisherId: 'publisher-test', itemId: 'a'.repeat(32), verified: true};
const name = `publishers/${config.publisherId}/items/${config.itemId}`;
const env = {GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'b'.repeat(40),
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/chrome-web-store.yml@refs/heads/main`,
  CWS_ACCESS_TOKEN: 'SECRET-DO-NOT-LOG', CWS_SUBMISSION_APPROVED: sha256};
const verify = async () => ({bytes: Buffer.from('verified zip'), sha256, version:'0.1.8'});
const receipt = {...config, sha256, version:'0.1.8', operation:'upload', uploadState:'UPLOAD_SUCCESS', versionVerified:true};
const ok = data => ({ok:true, json:async()=>({name,itemId:config.itemId,...data})});
function setup(overrides = {}, replies = [ok({uploadState:'UPLOAD_SUCCESS', crxVersion:'0.1.8'})]) {
  const calls=[];
  const options={mode:'upload',execute:true,config,expectedSha256:sha256,verify,env,receipt,
    sleep:async()=>{},fetchImpl:async(...args)=>{calls.push(args);const r=replies.shift();if(r instanceof Error)throw r;return r;},...overrides};
  return {calls,run:()=>runRelease(options)};
}
test('CWS CLI requires explicit operation and defaults to dry run',()=>{
  assert.throws(()=>parseArgs([]),/EXPLICIT_MODE/);
  for(const mode of ['publish','release',''])assert.throws(()=>parseArgs([mode]),/EXPLICIT_MODE/);
  assert.equal(parseArgs(['upload','--artifact','file.zip','--sha256',sha256]).execute,false);
  assert.throws(()=>parseArgs(['upload','--execute','--dry-run']),/CONFLICTING/);
  assert.throws(()=>parseArgs(['upload','--token','SECRET']),/UNKNOWN/);
});
test('CWS dry run validates artifact without credentials or any network, even before target verification',async()=>{
 const s=setup({execute:false,env:{},config:{repository:REPOSITORY,publisherId:null,itemId:null,verified:false}});
 const r=await s.run();assert.equal(r.dryRun,true);assert.equal(r.targetVerified,false);assert.equal(s.calls.length,0);
});
test('CWS rejects other repository, unverified/invalid targets and untrusted execution context before network',async()=>{
 for(const overrides of [
  {config:{...config,repository:'other/repo'}},{config:{...config,verified:false}},
  {config:{...config,publisherId:'../other'}},{config:{...config,itemId:'x'.repeat(32)}},
  ...['GITHUB_REPOSITORY','GITHUB_REF','GITHUB_SHA','GITHUB_EVENT_NAME','GITHUB_WORKFLOW_REF','CWS_ACCESS_TOKEN'].map(k=>({env:{...env,[k]:''}}))
 ]){const s=setup(overrides);await assert.rejects(s.run());assert.equal(s.calls.length,0);}
});
test('CWS upload sends exact bytes once and cannot call publish',async()=>{
 const s=setup();const r=await s.run();assert.equal(r.operation,'upload');assert.equal(r.versionVerified,true);
 assert.equal(s.calls.length,1);const [url,opts]=s.calls[0];
 assert.equal(url,`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`);
 assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.deepEqual(opts.body,(await verify()).bytes);
 assert.equal(JSON.stringify(r).includes('SECRET'),false);
});
test('CWS submit needs explicit SHA approval and exact successful version-verified receipt before reupload',async()=>{
 for(const overrides of [{env:{...env,CWS_SUBMISSION_APPROVED:''}},{receipt:null},
  ...['sha256','version','publisherId','itemId','repository','operation','uploadState','versionVerified'].map(k=>({receipt:{...receipt,[k]:'wrong'}}))]){
 const s=setup({mode:'submit',...overrides});await assert.rejects(s.run());assert.equal(s.calls.length,0);
 }
});
test('CWS approved submit reuploads exact artifact then requests staged review only',async()=>{
 const s=setup({mode:'submit'},[ok({uploadState:'UPLOAD_SUCCESS',crxVersion:'0.1.8'}),ok({state:'PENDING_REVIEW'})]);
 const r=await s.run();assert.equal(s.calls.length,2);assert.match(s.calls[0][0],/:upload$/);
 assert.match(s.calls[1][0],/:publish$/);
 assert.deepEqual(JSON.parse(s.calls[1][1].body),{publishType:'STAGED_PUBLISH',skipReview:false,blockOnWarnings:true});
 assert.equal(r.state,'PENDING_REVIEW');
});
test('CWS fails closed on response item/name/version mismatch before submitting',async()=>{
 for(const response of [{name:'other'},{itemId:'b'.repeat(32)},{crxVersion:'9.9.9'}]){
 const s=setup({mode:'submit'},[ok({uploadState:'UPLOAD_SUCCESS',crxVersion:'0.1.8',...response})]);
 await assert.rejects(s.run());assert.equal(s.calls.length,1);
 }
});
test('CWS async uploads poll GET at most six times with no mutation retry',async()=>{
 const s=setup({},[ok({uploadState:'UPLOAD_IN_PROGRESS'}),...Array.from({length:6},()=>ok({lastAsyncUploadState:'UPLOAD_IN_PROGRESS'}))]);
 await assert.rejects(s.run(),/UPLOAD_PENDING/);assert.equal(s.calls.length,7);
 assert.equal(s.calls.filter(c=>c[1].method==='POST').length,1);
});
test('CWS async completion is upload only and never infers draft version from old submitted revision',async()=>{
 for(const mode of ['upload','submit']){
 const s=setup({mode},[ok({uploadState:'UPLOAD_IN_PROGRESS'}),ok({lastAsyncUploadState:'UPLOAD_SUCCESS',submittedItemRevisionStatus:{distributionChannels:[{crxVersion:'0.1.8'}]}})]);
 if(mode==='submit')await assert.rejects(s.run(),/ASYNC_VERSION_UNVERIFIED/);
 else assert.equal((await s.run()).versionVerified,false);
 assert.equal(s.calls.length,2);assert.equal(s.calls[1][1].method,'GET');
 }
});
test('CWS request failures redact response bodies and exceptions and never retry mutation',async()=>{
 for(const response of [new Error('SECRET-DO-NOT-LOG'),{ok:false,json:async()=>{throw new Error('SECRET')}}, {ok:true,json:async()=>{throw new Error('SECRET')}}]){
 const s=setup({},[response]);await assert.rejects(s.run(),e=>e.message==='CWS_MUTATION_UNCONFIRMED_CHECK_DASHBOARD');assert.equal(s.calls.length,1);
 }
});
test('CWS submit refuses unexpected published response and never claims release success',async()=>{
 const s=setup({mode:'submit'},[ok({uploadState:'UPLOAD_SUCCESS',crxVersion:'0.1.8'}),ok({state:'PUBLISHED'})]);
 await assert.rejects(s.run(),/SUBMISSION_STATE_UNCONFIRMED/);assert.equal(s.calls.length,2);
});

test('CWS approved credential support refreshes only at fixed OAuth endpoint, without logging', async()=>{
 const calls=[];
 const token=await obtainAccessToken({CWS_CLIENT_ID:'id',CWS_CLIENT_SECRET:'secret',CWS_REFRESH_TOKEN:'refresh'},async(...args)=>{
 calls.push(args);return {ok:true,json:async()=>({access_token:'access',token_type:'Bearer',scope:'https://www.googleapis.com/auth/chromewebstore'})};});
 assert.equal(token,'access');assert.equal(calls.length,1);assert.equal(calls[0][0],'https://oauth2.googleapis.com/token');
 assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].body.get('grant_type'),'refresh_token');
});
test('CWS OAuth errors/missing scope are redacted and never retried',async()=>{
 for(const data of [{access_token:'secret',token_type:'Bearer',scope:'other'},{access_token:'secret',token_type:'Basic'},null]){
 let calls=0;
 await assert.rejects(obtainAccessToken({CWS_CLIENT_ID:'id',CWS_CLIENT_SECRET:'secret',CWS_REFRESH_TOKEN:'refresh'},async()=>{
 calls++;if(data===null)throw new Error('SECRET');return {ok:true,json:async()=>data};}),/CWS_TOKEN_EXCHANGE_FAILED/);
 assert.equal(calls,1);
 }
});
