const CHZZK_HOST = "chzzk.naver.com";
const PATH_TYPES = new Map([
  ["live", "라이브"],
  ["video", "다시보기"],
]);

export function parseChzzkUrl(value) {
  const input = value.trim();
  if (!input) return null;

  let url;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return null;
  }

  if (url.hostname !== CHZZK_HOST && url.hostname !== `www.${CHZZK_HOST}`) {
    return null;
  }

  const [type, resourceId] = url.pathname.split("/").filter(Boolean);
  if (!PATH_TYPES.has(type) || !resourceId) return null;

  const canonicalUrl = `https://${CHZZK_HOST}/${type}/${encodeURIComponent(resourceId)}`;
  return {
    id: `${type}:${resourceId}`,
    type,
    typeLabel: PATH_TYPES.get(type),
    resourceId,
    url: canonicalUrl,
  };
}

export function parseChzzkUrls(value) {
  const candidates = value.split(/[\n,\s]+/).filter(Boolean);
  const unique = new Map();
  const rejected = [];

  for (const candidate of candidates) {
    const parsed = parseChzzkUrl(candidate);
    if (parsed) unique.set(parsed.id, parsed);
    else rejected.push(candidate);
  }

  return { items: [...unique.values()], rejected };
}

export function createDisplayName(item, index) {
  return `${item.typeLabel} ${index + 1}`;
}
