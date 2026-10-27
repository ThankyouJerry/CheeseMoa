import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVodSource,requireVodSource} from '../src/vod/source.js';
import {parseTimeMs,formatTimeMs,requireTimeMs} from '../src/vod/time.js';
test('VOD identity remains a string and rejects live/external/credential URLs',()=>{
 const id='123456789012345678901234567890';
 const source=requireVodSource(`https://chzzk.naver.com/video/${id}?tracking=discarded`);
 assert.equal(source.videoId,id);assert.equal(source.canonicalUrl,`https://chzzk.naver.com/video/${id}`);
 for(const url of [null,'https://evil.example/video/1','https://me@chzzk.naver.com/video/1','https://chzzk.naver.com/live/'+'a'.repeat(32),'https://chzzk.naver.com/video/1/extra'])assert.equal(parseVodSource(url),null);
 assert.throws(()=>requireVodSource({...source,videoId:'2'}));
});
test('VOD millisecond time round trips and invalid time fails',()=>{
 for(const time of [0,1,999,123456,360000000,Number.MAX_SAFE_INTEGER])assert.equal(parseTimeMs(formatTimeMs(time)),time);
 assert.equal(parseTimeMs('83.456'),83456);
 for(const time of [-1,NaN,Infinity,1.5,'1'])assert.throws(()=>requireTimeMs(time));
 for(const text of ['','-1','1e3','00:60:00','00:00:60','1.1234'])assert.throws(()=>parseTimeMs(text));
});
test('VOD entry keeps existing permissions and restricts new frame code to VOD',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.permissions,['storage']);
 assert.deepEqual(manifest.host_permissions,['https://chzzk.naver.com/*','https://api.chzzk.naver.com/*','https://comm-api.game.naver.com/*']);
 const entry=manifest.content_scripts.find(e=>e.js.includes('src/vod/vod-frame.js'));
 assert.deepEqual(entry.matches,['https://chzzk.naver.com/video/*']);assert.equal(entry.all_frames,true);
 assert.equal(manifest.background.service_worker,'src/background/power-worker.js');
});
