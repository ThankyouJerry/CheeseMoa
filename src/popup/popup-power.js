import {POWER_BUILD} from "../shared/power-build.js";
import {createPowerCollector} from '../shared/power-collector.js';
import {checkPowerAccount} from '../shared/login-session.js';
import {REWARD_TYPES} from '../shared/log-power.js';
import {summarizePower, formatPowerSummary, formatPowerDiagnostic} from '../shared/power-summary.js';

export function bindPopupPower(getChannels) {
  document.querySelector("#popup-power-build").textContent = `조회 UI ${POWER_BUILD} · 열린 수집기는 별도 버전일 수 있습니다. 수집기 하단에서 실행 버전을 확인하세요.`;
  const status = document.querySelector('#popup-power-status');
  const total = document.querySelector('#popup-power-total');
  const balances = document.querySelector('#popup-power-balances');
  const historyList = document.querySelector('#popup-power-history');
  const refreshButton = document.querySelector('#popup-power-refresh');
  const collector = globalThis.chrome?.storage?.local && globalThis.navigator?.locks ?
    createPowerCollector({storage: chrome.storage.local, locks: navigator.locks}) : null;
  let generation = 0;
  function row(target, heading, detail) {
    const li = document.createElement('li');
    const title = document.createElement('strong'); title.textContent = heading;
    const text = document.createElement('span'); text.textContent = detail;
    li.append(title, text); target.append(li);
  }
  async function refresh() {
    const current = ++generation;
    status.textContent = '현재 계정과 저장 기록 확인 중…';
    total.textContent = '확인 중';
    balances.replaceChildren(); historyList.replaceChildren();
    refreshButton.disabled = true;
    try {
      if (!collector) throw new Error('extension');
      const account = await checkPowerAccount();
      if (!account) throw new Error('account');
      const history = await collector.history(account);
      if (await checkPowerAccount() !== account) throw new Error('account changed');
      if (current !== generation) return;
      const names = new Map(getChannels().map(c => [c.resourceId, c.streamerName || c.name || c.resourceId]));
      total.textContent = formatPowerSummary(summarizePower(history));
      status.textContent = '현재 계정의 저장 기록 · 실시간 보유량은 수집기가 조회할 때 갱신됩니다.';
      for (const b of [...(history.balances || [])].sort((a,b) => b.checkedAt-a.checkedAt)) {
        row(balances, names.get(b.channelId) || b.channelId,
          `보유 ${b.amount.toLocaleString('ko-KR')} · 마지막 조회 ${new Date(b.checkedAt).toLocaleString('ko-KR')}${b.beforeCollection ? ' · 수령 후 잔액 미확인' : ''}`);
      }
      if (!balances.children.length) row(balances, '보유량 미확인', '뷰어에서 주 채널을 선택하고 자동 수령을 켜면 조회합니다.');
      const rows = [
        ...history.receipts.map(r => ({...r,time:r.confirmedAt,label:`${r.accountId ? '' : '이전 계정 미구분 · 합계 제외 · '}${REWARD_TYPES[r.claimType] || '보상'} 수령 확인 · ${r.amount === null || r.amount === undefined ? '금액 미확인' : `+${r.amount} (제공 보상량)`}`})),
        ...history.attempts.filter(r => r.status !== 'confirmed').map(r => ({...r,time:r.attemptedAt,label:r.status === 'already-claimed' ? '이미 처리된 보상 · 성공 합계 제외' : '수령 여부 미확인 · 자동 재전송 안 함'})),
      ].sort((a,b) => b.time-a.time);
      for (const r of rows.slice(0,20)) row(historyList, names.get(r.channelId) || r.channelId, `${new Date(r.time).toLocaleString('ko-KR')} · ${r.label} · ${REWARD_TYPES[r.claimType] || "보상 종류 미기록"} · ${formatPowerDiagnostic(r)}`);
      if (!rows.length) row(historyList, '수령 기록 0건', '이 확장이 확인한 수령 내역이 없습니다. 과거 획득량은 추정하지 않습니다.');
      if (rows.length > 20) row(historyList, `최근 20건 표시 / 저장 ${rows.length}건`, '전체 기록은 뷰어의 모은 통나무 버튼에서 확인하세요.');
    } catch {
      if (current !== generation) return;
      total.textContent = '미확인'; balances.replaceChildren(); historyList.replaceChildren();
      status.textContent = '계정 또는 기록 조회 실패 · 0건으로 집계하지 않았습니다. 로그인 후 다시 확인하세요.';
    } finally {if (current === generation) refreshButton.disabled = false;}
  }
  refreshButton.addEventListener('click', refresh);
  void refresh();
}
