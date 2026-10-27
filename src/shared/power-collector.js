import { POWER_BUILD } from "./power-build.js";
import { readLogPower, claimAvailableReward } from "./log-power.js";

export const POWER_STORAGE_KEY = "cheesemoa.power.v1";
const LOCK = "cheesemoa.power";
const MAX_RECEIPTS = 1000;
const MAX_ATTEMPTS = 2000;
const accountIsValid = id => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);

// All extension documents use the same origin-scoped lock, including history deletion.
export function createPowerCollector({ storage, locks, fetcher = fetch, watchCollector, now = Date.now, schedule = setTimeout, cancel = clearTimeout, lockWaitMs = 15000 }) {
  // Abort only acquisition. Never release an acquired lock while a claim is running.
  async function withLock(work, signal) {
    const controller = new AbortController();
    let acquired = false, timedOut = false;
    const abortWaiting = () => { if (!acquired) controller.abort(); };
    signal?.addEventListener("abort", abortWaiting, {once: true});
    if (signal?.aborted) abortWaiting();
    const timer = schedule(() => { if (!acquired) { timedOut = true; controller.abort(); } }, lockWaitMs);
    try {
      return await locks.request(LOCK, {signal: controller.signal}, async () => {
        acquired = true; cancel(timer);
        signal?.removeEventListener("abort", abortWaiting);
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        return work();
      });
    } catch (error) {
      if (timedOut) throw Object.assign(new Error("다른 창의 보상 처리가 끝나기를 기다리다 중단했습니다. 잠시 후 직접 다시 켜주세요."), {code: "POWER_LOCK_TIMEOUT"});
      throw error;
    } finally { cancel(timer); signal?.removeEventListener("abort", abortWaiting); }
  }
  async function read() {
    const value = (await storage.get(POWER_STORAGE_KEY))[POWER_STORAGE_KEY];
    if (value === undefined) return { version: 1, receipts: [], attempts: [], balances: [] };
    if (value?.version !== 1 || !Array.isArray(value.receipts) || !Array.isArray(value.attempts) ||
        value.receipts.length > MAX_RECEIPTS || value.attempts.length > MAX_ATTEMPTS ||
        (value.balances !== undefined && (!Array.isArray(value.balances) || value.balances.length > 1000 ||
          value.balances.some(item => !item || !accountIsValid(item.accountId) ||
            !/^[a-f0-9]{32}$/i.test(item.channelId) || !Number.isSafeInteger(item.amount) || item.amount < 0 ||
            !Number.isFinite(item.checkedAt)))) ||
        value.attempts.some(item => !item || typeof item.key !== "string" ||
          (item.accountId !== undefined && !accountIsValid(item.accountId))) ||
        value.receipts.some(item => !item ||
          (item.accountId !== undefined && !accountIsValid(item.accountId)))) {
      throw new Error("획득 기록 형식을 확인할 수 없어 자동 획득을 중단했습니다.");
    }
    value.balances ??= [];
    return value;
  }
  const save = state => storage.set({ [POWER_STORAGE_KEY]: state });
  const keyFor = (accountId, channelId, claimId) => JSON.stringify([accountId, channelId, claimId]);
  // v1 entries have no account identity. Keep their guards across every account;
  // assigning them to a newly detected account could allow a duplicate claim.
  const legacyKeyFor = (channelId, claimId) => JSON.stringify([channelId, claimId]);
  function requireAccount(accountId) {
    if (!accountIsValid(accountId)) throw new Error("계정 식별 정보를 확인하지 못해 자동 획득을 중단했습니다.");
  }

  return {
    history: accountId => withLock(async () => {
      requireAccount(accountId);
      const state = await read();
      return {
        version: state.version,
        balances: state.balances.filter(item => item.accountId === accountId),
        receipts: state.receipts.filter(item => item.accountId === accountId || !item.accountId),
        attempts: state.attempts.filter(item => item.accountId === accountId || !item.accountId),
      };
    }),
    clearHistory: accountId => withLock(async () => {
      requireAccount(accountId);
      const state = await read();
      state.receipts = state.receipts.filter(item => item.accountId && item.accountId !== accountId);
      // Preserve deduplication and uncertain requests: deleting UI history must not re-claim.
      await save(state);
    }),
    collect: (channelId, { enabled = false, accountId, isCurrent = () => true,
      isSameAccount = () => true, signal } = {}) => withLock(async () => {
      if (!enabled) return { status: "disabled", collected: 0 };
      requireAccount(accountId);
      if (!await isCurrent()) return { status: "disabled", collected: 0 };
      const state = await read();
      const power = await readLogPower(channelId, fetcher);
      if (!await isCurrent()) return {status: "disabled", collected: 0};
      const snapshot = (value, beforeCollection = false) => {
        const item = {accountId, channelId, amount: value.balance, checkedAt: now(), beforeCollection};
        state.balances = state.balances.filter(b => b.accountId !== accountId || b.channelId !== channelId);
        state.balances.push(item);
        state.balances = state.balances.slice(-1000);
        return item;
      };
      snapshot(power);
      const diagnostics = {...power.diagnostics, alreadyHandled: 0};
      if (!power.active) {
        await save(state);
        return {status: "inactive", collected: 0, balance: power.balance, channelId, diagnostics};
      }
      let collected = 0, blocked = 0, latestReceipt;
      const resultWithReceipt = result => latestReceipt ? {...result, latestReceipt} : result;
      try {
      for (const reward of power.claims) {
        if (!await isCurrent()) return resultWithReceipt({ status: "disabled", collected });
        const key = keyFor(accountId, channelId, reward.claimId);
        const legacyKey = legacyKeyFor(channelId, reward.claimId);
        const previous = state.attempts.find(item => item.key === key || item.key === legacyKey);
        if (previous) { diagnostics.alreadyHandled++; if (previous.status !== "confirmed" && previous.status !== "already-claimed") blocked++; continue; }
        if (state.attempts.length >= MAX_ATTEMPTS) {
          throw Object.assign(new Error("중복 방지 기록 한도에 도달하여 자동 획득을 중단했습니다."), {code: "POWER_ATTEMPT_LIMIT"});
        }
        const attempt = { key, accountId, channelId, claimId: reward.claimId, status: "pending", attemptedAt: now(), claimType: reward.claimType, build: POWER_BUILD };
        state.attempts.push(attempt);
        snapshot(power, true);
        await save(state); // A failed write must prevent the remote mutation.
        // This reservation is ours and no mutation has been dispatched yet.
        const removeUnsent = async () => {
          state.attempts = state.attempts.filter(item => item !== attempt);
          await save(state);
        };
        let current;
        try { current = await isCurrent(); }
        catch (error) { await removeUnsent(); throw error; }
        if (!current) {
          await removeUnsent();
          return resultWithReceipt({ status: "disabled", collected });
        }
        let receipt;
        try {
          if (reward.claimType === 'WATCH_1_HOUR') {
            if (!watchCollector) throw Object.assign(new Error('공식 보상 UI 연결을 기다립니다.'),
              {code:'POWER_WATCH_UI_WAIT', method:'GET', status:0, retryable:true, mutationDispatched:false});
            receipt = await watchCollector(channelId, reward);
          } else receipt = await claimAvailableReward(channelId, reward, fetcher, now);
        } catch (error) {
          if (error.status === 409) {
            // A conflict is not our receipt. Keep a durable guard for this reward
            // and check other rewards without resending the conflicting claim.
            attempt.status = "already-claimed";
            attempt.failedAt = now();
            attempt.httpStatus = Number.isInteger(error.httpStatus) ? error.httpStatus : null;
            attempt.applicationCode = error.applicationCode ?? null;
            attempt.errorCode = error.errorCode || "REQUEST_FAILED";
            await save(state);
            diagnostics.alreadyHandled++;
            continue;
          }
          if (error.mutationDispatched === false) {
            await removeUnsent();
            throw error;
          }
          // A timeout may follow a successful server mutation; never guess or retry blindly.
          attempt.status = "unconfirmed";
          attempt.failedAt = now();
          attempt.httpStatus = Number.isInteger(error.httpStatus) ? error.httpStatus : null;
          attempt.applicationCode = error.applicationCode ?? null;
          attempt.errorCode = error.errorCode || "REQUEST_FAILED";
          await save(state);
          throw error;
        }
        let sameAccount = false;
        try { sameAccount = await isSameAccount(); } catch { /* Unknown identity is not confirmation. */ }
        if (!sameAccount) {
          // The server may have accepted the request during an account switch.
          // Preserve the guard without attributing the receipt to either account.
          attempt.status = "unconfirmed";
          await save(state);
          throw new Error("요청 중 계정 또는 시청 창이 변경되어 수령 여부를 확인할 수 없습니다.");
        }
        attempt.status = "confirmed";
        attempt.httpStatus = receipt.httpStatus;
        attempt.applicationCode = receipt.applicationCode;
        state.receipts.push({...receipt, accountId, build: POWER_BUILD});
        state.receipts = state.receipts.slice(-MAX_RECEIPTS);
        await save(state);
        collected++;
        // Expose only a durable, validated receipt; never IDs or raw response text.
        latestReceipt = {confirmedAt: receipt.confirmedAt, amount: receipt.amount,
          httpStatus: receipt.httpStatus, applicationCode: receipt.applicationCode,
          ...(receipt.collectionMethod==='official-ui'?{collectionMethod: receipt.collectionMethod, confirmation: receipt.confirmation,
          balanceBefore: receipt.balanceBefore, balanceAfter: receipt.balanceAfter}:{})};
      }
      if (!collected) {
        await save(state);
        return resultWithReceipt({status: blocked ? "blocked" : "checked", collected, blocked, balance: power.balance, channelId, diagnostics});
      }
      // A PUT success is durable before the separate balance GET. A failed GET never
      // turns that success into an uncertain PUT, nor causes it to be sent again.
      if (!await isCurrent()) return resultWithReceipt({status: "disabled", collected, channelId});
      let refreshed;
      try { refreshed = await readLogPower(channelId, fetcher); }
      catch (error) {
        error.collectionResult = resultWithReceipt({collected, channelId, diagnostics});
        throw error;
      }
      if (!await isCurrent()) return resultWithReceipt({status: "disabled", collected, channelId});
      const balance = snapshot(refreshed);
      const last = state.receipts.at(-1);
      if (last?.accountId === accountId && last.channelId === channelId) {
        last.balanceAfter = balance.amount;
        last.balanceCheckedAt = balance.checkedAt;
      }
      await save(state);
      return resultWithReceipt({status: blocked ? "blocked" : "checked", collected, blocked, balance: refreshed.balance, channelId, diagnostics});
      } catch (error) {
        // A later request/storage failure cannot erase an earlier durable receipt.
        if (collected) error.collectionResult = resultWithReceipt({collected, channelId, diagnostics});
        throw error;
      }
    }, signal),
  };
}
