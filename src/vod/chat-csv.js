import {formatTimeMs} from './time.js';
import {ChatError} from './chat-api.js';
import {requireVodSource} from './source.js';

const encoder = new TextEncoder();
export const CSV_PART_BYTES = 8 * 1024 * 1024;
export function csvField(value) {
  let text = String(value ?? '');
  // Preserve the DB original; exported spreadsheet text is deliberately neutralized.
  if (/^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(text) || /^[\p{Cc}\p{Cf}]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export async function createCsvParts(job, batches, {partBytes=CSV_PART_BYTES, totalBytes=96*1024*1024} = {}) {
  requireVodSource(job.source);
  if (!['paused','partial','failed','completed'].includes(job.status)) throw new ChatError('BUSY','수집을 중단한 뒤 CSV를 준비해 주세요.');
  for (const value of [partBytes,totalBytes]) if (!Number.isSafeInteger(value) || value <= 0)
    throw new ChatError('CSV_LIMIT','올바른 CSV 크기 제한이 필요합니다.');
  const header='\uFEFFsource_url,video_id,elapsed_ms,elapsed_time,nickname,message,collection_status,requested_start_ms,requested_end_ms,quality,row_type,collection_detail\r\n';
  const headSize=encoder.encode(header).length;
  if (partBytes <= headSize) throw new ChatError('CSV_LIMIT','CSV 파일 크기 제한이 너무 작습니다.');
  const parts=[];let fragments=[header], size=headSize, total=0, rows=0, anyRows=false;
  const finish=()=>{
    total+=size;
    if(total>totalBytes)throw new ChatError('CSV_LIMIT','CSV 전체 크기 제한에 도달했습니다.');
    const filename=`chzzk_${job.source.videoId}_${job.startMs}-${job.endMs??'end'}_${job.status}_part${String(parts.length+1).padStart(3,'0')}.csv`;
    parts.push({filename,blob:new Blob(fragments,{type:'text/csv;charset=utf-8'})});
    fragments=[header];size=headSize;rows=0;
  };
  function append(row) {
    const line=[job.source.canonicalUrl,job.source.videoId,row?.elapsedMs??'',row?formatTimeMs(row.elapsedMs):'',row?.nickname??'',row?.message??'',
      job.status,job.startMs,job.endMs??'',job.quality,row?'message':'metadata',job.detail??''].map(csvField).join(',')+'\r\n';
    const bytes=encoder.encode(line).length;
    if(bytes+headSize>partBytes)throw new ChatError('CSV_ROW_LIMIT','한 행이 CSV 파트 제한을 초과합니다.');
    if(size+bytes>partBytes)finish();
    if(total+size+bytes>totalBytes)throw new ChatError('CSV_LIMIT','CSV 전체 크기 제한에 도달했습니다.');
    fragments.push(line);size+=bytes;rows++;
  }
  for await(const batch of batches)for(const row of batch){append(row);anyRows=true;}
  // An empty export still records source, requested range and failure/coverage state.
  if(!anyRows)append(null);
  if(rows||!parts.length)finish();
  return parts;
}
