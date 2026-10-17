import { summarizePower, formatPowerSummary, formatPowerDiagnostic } from "../shared/power-summary.js";
import { POWER_BUILD } from "../shared/power-build.js";
import { REWARD_TYPES } from "../shared/log-power.js";
import { createPowerCollector } from "../shared/power-collector.js";
import { checkPowerAccount } from "../shared/login-session.js";

export function bindPowerPanel(getChannels) {
  const button = document.querySelector("#power-button");
  document.querySelector("#power-build").textContent = `수령 모듈 ${POWER_BUILD}`;
  const dialog = document.querySelector("#power-dialog");
  const mainChannel = document.querySelector("#power-main-channel");
  const selectedChannels = () => getChannels().filter(c => c.type === "live" && c.id === mainChannel.value);
  const toggle = document.querySelector("#power-enabled");
  const status = document.querySelector("#power-status");
  const list = document.querySelector("#power-history");
  const balanceLabel = document.querySelector("#power-balance");
  const filter = document.querySelector("#power-filter");
  let state = {receipts: [], attempts: [], balances: []};
  const openedAt = Date.now();
  let historyVerified = false;
  let hasSessionError = false;
  let refreshSequence = 0;
  let disposed = false;
  const storage = globalThis.chrome?.storage?.local;
  const locks = globalThis.navigator?.locks;
  const collector = storage && locks ? createPowerCollector({storage, locks}) : null;

  function option(text, value) {
    const element = document.createElement("option");
    element.textContent = text;
    element.value = value;
    return element;
  }

  function render() {
    const names = new Map(getChannels().map(c => [c.resourceId, c.streamerName || c.name || c.resourceId]));
    const selectedChannel = selectedChannels()[0];
    const balance = state.balances?.find(b => b.channelId === selectedChannel?.resourceId);
    balanceLabel.textContent = balance ? `통나무파워 보유량: ${balance.amount.toLocaleString("ko-KR")} · ${new Date(balance.checkedAt).toLocaleString("ko-KR")} 조회${balance.beforeCollection ? " · 수령 전 값 (수령 후 보유량 미확인)" : ""}` :
      "통나무파워 보유량: 아직 확인하지 않았습니다. 주 채널을 선택하고 자동 획득을 켜면 조회합니다.";
    const summaryOptions = {channelId: selectedChannel?.resourceId || ""};
    document.querySelector("#power-total").textContent = historyVerified ? formatPowerSummary(summarizePower(state, summaryOptions)) : "미확인";
    document.querySelector("#power-session-total").textContent = !selectedChannel ? "주 채널을 선택하세요" : historyVerified ? formatPowerSummary(summarizePower(state, {...summaryOptions, since: openedAt})) : "미확인";
    document.querySelector("#power-summary-scope").textContent = `${selectedChannel ? (selectedChannel.streamerName || selectedChannel.name || selectedChannel.resourceId) : "모든 채널"} · 현재 계정 · 최근 저장 1,000건 기준 · 삭제·한도 이전 및 계정 미구분 기록 제외${hasSessionError ? " · 최근 조회 오류, 마지막 저장값" : ""}`;
    const lastUnconfirmed = state.attempts.filter(r => r.status === "unconfirmed" && (!selectedChannel || r.channelId === selectedChannel.resourceId)).sort((a,b)=>b.attemptedAt-a.attemptedAt)[0];
    if (lastUnconfirmed) document.querySelector("#power-summary-scope").textContent += ` · 최근 미확인 요청 ${new Date(lastUnconfirmed.attemptedAt).toLocaleTimeString("ko-KR")} · ${formatPowerDiagnostic(lastUnconfirmed)} · ON은 조회 동작이며 수령 성공 표시가 아닙니다`;
    if (!historyVerified) balanceLabel.textContent = "통나무파워 보유량: 미확인 · 계정 또는 기록을 확인하지 못했습니다.";
    const selected = filter.value;
    filter.replaceChildren(option("모든 채널", ""));
    const ids = new Set([...state.receipts, ...state.attempts].map(r => r.channelId));
    for (const id of ids) filter.add(option(names.get(id) || id, id));
    filter.value = ids.has(selected) ? selected : "";
    const rows = [
      ...state.receipts.map(r => ({...r, time: r.confirmedAt, label:
        `${r.accountId ? "" : "이전 계정 미구분 기록 · "}${REWARD_TYPES[r.claimType] || "시청"} 보상 획득 확인 · ${r.amount === null ? "획득량 미확인" : `+${r.amount} (제공 보상량)`}`})),
      ...state.attempts.filter(r => r.status !== "confirmed").map(r => ({...r, time: r.attemptedAt,
        label: `${r.accountId ? "" : "이전 계정 미구분 기록 · "}${r.status === "already-claimed" ?
          "이미 처리된 보상 · 이 앱의 획득 성공 기록 아님" : "수령 여부 미확인 · 자동 재시도하지 않음"}`})),
    ].filter(r => !filter.value || r.channelId === filter.value).sort((a, b) => b.time - a.time);
    list.replaceChildren();
    for (const row of rows) {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = names.get(row.channelId) || row.channelId;
      const detail = document.createElement("span");
      detail.textContent = `${new Date(row.time).toLocaleString("ko-KR")} · ${row.label} · ${REWARD_TYPES[row.claimType] || "보상 종류 미기록"} · ${formatPowerDiagnostic(row)}${Number.isSafeInteger(row.balanceAfter) ? ` · 수령 후 조회 보유량 ${row.balanceAfter.toLocaleString("ko-KR")}` : ""}`;
      item.append(name, detail);
      list.append(item);
    }
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.textContent = historyVerified ? "기록이 없습니다. 수령 기록 0건 · 기능을 켠 이후 확인된 요청부터 표시됩니다." : "기록 조회 미확인 · 0건으로 집계하지 않았습니다.";
      list.append(empty);
    }
  }
  async function refresh() {
    if (!collector || disposed) return;
    const sequence = ++refreshSequence;
    try {
      const accountId = await checkPowerAccount();
      if (!accountId) throw new Error("logged out");
      const history = await collector.history(accountId);
      if (disposed || sequence !== refreshSequence) return;
      if (await checkPowerAccount() !== accountId) throw new Error("account changed");
      if (sequence === refreshSequence) { state = history; historyVerified = true; render(); }
    } catch {
      if (sequence !== refreshSequence) return;
      historyVerified = false;
      state = {receipts: [], attempts: [], balances: []};
      render();
      if (!hasSessionError) status.textContent = "계정 또는 로컬 이력을 확인하지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해주세요.";
    }
  }
  // Collection belongs to the normal broadcast page; this document only reads history.
  const session = null, transport = null;
  let unsubscribeHints = null;
  toggle.disabled=true;
  status.textContent="방송 화면의 ‘치즈모아 자동수령’에서 ON/OFF를 조작하세요. 이 관리 창은 수령 기록만 조회합니다.";
  function refreshMainChannels() {
    const selected = mainChannel.value;
    mainChannel.replaceChildren(option("주 채널을 선택하세요", ""));
    for (const channel of getChannels().filter(c => c.type === "live")) {
      mainChannel.add(option(channel.streamerName || channel.name || channel.resourceId, channel.id));
    }
    mainChannel.value = [...mainChannel.options].some(o => o.value === selected) ? selected : "";
    toggle.disabled = true;
    if (toggle.disabled) session?.stop();
  }
  mainChannel.addEventListener("change", () => {
    session?.stop();
    toggle.disabled = true;
    status.textContent = "주 채널을 변경했습니다. 자동 획득은 직접 다시 켜주세요.";
    render();
  });
  button.addEventListener("click", () => { refreshMainChannels(); dialog.showModal(); void refresh(); });
  document.querySelector("#power-close").addEventListener("click", () => dialog.close());
  document.querySelector("#power-refresh").addEventListener("click", refresh);
  filter.addEventListener("change", render);
  toggle.addEventListener("change", () => {
    toggle.checked=false;
    status.textContent="자동수령은 방송 화면에서 시작하세요. 관리 창에서는 시작하지 않습니다.";
  });
  document.querySelector("#power-clear").addEventListener("click", async () => {
    if (!collector || !window.confirm("현재 계정과 이전 계정 미구분 성공 내역을 지울까요? 중복 방지 및 미확인 요청 기록은 남습니다.")) return;
    try {
      const accountId = await checkPowerAccount();
      if (!accountId) throw new Error("logged out");
      await collector.clearHistory(accountId);
      await refresh();
    }
    catch { status.textContent = "이력을 삭제하지 못했습니다."; }
  });
  window.addEventListener("pagehide", () => {
    disposed = true; refreshSequence++; session?.stop(); unsubscribeHints?.(); unsubscribeHints=null; transport?.reset();
  });
  window.addEventListener("pageshow", () => {
    if (!disposed) return;
    disposed=false; refreshSequence++; transport?.reset();
    unsubscribeHints=transport?.subscribe(()=>session?.checkNow());
    toggle.checked=false; hasSessionError=true;
    button.textContent="🪵 모은 통나무 · 보유량·이력";
    status.textContent="페이지가 복원되었습니다. 자동 획득은 OFF입니다. 주 채널과 방송을 확인한 뒤 직접 다시 켜주세요.";
    render();
  });
  if (!collector) {
    toggle.disabled = true;
    status.textContent = "설치된 치즈모아 확장 프로그램에서만 사용할 수 있습니다.";
  }
}
