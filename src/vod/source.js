import { parseChzzkUrl } from '../shared/chzzk-url.js';

export function parseVodSource(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const parsed = parseChzzkUrl(value);
  if (parsed?.type !== 'video' || parsed.resourceId.length > 32) return null;
  return {
    schemaVersion: 1,
    platform: 'chzzk',
    sourceKind: 'vod',
    videoId: parsed.resourceId,
    canonicalUrl: parsed.url,
    sourceKey: `chzzk:vod:${parsed.resourceId}`,
    timeBasis: 'vod-relative-ms',
  };
}

export function requireVodSource(value) {
  const source = parseVodSource(typeof value === 'string' ? value : value?.canonicalUrl);
  if (!source || (typeof value === 'object' && (value.videoId !== source.videoId || value.sourceKey !== source.sourceKey))) {
    throw new Error('올바른 CHZZK 다시보기 주소를 입력해 주세요.');
  }
  return source;
}
