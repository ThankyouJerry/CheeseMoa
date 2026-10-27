import test from 'node:test';
import assert from 'node:assert/strict';
import {csvField,createCsvParts} from '../src/vod/chat-csv.js';
import {parseVodSource} from '../src/vod/source.js';
const job={source:parseVodSource('https://chzzk.naver.com/video/000123'),startMs:0,endMs:1000,status:'partial',quality:'boundary-unverified',detail:'경계 미확인'};
const row={elapsedMs:1,nickname:'한국어🙂',message:'쉼표, 따옴표"\r\n다음 줄'};
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=text.charCodeAt(0)===0xfeff?1:0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if(c==='\r'&&text[i+1]==='\n'&&!quoted){row.push(field);rows.push(row);row=[];field='';i++;}
    else field+=c;
  }return rows;
}
test('CSV round trips quotes, CRLF, Korean and emoji with source/range/state metadata',async()=>{
  const [part]=await createCsvParts(job,[[row]]);const text=await part.blob.text();
  // Blob.text strips UTF-8 BOM, so inspect bytes directly.
  assert.deepEqual([...new Uint8Array(await part.blob.arrayBuffer()).slice(0,3)],[239,187,191]);
  const parsed=parseCsv(text);assert.equal(parsed[1][0],job.source.canonicalUrl);assert.equal(parsed[1][1],'000123');
  assert.equal(parsed[1][2],'1');assert.equal(parsed[1][3],'00:00:00.001');assert.equal(parsed[1][4],row.nickname);assert.equal(parsed[1][5],row.message);
  assert.deepEqual(parsed[1].slice(6),['partial','0','1000','boundary-unverified','message','경계 미확인']);
  assert.match(part.filename,/000123_0-1000_partial_part001\.csv$/);
});
test('CSV neutralizes formulas including whitespace, control and Unicode format prefixes',()=>{
  for(const text of ['=1','+1','-1','@SUM(A1)',' \t=1','\r=1','\u0000=1','\u007f=1','\u200b=1','\u202e+1','\tplain'])
    assert.equal(parseCsv(csvField(text)+'\r\n')[0][0],"'"+text);
  for(const text of ['ordinary','안녕','a=b','42'])assert.equal(parseCsv(csvField(text)+'\r\n')[0][0],text);
});
test('zero-chat export retains source, status, range and quality in a distinguishable metadata row',async()=>{
  for(const status of ['paused','failed','partial','completed']){
    const [part]=await createCsvParts({...job,status,endMs:null},[]);const rows=parseCsv(await part.blob.text());
    assert.equal(rows.length,2);assert.equal(rows[1][6],status);assert.equal(rows[1][2],'');assert.equal(rows[1][10],'metadata');assert.equal(rows[1][9],job.quality);
  }
});
test('splits by encoded UTF-8 byte size and repeats header on each valid part',async()=>{
  const many=Array.from({length:20},(_,i)=>({...row,elapsedMs:i}));
  const parts=await createCsvParts(job,[many],{partBytes:600,totalBytes:20000});assert.ok(parts.length>1);
  let count=0;for(const part of parts){assert.ok(part.blob.size<=600);const records=parseCsv(await part.blob.text());assert.equal(records[0][0],'source_url');count+=records.length-1;}
  assert.equal(count,20);
});
test('oversized single row and total export limit fail explicitly',async()=>{
  await assert.rejects(createCsvParts(job,[[{...row,message:'🙂'.repeat(500)}]],{partBytes:600}),{code:'CSV_ROW_LIMIT'});
  await assert.rejects(createCsvParts(job,[[row,row,row]],{partBytes:600,totalBytes:650}),{code:'CSV_LIMIT'});
});
test('invalid limits and running/source-invalid jobs reject before consuming rows',async()=>{
  async function* unread(){assert.fail('should not consume');}
  for(const partBytes of [NaN,Infinity,-1,0,1,1.5])await assert.rejects(createCsvParts(job,unread(),{partBytes}),{code:'CSV_LIMIT'});
  for(const totalBytes of [NaN,Infinity,-1,0,1.5])await assert.rejects(createCsvParts(job,unread(),{totalBytes}),{code:'CSV_LIMIT'});
  await assert.rejects(createCsvParts({...job,status:'running'},unread()),{code:'BUSY'});
  await assert.rejects(createCsvParts({...job,source:{canonicalUrl:'https://evil.invalid'}},unread()));
});
