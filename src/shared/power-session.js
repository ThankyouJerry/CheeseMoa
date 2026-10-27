// Diagnostic text contains fixed labels and bounded numeric counts only.
export function describePowerDiagnostics(d) {
  if (!d || !Number.isSafeInteger(d.received) || d.received < 0) return "보상 응답 항목 수 미확인";
  const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  if (d.received === 0) return "서버 보상 목록 0건 (빈 응답 목록)";
  const labels = {invalidEntry:"항목 형식 오류",invalidId:"보상 식별값 형식 오류",unsupportedType:"미지원 종류",notReady:"준비 상태 미충족",inactiveSave:"수령 활성 상태 미충족"};
  const reasons = Object.entries(labels).filter(([key])=>count(d.reasons?.[key])>0).map(([key,label])=>`${label} ${count(d.reasons[key])}건`).join(", ");
  return `서버 보상 목록 ${d.received}건 · 지원 적격 ${count(d.eligible)}건 · 제외 ${count(d.excluded)}건${reasons?` (${reasons})`:""} · 적격 중 이전 처리 기록 ${count(d.alreadyHandled)}건`;
}
// Session-only opt-in; only explicitly enabled GET checks are retried.
export function createPowerSession({ collector, getChannels, checkAccount, onStatus,
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
