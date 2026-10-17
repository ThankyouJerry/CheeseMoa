// Unofficial contracts: kimcore/chzzk src/api/search.ts and src/api/channel.ts.
// Live-following endpoint/list: greasyfork.org/scripts/482634/code (author's source).
// These are public-source observations, not a NAVER-supported or live-tested API.
const API = "https://api.chzzk.naver.com";
export const DISCOVERY_PAGE_SIZE = 50;
export const DISCOVERY_MAX_PAGES = 20;

export class DiscoveryError extends Error {
  constructor(code, message) { super(message); this.name = "DiscoveryError"; this.code = code; }
}

const schemaError = () => new DiscoveryError("schema", "치지직 응답 형식이 변경되어 목록을 확인할 수 없습니다. 채널 주소로 추가해 주세요.");

function failStatus(status) {
  if (status === 401 || status === 403) throw new DiscoveryError("auth", "치지직에 로그인한 뒤 팔로잉을 다시 불러와 주세요.");
  if (status === 429) throw new DiscoveryError("rate", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  throw new DiscoveryError("api", "치지직에서 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

async function request(path, {signal, fetchImpl = globalThis.fetch, timeoutMs = 10000, credentials = "omit"} = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, {once: true});
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(`${API}${path}`, {
      method: "GET", credentials, cache: "no-store", redirect: "error", signal: controller.signal,
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!response.ok) failStatus(response.status);
    let payload;
    try { payload = await response.json(); } catch { throw schemaError(); }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!payload || typeof payload !== "object" || !Number.isInteger(payload.code)) throw schemaError();
    if (payload.code !== 200) failStatus(payload.code);
    if (!payload.content || typeof payload.content !== "object") throw schemaError();
    return payload.content;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (timedOut) throw new DiscoveryError("timeout", "응답이 지연되고 있습니다. 다시 시도해 주세요.");
    if (error instanceof DiscoveryError || error?.name === "AbortError") throw error;
    throw new DiscoveryError("network", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

function channelItem(value) {
  if (!value || typeof value.channelId !== "string" || !/^[a-f0-9]{32}$/i.test(value.channelId)
      || typeof value.channelName !== "string" || !value.channelName.trim()) throw schemaError();
  const resourceId = value.channelId.toLowerCase();
  return {
    id: `live:${resourceId}`, resourceId, type: "live", typeLabel: "라이브",
    url: `https://chzzk.naver.com/live/${resourceId}`,
    name: "", streamerName: value.channelName.trim().slice(0, 100),
    openLive: value.openLive === true,
  };
}

function rowsToChannels(rows, limit = DISCOVERY_PAGE_SIZE) {
  if (!Array.isArray(rows) || rows.length > limit) throw schemaError();
  const unique = new Map();
  for (const row of rows) {
    const item = channelItem(row?.channel);
    unique.set(item.id, item);
  }
  return [...unique.values()];
}

export async function searchChannels(keyword, {offset = 0, ...options} = {}) {
  if (typeof keyword !== "string" || !keyword.trim() || keyword.trim().length > 100)
    throw new DiscoveryError("input", "채널 이름을 1~100자로 입력해 주세요.");
  if (!Number.isSafeInteger(offset) || offset < 0) throw schemaError();
  const query = new URLSearchParams({keyword: keyword.trim(), size: String(DISCOVERY_PAGE_SIZE), offset: String(offset)});
  const content = await request(`/service/v1/search/channels?${query}`, {...options, credentials: "omit"});
  const channels = rowsToChannels(content.data);
  const next = content.page?.next?.offset;
  if (next !== undefined && next !== null && (!Number.isSafeInteger(next) || next < 0 || (next > 0 && next <= offset))) throw schemaError();
  if (next > 0 && content.data.length === 0) throw schemaError();
  return {channels, next: next > 0 ? next : null};
}

export async function loadFollowingChannels({page = 0, ...options} = {}) {
  // Public evidence confirms an unpaginated live-only list; do not invent paging.
  if (page !== 0) throw schemaError();
  const content = await request("/service/v1/channels/followings/live", {...options, credentials: "include"});
  const channels = rowsToChannels(content.followingList, 1000).map(item => ({...item, openLive: true}));
  const total = content.totalCount;
  if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) throw schemaError();
  if (total !== undefined && total > content.followingList.length)
    throw new DiscoveryError("partial", "팔로잉 라이브 목록이 일부만 반환되었습니다. 이름 검색으로 채널을 찾아 주세요.");
  return {channels, next: null, total: total ?? null};
}
