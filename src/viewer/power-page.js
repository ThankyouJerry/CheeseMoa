// Generated from shared production modules. Run node scripts/build-power-page.mjs.
(() => {
"use strict";

// src/shared/power-build.js
const POWER_BUILD = "power-20261026.2";


// src/shared/log-power.js
// Unofficial CHZZK adapter. Protocol reference: Chzzk-Platter content.js
// 1799bca3f6ba37f25143c92869c6c844df7c4ef3; independently implemented.
const API = "https://api.chzzk.naver.com/service/v1/channels/";
const REWARD_TYPES = Object.freeze({
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
class PowerRequestError extends Error {
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
async function requestPowerContent(url, method, fetcher = fetch) {
  if (method !== "GET") throw new Error("Use the separate mutation response adapter");
  return (await requestPowerResponse(url, "GET", fetcher)).content;
}
async function requestPowerMutation(url, fetcher = fetch) {
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
async function readLogPower(channelId, fetcher = fetch) {
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
async function claimAvailableReward(channelId, reward, fetcher = fetch, now = Date.now) {
  const path = channelPath(channelId);
  const eligible = normalizeReward(reward);
  if (!eligible) throw new Error("Only server-confirmed available rewards may be collected");
  if (eligible.claimType === 'WATCH_1_HOUR') throw Object.assign(
    new Error('1시간 보상은 공식 받기 UI에서 확인합니다.'),
    {code:'WATCH_UI_REQUIRED', method:'GET', mutationDispatched:false, retryable:false});
  const response = await requestPowerMutation(`${path}/claims/${encodeURIComponent(eligible.claimId)}`, fetcher);
  return {...response, channelId, claimId: eligible.claimId, claimType: eligible.claimType,
    kind: eligible.claimType.startsWith("WATCH_") ? "watch" : "reward", confirmedAt: now(),
    amount: eligible.amount, amountSource: eligible.amount === null ? "unknown" : "offered-reward"};
}
// Kept for callers of the former watch-only adapter; the eligibility checks still apply.
async function claimWatchReward(channelId, reward, fetcher = fetch, now = Date.now) {
  if (reward?.claimType !== "WATCH_1_HOUR") throw new Error("Only available watch rewards may be collected");
  return claimAvailableReward(channelId, reward, fetcher, now);
}


// src/shared/power-session.js
// Diagnostic text contains fixed labels and bounded numeric counts only.
function describePowerDiagnostics(d) {
  if (!d || !Number.isSafeInteger(d.received) || d.received < 0) return "보상 응답 항목 수 미확인";
  const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  if (d.received === 0) return "서버 보상 목록 0건 (빈 응답 목록)";
  const labels = {invalidEntry:"항목 형식 오류",invalidId:"보상 식별값 형식 오류",unsupportedType:"미지원 종류",notReady:"준비 상태 미충족",inactiveSave:"수령 활성 상태 미충족"};
  const reasons = Object.entries(labels).filter(([key])=>count(d.reasons?.[key])>0).map(([key,label])=>`${label} ${count(d.reasons[key])}건`).join(", ");
  return `서버 보상 목록 ${d.received}건 · 지원 적격 ${count(d.eligible)}건 · 제외 ${count(d.excluded)}건${reasons?` (${reasons})`:""} · 적격 중 이전 처리 기록 ${count(d.alreadyHandled)}건`;
}
// Session-only opt-in; only explicitly enabled GET checks are retried.
function createPowerSession({ collector, getChannels, checkAccount, onStatus,
  schedule = setTimeout, cancel = clearTimeout, interval = 60000, now = Date.now }) {
  let enabled = false, generation = 0, running = false;
  let lastTick = -Infinity;
  let pendingLock, timer, accountId = null, failures = 0, retryAt = 0;
  const publish = (status, detail = "", result) => onStatus({enabled, status, detail, accountId, result, retryAt, failures});
  function stop() {
    enabled = false; generation++; pendingLock?.abort(); cancel(timer); timer = undefined;
    failures = 0; retryAt = 0; publish("off");
  }
  async function tick(epoch) {
    if (!enabled || generation !== epoch || running) return;
    // Do not overflow setTimeout for a long Retry-After deadline.
    if (now() < retryAt) {
      timer = schedule(() => tick(generation), Math.min(retryAt - now(), 2147483647));
      return;
    }
    running = true; lastTick = now();
    let delay = interval;
    try {
      const checkedAccount = await checkAccount();
      if (!enabled || generation !== epoch) return;
      if (!checkedAccount) throw Object.assign(new Error("로그인 상태가 아닙니다."), {code: "LOGGED_OUT"});
      if (accountId && checkedAccount !== accountId) throw Object.assign(new Error("계정이 변경되었습니다."), {code: "ACCOUNT_CHANGED"});
      accountId = checkedAccount;
      const expectedAccount = checkedAccount;
      const sameAccount = async () => {
        if (await checkAccount() !== expectedAccount) throw Object.assign(new Error("계정이 변경되었거나 로그아웃했습니다."), {code: "ACCOUNT_CHANGED"});
        return true;
      };
      const channels = getChannels().filter(c => c.type === "live");
      if (channels.length !== 1) throw Object.assign(new Error("주 채널을 하나 선택한 뒤 다시 켜주세요."), {code: "MAIN_CHANNEL_REQUIRED"});
      const channel = channels[0];
      const isCurrent = async () => {
        if (!enabled || generation !== epoch || !getChannels().some(c => c.id === channel.id && c.type === "live")) return false;
        await sameAccount();
        return enabled && generation === epoch && getChannels().some(c => c.id === channel.id && c.type === "live");
      };
      if (!await isCurrent()) return;
      pendingLock = new AbortController();
      publish("checking", "보상 확인 중 · 다른 창이 처리 중이면 최대 15초 동안 잠금 획득을 기다립니다.");
      const result = await collector.collect(channel.resourceId, {enabled: true, accountId: expectedAccount, isCurrent, isSameAccount: sameAccount, signal: pendingLock.signal});
      if (enabled && generation === epoch) {
        if (result.status === "disabled") {
          enabled = false; generation++; cancel(timer); timer = undefined;
          publish("off", "수집 소유권 또는 채널이 바뀌어 중단했습니다. 최신 조회 결과로 표시하지 않습니다.");
          return;
        }
        failures = 0; retryAt = 0;
        const diagnosticDetail = describePowerDiagnostics(result.diagnostics);
        publish(result.status === "inactive" ? "inactive" : result.blocked ? "blocked" : "checked", result.blocked ? `이전 수령 실패·미확인 ${result.blocked}건이 아직 수령 가능으로 표시됩니다. 같은 보상은 재전송하지 않습니다. 다른 새 보상만 확인합니다. 이번 수령 확인 ${result.collected}건 · ${diagnosticDetail}` : result.status === "inactive" ? `이 채널의 통나무파워가 비활성 상태입니다. 수령 요청을 보내지 않았습니다. · ${diagnosticDetail}` :
          `주 채널 보상 확인 · 이번 확인에서 ${result.collected}건 수령 확인 · 시청 적립 여부는 별도 확인이 필요합니다 · ${diagnosticDetail}`, result);
      }
    } catch (error) {
      if (generation !== epoch) return;
      // A local GET preflight can wait for playback without consuming HTTP retries.
      // This never applies to PUT or an unknown/dispatched mutation.
      if(['POWER_PLAYBACK_WAIT','POWER_WATCH_UI_WAIT'].includes(error.code)&&error.method==='GET'&&error.mutationDispatched===false){
        delay=15000;retryAt=now()+delay;
        const waiting=error.code==='POWER_WATCH_UI_WAIT';
        publish(waiting?'watch-ui-wait':'playback-wait',`${error.collectionResult?.collected ? `${error.collectionResult.collected}건 수령 확인 · 보유량 조회 대기. ` : ''}${waiting?'1시간 보상은 공식 받기 버튼이 보일 때 처리합니다. 채팅 패널을 열어 주세요. 버튼이 없거나 여러 개면 클릭하지 않고 15초 뒤 다시 확인합니다.':'재생 준비를 기다립니다. 15초 간격으로 로컬 재생 상태만 확인하며, 준비되기 전에는 보상 요청을 보내지 않습니다.'} ON 설정은 유지됩니다.`,error.collectionResult);
        return;
      }
      if (Number.isInteger(error.failures)) failures = Math.max(0, error.failures - (error.code === "POWER_BACKOFF" ? 0 : 1));
      if (error.code !== "POWER_PLAYBACK_WAIT" && error.method === "GET" && error.retryable && (error.code === "POWER_BACKOFF" ? failures : ++failures) <= 5) {
        delay = error.code === "POWER_BACKOFF" ? Math.max(0,error.retryAt-now()) : Math.max(Math.min(interval * 2 ** (failures - 1), 900000), error.retryAfterMs || 0);
        retryAt = now() + delay;
        const connection = error.code === "POWER_HOST_REQUIRED" ? `${error.message} 연결 확인 단계에서 대기합니다. ` : "";
        const prefix = error.collectionResult?.collected ? `${error.collectionResult.collected}건 수령 확인 · 보유량 조회 대기. ` : "";
        publish("waiting", `${connection}${prefix}${error.status === 429 ? "요청 제한" : "일시적인 조회 오류"} · ${new Date(retryAt).toLocaleTimeString("ko-KR")} 이후 다시 조회합니다. 미확인 수령 요청은 재전송하지 않습니다.`, error.collectionResult);
      } else {
        enabled = false; generation++; cancel(timer); timer = undefined; retryAt = 0;
        const auth = error.code === "LOGGED_OUT" || error.status === 401;
        const detail = error.code === 'WATCH_UI_UNCONFIRMED' ?
          '공식 받기 버튼을 처리했지만 보상 상태와 보유량 변화가 함께 확인되지 않았습니다. 성공으로 기록하지 않았고 같은 보상은 자동으로 다시 클릭하지 않습니다.' : error.code === "POWER_ATTEMPT_LIMIT" ?
          "중복 방지 기록 2,000건 한도에 도달하여 자동수령을 중단했습니다. 기존 수령·미확인 기록은 보존되며 새 수령 요청은 보내지 않습니다. 기록을 지워 재시도하지 마세요." :
          ["MAIN_CHANNEL_REQUIRED", "POWER_HOST_REQUIRED", "POWER_LOCK_TIMEOUT"].includes(error.code) ? `${error.message}${failures > 5 ? " 연결 조회 재시도 한도에 도달하여 중단했습니다." : ""}` : error.code === "ACCOUNT_CHANGED" ?
          "계정 변경 또는 로그아웃이 감지되어 중단했습니다. 미확인 요청은 자동 재시도하지 않습니다." : auth ?
          "로그인 세션을 확인하지 못해 중단했습니다. 로그인 후 직접 다시 켜주세요." :
          error.status === 403 ? "계정 또는 보상 조회가 거부되어 중단했습니다. 1시간 보상은 API로 직접 수령하지 않습니다. 접근 상태를 확인한 뒤 직접 ON을 눌러주세요. 기존 미확인 보상은 재전송하지 않습니다." :
          error.status === 409 ? "이미 처리된 보상 응답으로 중단했습니다. 이 앱의 획득 성공으로 기록하지 않았습니다." :
          error.status === 429 ? "요청 제한으로 중단했습니다. 미확인 수령 요청은 자동 재시도하지 않습니다." :
          error.name === "TimeoutError" && error.method !== "GET" ? "요청 시간이 초과되어 중단했습니다. 수령 여부가 불명확한 요청은 자동 재시도하지 않습니다." :
          failures > 5 ? "조회 재시도 한도에 도달하여 중단했습니다. 연결 상태를 확인한 뒤 직접 다시 켜주세요." :
          /계정 식별|중복 방지 기록 한도|요청 중 계정/.test(error.message) ? error.message :
          "확인 또는 저장에 실패하여 중단했습니다. 수령 여부가 불명확한 요청은 이력에서 확인하세요.";
        const confirmed = error.collectionResult?.collected ? `${error.collectionResult.collected}건 수령 확인 및 기록 저장 완료. 후속 확인 또는 저장은 완료하지 못했습니다. ` : "";
        publish(auth ? "auth-required" : "error", confirmed + detail, error.collectionResult);
      }
    } finally {
      pendingLock = undefined; running = false;
      if (enabled) timer = schedule(() => tick(generation), generation !== epoch ? 0 : Math.min(delay, 2147483647));
    }
  }
  return {
    start(restored = {}) {
      if (enabled) return;
      enabled = true; generation++; accountId = null;
      failures = Number.isInteger(restored.failures) ? restored.failures : 0;
      retryAt = Number.isFinite(restored.retryAt) ? restored.retryAt : 0;
      if(retryAt > now()) publish("waiting", `이전 조회의 서버 대기시간을 유지합니다. ${new Date(retryAt).toLocaleTimeString("ko-KR")} 이후 다시 조회합니다.`);
      else publish("checking");
      if (!running) void tick(generation);
    },
    checkNow() {
      if (!enabled || running || now() < retryAt || now()-lastTick < 5000) return;
      cancel(timer); timer = undefined;
      void tick(generation);
    },
    stop,
  };
}


// src/shared/power-page-owner.js
function createPagePowerOwner({send,getChannelId,onState,schedule=setTimeout,cancel=clearTimeout,now=Date.now,requestId=()=>crypto.randomUUID()}){
 let epoch=null,channelId=null,startRequestId=null,generation=0,suspended=false,locallyEnabled=false;
 async function request(action,extra={}){
  const reply=await send({type:'cheesemoa-power-core',action,channelId,epoch,startRequestId,...extra});
  if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'수집 연결 응답을 확인하지 못했습니다.'),reply?.error||{});
  return reply.result;
 }
 const cancelStart=(id,channel,remember=false)=>id?request('cancel-start',{startRequestId:id,channelId:channel,remember}):remember?request('disable-default'):Promise.resolve();
 const session=createPowerSession({schedule,cancel,now,getChannels:()=>channelId?[{id:channelId,resourceId:channelId,type:'live'}]:[],
  checkAccount:async()=>(await request('account')).accountId,collector:{collect:()=>request('collect')},
  onStatus(state){locallyEnabled=state.enabled===true;onState(state);if(!suspended&&['error','auth-required'].includes(state.status)&&epoch)void request('stop').catch(()=>{})}});
 const api={
  async start({automatic=false}={}){
   const previousId=startRequestId,previousChannel=channelId;
   const turn=++generation;session.stop();epoch=null;channelId=getChannelId();suspended=false;startRequestId=requestId();
   const id=startRequestId,channel=channelId;
   if(previousId)void cancelStart(previousId,previousChannel).catch(()=>{});
   if(!/^[a-f0-9]{32}$/i.test(channel||'')){onState({enabled:false,status:'error',detail:'재생할 방송을 선택하세요.'});return}
   onState({enabled:false,status:'connecting',canStop:true,detail:'자동수령 시작을 연결하고 있습니다. OFF로 취소할 수 있습니다.'});
   try{
    const prepared=await request('start',{startRequestId:id,channelId:channel,automatic});
    if(turn!==generation){await cancelStart(id,channel);return}
    epoch=prepared.epoch;
    const active=await request('activate',{startRequestId:id,channelId:channel});
    if(turn!==generation){await cancelStart(id,channel);return}
    session.start(active);
   }catch(error){
    let saved=true;try{await cancelStart(id,channel)}catch{saved=false}
    if(turn===generation)onState({enabled:false,status:'error',detail:saved?error.message:'이 화면의 조회는 중단했습니다. 시작 취소 저장은 아직 확인되지 않았습니다.'});
   }
  },
  async stop({remember=false}={}){generation++;suspended=false;session.stop();try{await cancelStart(startRequestId,channelId,remember)}catch(error){onState({enabled:false,status:'error',detail:error.code==='POWER_PREFERENCE_SAVE_FAILED'?'자동수령을 중단했습니다. 다음 실행의 OFF 설정 저장은 확인하지 못했습니다.':'이 화면의 조회는 중단했습니다. 실행 주체의 OFF 저장을 확인하지 못했습니다.'})}},
  suspend(){generation++;suspended=true;session.stop()},
  deactivate(expectedEpoch){if(expectedEpoch!==epoch||!locallyEnabled)return;generation++;suspended=true;session.stop()},
  async restore(){
   const turn=++generation;channelId=getChannelId();suspended=false;
   if(!/^[a-f0-9]{32}$/i.test(channelId||''))return;
   try{const state=await request('status');if(turn!==generation)return;epoch=state.epoch;startRequestId=state.startRequestId;
    if(state.enabled)session.start(state);else if(state.defaultOn===true)await api.start({automatic:true});else onState({enabled:false,status:'off',detail:state.otherEnabled?'다른 방송 창에서 자동수령 중입니다. 이 창에서 ON을 누르면 실행 창을 전환합니다.':'자동수령 OFF · 직접 ON을 눌러 시작하세요.'});
   }catch{onState({enabled:false,status:'error',detail:'수집 연결을 확인하지 못했습니다. 자동수령은 시작하지 않았습니다.'})}
  },checkNow:()=>session.checkNow(),
 };
 return api;
}


// src/shared/watch-ui-claim.js

// Only the official hourly reward in the selected channel's chat may be clicked.
// No claim PUT, header changes, cookie access or guessed completion timestamps.
function findWatchRewardButton(doc) {
  const chat = doc?.querySelector('aside#aside-chatting');
  if (!chat) return null;
  const candidates = [...chat.querySelectorAll('button')].filter(button => {
    if (button.disabled || button.getAttribute('aria-disabled') === 'true' || !button.getClientRects().length) return false;
    for (let node = button; node; node = node.parentElement) {
      if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
      const style = doc.defaultView?.getComputedStyle(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    }
    const text = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''} ${button.title || ''}`;
    const hourlyLabel = /1\s*시간/.test(text) && /통나무|파워/.test(text);
    if (!/받기|수령/.test(text) || /5\s*분|후원|구독|팔로|선물/.test(text) ||
        (/배달/.test(text) && !hourlyLabel)) return false;
    const knownHourlyClass = /live_chatting_power_button__/.test(button.className || '');
    const markedPower = /_power_button_/.test(button.className || '') && /통나무|파워/.test(text);
    return knownHourlyClass || markedPower || hourlyLabel;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function collectWatchUiReward({channelId, claimId, getDocument, isPlaying,
  isEnabled, fetcher = fetch, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  let clicked = false;
  const failure = (code, status = 0) => Object.assign(new Error(code), {
    code, errorCode: code, status, method: clicked ? 'UI' : 'GET',
    retryable: !clicked && status === 0, mutationDispatched: clicked,
    phase: clicked ? 'mutation' : 'eligibility',
  });
  const readyDocument = () => {
    const doc = getDocument?.(channelId);
    return isEnabled?.(channelId) && isPlaying(channelId) &&
      doc?.URL === `https://chzzk.naver.com/live/${channelId}` ? doc : null;
  };
  if (!readyDocument()) throw failure('POWER_WATCH_UI_WAIT');
  const before = await readLogPower(channelId, fetcher);
  const hourlyRewards = before.claims.filter(c => c.claimType === 'WATCH_1_HOUR');
  const reward = hourlyRewards.find(c => c.claimId === claimId);
  if (!before.active || !reward) throw failure('WATCH_ALREADY_UNAVAILABLE', 409);
  // The official button has no claim ID; a single eligible hourly reward is required to bind it.
  if (hourlyRewards.length !== 1) throw failure('POWER_WATCH_UI_WAIT');
  const doc = readyDocument();
  const button = doc && findWatchRewardButton(doc);
  if (!button) throw failure('POWER_WATCH_UI_WAIT');
  // Reserve the uncertainty boundary before dispatch; a thrown click may still act.
  clicked = true;
  try {
    button.click();
    for (let check = 0; check < 3; check++) {
      await wait(1000);
      // Never attribute a receipt after the owning document/channel is lost.
      if (!readyDocument()) throw failure('WATCH_UI_UNCONFIRMED');
      const after = await readLogPower(channelId, fetcher);
      const noLongerAvailable = !after.claims.some(c => c.claimId === claimId);
      const expected = Number.isSafeInteger(reward.amount) && reward.amount > 0 ? reward.amount : 1;
      if (after.active && noLongerAvailable && after.balance - before.balance >= expected) {
        return {channelId, claimId, claimType: 'WATCH_1_HOUR', kind: 'watch',
          confirmedAt: now(), amount: reward.amount, amountSource: reward.amount === null ? 'unknown' : 'offered-reward',
          httpStatus: null, applicationCode: null, collectionMethod: 'official-ui',
          confirmation: 'claim-and-balance', balanceBefore: before.balance, balanceAfter: after.balance};
      }
    }
  } catch (error) {
    // Even a failed follow-up GET does not prove that the click failed.
    throw failure('WATCH_UI_UNCONFIRMED');
  }
  throw failure('WATCH_UI_UNCONFIRMED');
}


// src/shared/power-page-agent.js
// Runs only in the normal logged-in CHZZK page. No cookies/tokens are extracted.
function createPagePowerAgent({isPlaying,getDocument,isEnabled,fetcher=fetch}) {
  const send=async(url,method='GET')=>fetcher(url,{method,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(8000)});
  return async function handle(request){
    const id=request.channelId;
    if(request.kind==='probe')return {build:POWER_BUILD,playing:/^[a-f0-9]{32}$/i.test(id||'')&&isPlaying(id)};
    let mutationDispatched=false;
    try{
      if(!/^[a-f0-9]{32}$/i.test(id||''))throw new Error('INVALID_CHANNEL');
      // Account identity is freshly verified even if playback stopped after PUT.
      // Balance and claim requests remain gated on the selected player's state.
      if(!(request.kind==='account'&&request.postMutationIdentity===true)&&!isPlaying(id))return {build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
      if(request.kind==='watch-ui'&&typeof request.claimId==='string'&&request.claimId.length>0&&request.claimId.length<=200){
        const receipt=await collectWatchUiReward({channelId:id,claimId:request.claimId,getDocument,isPlaying,isEnabled,fetcher});
        return {build:POWER_BUILD,kind:'confirmed',receipt};
      }
      const base=`https://api.chzzk.naver.com/service/v1/channels/${id}/log-power`;
      let url,method='GET';
      if(request.kind==='account')url='https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus';
      else if(request.kind==='balance')url=base;
      else if(request.kind==='claim'&&typeof request.claimId==='string'&&request.claimId.length>0&&request.claimId.length<=200){
        const check=await send(base);
        if(!check.ok)return {build:POWER_BUILD,status:check.status,body:'',phase:'eligibility',mutationDispatched:false,retryAfter:check.headers.get('Retry-After')||''};
        const data=await check.json();
        if(data?.code!==200||data.content?.active!==true||!Array.isArray(data.content.claims))throw new Error('INVALID_ELIGIBILITY');
        const claim=data.content.claims.find(c=>String(c?.claimId)===request.claimId&&c.state==='COMPLIED'&&c.saveType==='ACTIVE'&&Object.hasOwn(REWARD_TYPES,c.claimType));
        if(!claim)return {build:POWER_BUILD,status:409,body:'',phase:'eligibility',mutationDispatched:false};
        if(claim.claimType==='WATCH_1_HOUR')return {build:POWER_BUILD,status:422,error:'WATCH_UI_REQUIRED',mutationDispatched:false,phase:'eligibility',schema:true};
        if(!isPlaying(id))return {build:POWER_BUILD,status:0,error:'POWER_PLAYBACK_WAIT',mutationDispatched:false,phase:'eligibility'};
        url=`${base}/claims/${encodeURIComponent(request.claimId)}`;method='PUT';
      }else throw new Error('UNSUPPORTED_REQUEST');
      if(method==='PUT')mutationDispatched=true;
      const response=await send(url,method);let body=await response.text();
      if(body.length>262144)throw new Error('RESPONSE_TOO_LARGE');
      if(request.kind==='account'){if(response.ok){const data=JSON.parse(body);body=JSON.stringify({code:data?.code,content:{loggedIn:data?.content?.loggedIn,userIdHash:data?.content?.userIdHash}})}else body=''}
      return {build:POWER_BUILD,status:response.status,body,retryAfter:response.headers.get('Retry-After')||''};
    }catch(error){
      const dispatched=mutationDispatched||error.mutationDispatched===true;
      const safeCode=['POWER_WATCH_UI_WAIT','WATCH_UI_UNCONFIRMED','WATCH_ALREADY_UNAVAILABLE'].includes(error.code)?error.code:'POWER_TRANSPORT_FAILED';
      return {build:POWER_BUILD,status:Number.isInteger(error.status)?error.status:0,error:safeCode,
        mutationDispatched:dispatched,phase:dispatched?'mutation':'eligibility',
        httpStatus:error.httpStatus,applicationCode:error.applicationCode,
        retryAfterMs:Number.isFinite(error.retryAfterMs)&&error.retryAfterMs>=0?error.retryAfterMs:0,
        timeout:error?.name==='TimeoutError',schema:error.status==='schema'||['INVALID_CHANNEL','INVALID_ELIGIBILITY','UNSUPPORTED_REQUEST'].includes(error?.message)};
    }
  };
}


// src/viewer/floating-power-panel.js
// UI preferences only: never starts, stops, or otherwise controls the collector.
function attachFloatingPowerPanel({holder,root,section,heading,storage,win=window}) {
  const key='cheesemoa.power.panel.v1';
  // The multiview owns reserved layout space; docking changes presentation only.
  const floatingStyle=holder.style.cssText;
  let host=win.document.getElementById('cheesemoa-site-host');
  let docked=win.location.origin==='https://chzzk.naver.com'&&win.location.pathname==='/lives'&&win.location.hash==='#cheesemoa-multiview'&&!!host?.shadowRoot?.querySelector('slot[name="cheesemoa-power-dock"]');
  if(docked){
    holder.slot='cheesemoa-power-dock';holder.dataset.panelLayout='docked';
    holder.style.position='static';holder.style.inset='auto';holder.style.width='100%';holder.style.minWidth='0';holder.style.height='100%';
    host.append(holder);host.dataset.powerDocked='true';
  }
  const handle=win.document.createElement('button');handle.type='button';handle.className='panel-drag';
  handle.textContent='⠿ 패널 이동';handle.setAttribute('aria-label','자동수령 패널 이동');
  handle.title='드래그 또는 방향키로 이동 · Home으로 기본 위치';handle.hidden=docked;handle.disabled=docked;
  const help=win.document.createElement('span');help.id='panel-move-help';help.className='panel-sr';help.textContent='방향키로 이동, Shift와 방향키로 크게 이동, Home으로 기본 위치';handle.setAttribute('aria-describedby',help.id);
  const hide=win.document.createElement('button');hide.type='button';hide.textContent='패널 숨기기';hide.setAttribute('aria-expanded','true');
  const restore=win.document.createElement('button');restore.type='button';restore.textContent='🪵 자동수령 패널 표시';restore.hidden=true;restore.setAttribute('aria-expanded','true');
  section.id='power-panel-body';hide.setAttribute('aria-controls',section.id);restore.setAttribute('aria-controls',section.id);
  const toolbar=win.document.createElement('div');toolbar.className='panel-toolbar';toolbar.append(handle,hide,help);heading.after(toolbar);root.append(restore);
  const css=win.document.createElement('style');css.textContent='[hidden]{display:none!important}.panel-toolbar{display:flex;gap:4px;justify-content:space-between}.panel-drag{cursor:move;touch-action:none;user-select:none}.panel-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}section{max-height:calc(100dvh - 16px);overflow:auto}';root.append(css);
  if(docked){section.style.maxHeight='100%';section.style.boxSizing='border-box';section.style.overflow='auto';}
  holder.style.pointerEvents='none';section.style.pointerEvents='auto';restore.style.pointerEvents='auto';
  let position=null,hidden=false,drag=null,revision=0,writing=false,pending=null;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function clamp(x,y){const box=holder.getBoundingClientRect();return {x:Math.max(8,Math.min(x,Math.max(8,win.innerWidth-box.width-8))),y:Math.max(8,Math.min(y,Math.max(8,win.innerHeight-box.height-8)))}}
  function place(x,y){if(docked){position={x,y};return;}position=clamp(x,y);holder.style.left=position.x+'px';holder.style.top=position.y+'px';holder.style.right='auto';holder.style.bottom='auto'}
  async function flush(){
    if(writing)return;
    writing=true;
    try{
      while(pending){
        const value=pending;pending=null;
        try{await storage?.set?.({[key]:value})}catch{}
      }
    }finally{writing=false}
  }
  // Keep only the latest unsent preference while one storage write is in flight.
  function persist(){revision++;pending={hidden,position:position?{...position}:null};void flush()}
  function visibility(value,focus=false){hidden=value;section.hidden=hidden;restore.hidden=!hidden;hide.setAttribute('aria-expanded',String(!hidden));restore.setAttribute('aria-expanded',String(!hidden));if(position)place(position.x,position.y);if(focus)(hidden?restore:hide).focus()}
  hide.addEventListener('click',()=>{visibility(true,true);persist()});restore.addEventListener('click',()=>{visibility(false,true);persist()});
  handle.addEventListener('pointerdown',event=>{if(docked||event.button!==0)return;const box=holder.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top};revision++;handle.setPointerCapture?.(event.pointerId);event.preventDefault()});
  handle.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;place(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y)});
  function end(event){if(!drag||drag.id!==event.pointerId)return;drag=null;persist()}
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
  handle.addEventListener('keydown',event=>{if(docked)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(event.key==='Home'){position=null;holder.style.left='';holder.style.top='';holder.style.right='16px';holder.style.bottom='16px'}else if(delta){const box=holder.getBoundingClientRect(),step=event.shiftKey?40:10;place(box.left+delta[0]*step,box.top+delta[1]*step)}else return;event.preventDefault();persist()});
  function reclamp(){if(!docked&&position){const before={...position};place(position.x,position.y);if(position.x!==before.x||position.y!==before.y)persist()}}
  win.addEventListener('resize',reclamp);
  // Content/status text can resize the panel independently of the viewport.
  if(win.ResizeObserver)new win.ResizeObserver(reclamp).observe(holder);
  // Host lifecycle events rehome synchronously; the existing channel poll also catches SPA changes.
  function syncLayout(){
    const nextHost=win.document.getElementById('cheesemoa-site-host');
    const nextDocked=win.location.origin==='https://chzzk.naver.com'&&win.location.pathname==='/lives'&&win.location.hash==='#cheesemoa-multiview'&&!!nextHost?.shadowRoot?.querySelector('slot[name="cheesemoa-power-dock"]');
    if(nextDocked===docked&&(!docked||nextHost===host))return;
    if(host)delete host.dataset.powerDocked;
    docked=nextDocked;host=nextHost;handle.hidden=docked;handle.disabled=docked;drag=null;
    if(docked){
      holder.slot='cheesemoa-power-dock';holder.dataset.panelLayout='docked';
      holder.style.position='static';holder.style.inset='auto';holder.style.width='100%';holder.style.minWidth='0';holder.style.height='100%';
      section.style.maxHeight='100%';section.style.boxSizing='border-box';section.style.overflow='auto';
      host.append(holder);host.dataset.powerDocked='true';
    }else{
      holder.removeAttribute('slot');delete holder.dataset.panelLayout;holder.style.cssText=floatingStyle;holder.style.pointerEvents='none';
      section.style.maxHeight='';section.style.boxSizing='';section.style.overflow='';
      win.document.documentElement.append(holder);if(position)place(position.x,position.y);
    }
  }
  win.addEventListener('cheesemoa-power-layout-change',syncLayout);
  const initialRevision=revision;
  Promise.resolve().then(()=>storage?.get?.(key)).then(data=>{if(revision!==initialRevision)return;const value=data?.[key];if(!value||typeof value!=='object')return;visibility(value.hidden===true);if(finite(value.position?.x)&&finite(value.position?.y))place(value.position.x,value.position.y)}).catch(()=>{});
  return syncLayout;
}


// src/viewer/power-receipt-panel.js
// Display only the result of the existing collection flow. No storage/network reads.
function attachPowerReceiptPanel({section,document}) {
  const receipt=document.createElement('p');receipt.className='power-receipt';
  receipt.setAttribute('aria-live','polite');
  receipt.textContent='이 페이지에서 확인한 서버 수령 영수증 없음 · 이전 기록은 확장 팝업에서 확인';
  section.append(receipt);
  let latest=-Infinity;
  return {update(value,channelName) {
    const r=value.result?.latestReceipt;
    const ui=r?.collectionMethod==='official-ui'&&r.confirmation==='claim-and-balance'&&
      Number.isSafeInteger(r.balanceBefore)&&r.balanceBefore>=0&&Number.isSafeInteger(r.balanceAfter)&&r.balanceAfter>r.balanceBefore;
    if (!value.result?.collected || !r || !Number.isFinite(r.confirmedAt) ||
        r.confirmedAt < latest || (!ui&&![200,201,204,205].includes(r.httpStatus)) ||
        (r.applicationCode !== null && r.applicationCode !== 200)) return;
    latest=r.confirmedAt;
    const amount=Number.isSafeInteger(r.amount)&&r.amount>=0?`제공 보상량 +${r.amount}`:'제공 보상량 미확인';
    receipt.textContent=ui?`이 페이지의 최근 서버 수령 확인 · ${channelName} · ${new Date(r.confirmedAt).toLocaleString('ko-KR')} (로컬 확인 시각) · ${amount} · 공식 받기 UI 후 해당 보상 상태·보유량 재조회 확인 (${r.balanceBefore} → ${r.balanceAfter}). 현재 실시간 잔액은 별도입니다.`:
      `이 페이지의 최근 서버 수령 확인 · ${channelName} · ${new Date(r.confirmedAt).toLocaleString('ko-KR')} (로컬 확인 시각) · ${amount} · HTTP ${r.httpStatus} / 응답 코드 ${r.applicationCode??'본문 없음'}. 저장된 영수증 기준이며 현재 계정·잔액 또는 공식 받기 버튼의 갱신을 뜻하지 않습니다.`;
  }};
}


// src/viewer/power-page-entry.js
// Bundled with the exact shared session/owner/adapter code by build-power-page.mjs.
if(window===window.top&&location.origin==='https://chzzk.naver.com'&&
 (/^\/live\/[a-f0-9]{32}$/i.test(location.pathname)||(location.pathname==='/lives'&&location.hash==='#cheesemoa-multiview'))){
 const id='cheesemoa-power-control';
 if(!document.getElementById(id)){
  let direct=location.pathname.match(/^\/live\/([a-f0-9]{32})$/i)?.[1];
  const holder=document.createElement('aside');holder.id=id;holder.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px))';
  const root=holder.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=':host{font:13px/1.5 system-ui;color:#eff6ff}section{background:#102a40;border:1px solid #b7cddd;border-radius:12px;padding:12px;box-shadow:0 4px 18px #0005}h2{font-size:15px;margin:0 0 6px}p{margin:6px 0}button,select{font:inherit;padding:6px;border-radius:6px;margin:3px;border:1px solid #8196a9}button:focus-visible,select:focus-visible{outline:3px solid #ffcc40}button:disabled{opacity:.5}select{max-width:100%}';root.append(style);
  const section=document.createElement('section');root.append(section);
  const heading=document.createElement('h2');heading.textContent='🪵 치즈모아 자동수령';section.append(heading);
  const build=document.createElement('small');build.textContent=POWER_BUILD;section.append(build);
  const label=document.createElement('label');label.textContent='수집할 방송 ';const select=document.createElement('select');select.setAttribute('aria-label','자동수령 주 채널');label.append(select);section.append(label);
  const on=document.createElement('button');on.textContent='자동수령 ON';const off=document.createElement('button');off.textContent='자동수령 OFF';section.append(on,off);
  const state=document.createElement('p');state.setAttribute('role','status');state.setAttribute('aria-live','polite');section.append(state);
  const detail=document.createElement('p');section.append(detail);
  const counts=document.createElement('p');counts.textContent='이 실행의 확정 수령 0건 · 최근 조회 없음';section.append(counts);
  const receiptPanel=attachPowerReceiptPanel({section,document});
  let syncPanelLayout=()=>{};
  let enabled=false,confirmed=0,lastCheck=null,poll,restoredForChoices=false;
  function frames(){return [...(document.querySelector('#cheesemoa-site-host')?.shadowRoot?.querySelectorAll('iframe')||[])]}
  function playing(channel){try{const doc=location.pathname===`/live/${channel}`?document:frames().find(f=>f.src===`https://chzzk.naver.com/live/${channel}`)?.contentDocument;return !!doc&&[...doc.querySelectorAll('video,audio')].some(v=>!v.paused&&v.readyState>=2)}catch{return false}}
  function syncChannels(){
   syncPanelLayout();
   const currentDirect=location.pathname.match(/^\/live\/([a-f0-9]{32})$/i)?.[1];
   if(currentDirect!==direct){void owner.stop();direct=currentDirect;restoredForChoices=true;}
   const choices=direct?[{id:direct,name:`현재 방송 (${direct.slice(0,8)}…)`}]:frames().map(f=>({id:f.src.match(/\/live\/([a-f0-9]{32})$/i)?.[1],name:f.title})).filter(c=>c.id);
   const current=select.value;
   if(enabled){if(!choices.some(c=>c.id===current))void owner.stop();return;}
   select.replaceChildren();for(const c of choices){const option=document.createElement('option');option.value=c.id;option.textContent=c.name;select.append(option)}
   if(choices.some(c=>c.id===current))select.value=current;
   on.disabled=!choices.length;
   if(!choices.length){state.textContent='OFF · 먼저 멀티뷰에서 방송을 시작하세요.';off.disabled=true}
   if(choices.length&&!restoredForChoices){restoredForChoices=true;void owner.restore()}
  }
  function message(value){return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Object.assign(new Error('수집 실행 응답이 지연되어 중단했습니다. 수령 결과는 기록 확인이 필요합니다.'),{name:'TimeoutError',method:value.action==='collect'?'PUT':'GET',retryable:false})),90000);
   Promise.resolve(chrome.runtime.sendMessage(value)).then(resolve,reject).finally(()=>clearTimeout(timer));
  })}
  const owner=createPagePowerOwner({send:message,getChannelId:()=>select.value,onState(value){
   enabled=value.enabled===true;select.disabled=enabled;on.disabled=enabled||!select.value;off.disabled=!enabled&&!value.canStop;
   const names={'watch-ui-wait':'공식 받기 버튼 대기','playback-wait':'재생 대기',checking:'확인 중',checked:'응답 확인',inactive:'보상 비활성',blocked:'이전 미확인 보상 보존',waiting:'재조회 대기',error:'중단',off:'꺼짐','auth-required':'로그인 확인 필요',connecting:'시작 연결 중'};
   state.textContent=`${enabled?'ON':'OFF'} · ${names[value.status]||'상태 확인 중'}`;detail.textContent=value.detail||'서버의 적격 보상만 확인합니다.';
   if(['checked','blocked','inactive'].includes(value.status))lastCheck=Date.now();
   confirmed+=value.result?.collected||0;
   receiptPanel.update(value,select.selectedOptions[0]?.textContent||'선택 방송');
   counts.textContent=`이 실행의 확정 수령 ${confirmed}건 · 최근 조회 ${lastCheck?new Date(lastCheck).toLocaleTimeString('ko-KR'):'없음'}${['waiting','error','auth-required'].includes(value.status)?' · 최신 조회 미확인':''}`;
  }});
  const agent=createPagePowerAgent({isPlaying:playing,isEnabled:channel=>enabled&&select.value===channel,
   getDocument:channel=>{try{return location.pathname===`/live/${channel}`?document:frames().find(f=>f.src===`https://chzzk.naver.com/live/${channel}`)?.contentDocument}catch{return null}}});
  const listener=(message,sender,respond)=>{
   if(sender.id!==chrome.runtime.id||(sender.url&&!sender.url.startsWith(chrome.runtime.getURL(''))))return;
   if(message?.type==='cheesemoa-owner-state'){owner.deactivate(message.epoch);return;}
   if(message?.type!=='cheesemoa-page-network')return;
   void agent(message).then(respond);return true;
  };
  let connected=false;
  function connect(){if(connected)return;connected=true;chrome.runtime.onMessage.addListener(listener);poll=setInterval(syncChannels,1000)}
  function disconnect(){if(!connected)return;connected=false;clearInterval(poll);chrome.runtime.onMessage.removeListener(listener);restoredForChoices=false;owner.suspend()}
  on.addEventListener('click',()=>void owner.start());off.addEventListener('click',()=>void owner.stop({remember:true}));select.addEventListener('change',()=>void owner.stop());
  document.documentElement.append(holder);
  syncPanelLayout=attachFloatingPowerPanel({holder,root,section,heading,storage:chrome.storage?.local})||(()=>{});
  connect();syncChannels();
  // Discover player starts without restarting or changing any existing player.
  const observer=new MutationObserver(()=>syncChannels());const host=document.querySelector('#cheesemoa-site-host')?.shadowRoot;if(host)observer.observe(host,{childList:true,subtree:true});
  window.addEventListener('pagehide',disconnect);window.addEventListener('pageshow',event=>{if(event.persisted){connect();syncChannels()}});
 }
}

})();
