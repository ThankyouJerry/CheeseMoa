// Unofficial CHZZK adapter. Protocol reference: Chzzk-Platter content.js
// 1799bca3f6ba37f25143c92869c6c844df7c4ef3; independently implemented.
const API = "https://api.chzzk.naver.com/service/v1/channels/";
export const REWARD_TYPES = Object.freeze({
  WATCH_1_HOUR: "1시간 시청", WATCH_5_MIN: "5분 시청", FOLLOW: "팔로우",
  DONATE: "후원", DONATE_MONTHLY: "월간 후원",
  SUBSCRIPTION_GIFT: "구독 선물", SUBSCRIPTION_GIFT_MONTHLY: "월간 구독 선물",
});
function channelPath(channelId) {
  if (!/^[a-f0-9]{32}$/i.test(channelId ?? "")) throw new Error("Invalid channel ID");
  return `${API}${channelId}/log-power`;
}
// Never persist raw response text, headers, URLs or arbitrary server messages.
const SAFE_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND", "CONFLICT", "BAD_REQUEST", "TOO_MANY_REQUESTS", "INTERNAL_SERVER_ERROR"]);
function safeCode(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 999999 ? value :
    SAFE_CODES.has(value) ? value : null;
}
export class PowerRequestError extends Error {
  constructor(status, {method, retryAfterMs = 0, cause, schema = false,
    httpStatus = null, applicationCode = null, errorCode = "REQUEST_FAILED", requestScope} = {}) {
    super(`Log power request failed (${status})`, {cause});
    this.status = status;
    this.requestScope = requestScope;
    this.method = method;
    this.httpStatus = httpStatus;
    this.applicationCode = applicationCode;
    this.errorCode = errorCode;
    this.retryAfterMs = retryAfterMs;
    this.retryable = !schema && method === "GET" &&
      (status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599));
  }
}
function retryDelay(response) {
  const value = response.headers?.get?.("Retry-After");
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
async function requestPowerResponse(url, method, fetcher) {
  const requestScope = url === "https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus" ? "account" : "channel";
  let response;
  try {
    response = await fetcher(url, {
      method, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
  } catch (cause) {
    if (cause instanceof PowerRequestError || ["POWER_HOST_REQUIRED","POWER_PLAYBACK_WAIT"].includes(cause?.code)) {
      cause.requestScope ??= cause.code === "POWER_HOST_REQUIRED" ? "channel" : requestScope;
      throw cause;
    }
    const error = new PowerRequestError(0, {method, cause, requestScope, errorCode: "NETWORK_ERROR"});
    if (cause.name === "TimeoutError") { error.name = "TimeoutError"; error.errorCode = "TIMEOUT"; }
    throw error;
  }
  const httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
  const retryAfterMs = retryDelay(response);
  let data, empty = false, bodyError = null;
  try {
    if (typeof response.text === "function") {
      const text = await response.text();
      empty = text.trim().length === 0;
      if (!empty) { try { data = JSON.parse(text); } catch { bodyError = "INVALID_JSON"; } }
    } else data = await response.json(); // Allows response-compatible test adapters.
  } catch { bodyError = "BODY_READ_ERROR"; }
  const applicationCode = safeCode(data?.code);
  const fail = (status, errorCode, schema = false) => {
    throw new PowerRequestError(status, {method, retryAfterMs, httpStatus, applicationCode, errorCode, schema, requestScope});
  };
  if (!response.ok) fail(httpStatus ?? 0, "HTTP_ERROR");
  // Explicit business failures remain failures even inside HTTP 2xx responses.
  if (data && Object.hasOwn(data, "code") && data.code !== 200) {
    fail(typeof applicationCode === "number" ? applicationCode : "schema", "APPLICATION_ERROR", applicationCode === null);
  }
  if (data && (data.success === false || data.ok === false ||
      (data.error !== undefined && data.error !== null && data.error !== false) ||
      (data.errorCode !== undefined && data.errorCode !== null && data.errorCode !== 0))) {
    fail("schema", "APPLICATION_ERROR", true);
  }
  if (bodyError) fail("schema", bodyError, true);
  // 202 means accepted/pending, not completed. Other unusual 2xx are unconfirmed.
  if (method === "PUT" && httpStatus !== null && ![200,201,204,205].includes(httpStatus)) fail("schema", "PENDING_OR_UNEXPECTED_STATUS", true);
  if (empty) {
    if (method === "PUT" && [200,201,204,205].includes(httpStatus)) return {httpStatus, applicationCode: null, content: undefined};
    fail("schema", "EMPTY_GET_RESPONSE", true);
  }
  if (!data || data.code !== 200) fail("schema", "UNKNOWN_ENVELOPE", true);
  return {httpStatus, applicationCode, content: data.content};
}
export async function requestPowerContent(url, method, fetcher = fetch) {
  if (method !== "GET") throw new Error("Use the separate mutation response adapter");
  return (await requestPowerResponse(url, "GET", fetcher)).content;
}
export async function requestPowerMutation(url, fetcher = fetch) {
  const {httpStatus, applicationCode} = await requestPowerResponse(url, "PUT", fetcher);
  return {httpStatus, applicationCode};
}
// Count only fixed categories: never expose arbitrary response strings or claim IDs.
// Reasons are mutually exclusive in this order, so excluded totals reconcile.
function rewardExclusion(claim) {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return "invalidEntry";
  const id = typeof claim.claimId === "string" ? claim.claimId :
    Number.isSafeInteger(claim.claimId) && claim.claimId > 0 ? String(claim.claimId) : "";
  if (!id || id.length > 200) return "invalidId";
  const type = typeof claim.claimType === "string" ? claim.claimType.toUpperCase() : "";
  if (!Object.hasOwn(REWARD_TYPES, type)) return "unsupportedType";
  if (typeof claim.state !== "string" || claim.state.toUpperCase() !== "COMPLIED") return "notReady";
  if (typeof claim.saveType !== "string" || claim.saveType.toUpperCase() !== "ACTIVE") return "inactiveSave";
  return null;
}
function normalizeReward(claim) {
  if (rewardExclusion(claim)) return null;
  return {claimId: String(claim.claimId), claimType: claim.claimType.toUpperCase(), state: "COMPLIED", saveType: "ACTIVE",
    amount: Number.isSafeInteger(claim.amount) && claim.amount > 0 ? claim.amount : null};
}
export async function readLogPower(channelId, fetcher = fetch) {
  const content = await requestPowerContent(channelPath(channelId), "GET", fetcher);
  if (!content || !Number.isSafeInteger(content.amount) || content.amount < 0 ||
      typeof content.active !== "boolean" || !Array.isArray(content.claims)) {
    throw new PowerRequestError("schema", {method: "GET", schema: true});
  }
  const diagnostics = {received: content.claims.length, eligible: 0, excluded: 0,
    reasons: {invalidEntry: 0, invalidId: 0, unsupportedType: 0, notReady: 0, inactiveSave: 0}};
  const claims = [];
  for (const claim of content.claims) {
    const reason = rewardExclusion(claim);
    if (reason) { diagnostics.excluded++; diagnostics.reasons[reason]++; }
    else { diagnostics.eligible++; claims.push(normalizeReward(claim)); }
  }
  return {balance: content.amount, active: content.active, claims, diagnostics};
}
export async function claimAvailableReward(channelId, reward, fetcher = fetch, now = Date.now) {
  const path = channelPath(channelId);
  const eligible = normalizeReward(reward);
  if (!eligible) throw new Error("Only server-confirmed available rewards may be collected");
  const response = await requestPowerMutation(`${path}/claims/${encodeURIComponent(eligible.claimId)}`, fetcher);
  return {...response, channelId, claimId: eligible.claimId, claimType: eligible.claimType,
    kind: eligible.claimType.startsWith("WATCH_") ? "watch" : "reward", confirmedAt: now(),
    amount: eligible.amount, amountSource: eligible.amount === null ? "unknown" : "offered-reward"};
}
// Kept for callers of the former watch-only adapter; the eligibility checks still apply.
export async function claimWatchReward(channelId, reward, fetcher = fetch, now = Date.now) {
  if (reward?.claimType !== "WATCH_1_HOUR") throw new Error("Only available watch rewards may be collected");
  return claimAvailableReward(channelId, reward, fetcher, now);
}
