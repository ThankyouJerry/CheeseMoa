import {readLogPower} from './log-power.js';

// Only the official hourly reward in the selected channel's chat may be clicked.
// No claim PUT, header changes, cookie access or guessed completion timestamps.
export function findWatchRewardButton(doc) {
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

export async function collectWatchUiReward({channelId, claimId, getDocument, isPlaying,
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
  const reward = before.claims.find(c => c.claimId === claimId && c.claimType === 'WATCH_1_HOUR');
  if (!before.active || !reward) throw failure('WATCH_ALREADY_UNAVAILABLE', 409);
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
