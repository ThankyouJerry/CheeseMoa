// Only durable, account-attributed successful receipts contribute to totals.
// Balance changes are deliberately never used to infer earnings.
export function summarizePower(history, {channelId = '', since = 0} = {}) {
  const seen = new Set();
  const receipts = (history.receipts || []).filter(r => {
    if (!r.accountId || !r.channelId || !r.claimId || !Number.isFinite(r.confirmedAt) ||
        r.confirmedAt < since || (channelId && r.channelId !== channelId)) return false;
    const key = JSON.stringify([r.accountId, r.channelId, r.claimId]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return {count: receipts.length,
    amount: receipts.reduce((sum, r) => sum + (Number.isSafeInteger(r.amount) && r.amount >= 0 ? r.amount : 0), 0),
    unknown: receipts.filter(r => !Number.isSafeInteger(r.amount) || r.amount < 0).length};
}
export function formatPowerSummary(summary) {
  return `${summary.amount.toLocaleString('ko-KR')} 파워 · ${summary.count.toLocaleString('ko-KR')}건${summary.unknown ? ` · 이 중 ${summary.unknown}건 금액 미확인` : ''}`;
}

export function formatPowerDiagnostic(row) {
  if(row.collectionMethod==='official-ui'&&row.confirmation==='claim-and-balance')
    return `공식 받기 UI · 해당 보상 상태·보유량 재조회 확인 · 요청 실행 ${/^power-\d{8}\.\d+$/.test(row.build||'')?row.build:'미기록'}`;
  const http = Number.isInteger(row.httpStatus) ? row.httpStatus : "미기록";
  const code = typeof row.applicationCode === "number" ? row.applicationCode :
    ["FORBIDDEN","UNAUTHORIZED","NOT_FOUND","CONFLICT","BAD_REQUEST","TOO_MANY_REQUESTS","INTERNAL_SERVER_ERROR"].includes(row.applicationCode) ? row.applicationCode : "미기록";
  const error = ["WATCH_UI_UNCONFIRMED","POWER_WATCH_UI_WAIT","PREFLIGHT_FAILED","HTTP_ERROR","APPLICATION_ERROR","INVALID_JSON","BODY_READ_ERROR","NETWORK_ERROR","TIMEOUT","PENDING_OR_UNEXPECTED_STATUS","UNKNOWN_ENVELOPE","EMPTY_GET_RESPONSE","REQUEST_FAILED"].includes(row.errorCode) ? row.errorCode : "";
  const build = /^power-\d{8}\.\d+$/.test(row.build || "") ? row.build : "미기록";
  return `HTTP ${http} · 응답 코드 ${code}${error ? ` · ${error}` : ""} · 요청 실행 ${build}`;
}
