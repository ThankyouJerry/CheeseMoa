// Display only the result of the existing collection flow. No storage/network reads.
export function attachPowerReceiptPanel({section,document}) {
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
