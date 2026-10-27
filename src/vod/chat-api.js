import {requireVodSource} from './source.js';
import {requireTimeMs} from './time.js';

export class ChatError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
export function abortError() { return new DOMException('수집을 중단했습니다.', 'AbortError'); }
export function abortableWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = () => { signal?.removeEventListener('abort', stop); resolve(); };
    const timer = setTimeout(done, ms);
    const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(abortError()); };
    signal?.addEventListener('abort', stop, {once:true});
  });
}
const encoder = new TextEncoder();
export function normalizeChatPage(data, maxRowBytes = 65536) {
  if (data?.code !== 200 || !Array.isArray(data?.content?.videoChats))
    throw new ChatError('SCHEMA', '채팅 응답 형식을 확인할 수 없습니다.');
  let previous = -1;
  return data.content.videoChats.map(chat => {
    const elapsedMs = chat?.playerMessageTime;
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs < previous || typeof chat.content !== 'string')
      throw new ChatError('SCHEMA', '채팅 시각 또는 순서를 확인할 수 없습니다.');
    previous = elapsedMs;
    let nickname = 'Unknown';
    if (chat.profile) {
      try { const profile = typeof chat.profile === 'string' ? JSON.parse(chat.profile) : chat.profile;
        if (typeof profile?.nickname === 'string') nickname = profile.nickname;
      } catch { throw new ChatError('SCHEMA', '채팅 프로필 형식을 확인할 수 없습니다.'); }
    }
    if (chat.userIdHash === 'SYSTEM_MESSAGE') nickname = '[SYSTEM]';
    const message = chat.messageStatusType === 'CBOTBLIND' ? '클린봇이 부적절한 표현을 감지했습니다' : chat.content;
    const row = {elapsedMs, nickname, message};
    // Do not retain profiles or userIdHash. Only an explicit message identifier is a dedupe key.
    if ((typeof chat.messageId === 'string' && chat.messageId.length > 0 && chat.messageId.length <= 200) || (Number.isSafeInteger(chat.messageId) && chat.messageId >= 0))
      row.messageId = String(chat.messageId);
    if (encoder.encode(JSON.stringify(row)).length > maxRowBytes)
      throw new ChatError('ROW_LIMIT', '한 채팅 행의 크기 제한에 도달했습니다.', {partial:true});
    return row;
  });
}

export function createChatApi({fetcher = fetch, timeoutMs = 15000, responseBytes = 4 * 1024 * 1024,
  maxRowBytes = 65536, wait = abortableWait, now = Date.now} = {}) {
  for (const value of [timeoutMs, responseBytes, maxRowBytes])
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('Invalid chat API limit');
  async function once(source, cursorMs, signal) {
    const controller = new AbortController();
    let timeout = false, timer, listener;
    const stop = () => controller.abort();
    if (signal?.aborted) throw abortError();
    signal?.addEventListener('abort', stop, {once:true});
    const aborted = new Promise((_, reject) => {
      listener = () => reject(timeout ? new ChatError('TIMEOUT', '채팅 응답 시간이 초과되었습니다.', {retryable:true}) : abortError());
      controller.signal.addEventListener('abort', listener, {once:true});
      timer = setTimeout(() => { timeout = true; controller.abort(); }, timeoutMs);
    });
    try {
      return await Promise.race([aborted, (async () => {
        const url = `https://api.chzzk.naver.com/service/v1/videos/${source.videoId}/chats?playerMessageTime=${cursorMs}`;
        const response = await fetcher(url, {method:'GET', credentials:'omit', redirect:'error', cache:'no-store', signal:controller.signal});
        const discard = () => { try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* Already closed. */ } };
        if (controller.signal.aborted) { discard(); throw abortError(); }
        if (!response.ok) {
          discard();
          const raw = response.headers?.get?.('Retry-After');
          const retryAfterMs = raw ? Math.max(0, Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - now()) : 0;
          throw new ChatError('HTTP', `공개 채팅 조회 실패 (HTTP ${response.status}).`,
            {status:response.status, retryable:response.status === 429 || response.status >= 500,
              retryAfterMs:Number.isFinite(retryAfterMs) ? retryAfterMs : 0});
        }
        let text = '';
        if (response.body?.getReader) {
          const reader = response.body.getReader(), decoder = new TextDecoder(); let size = 0;
          const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Already closed. */ } };
          controller.signal.addEventListener('abort', cancel, {once:true});
          try { while (true) {
            const {done,value} = await reader.read(); if (done) break;
            if (controller.signal.aborted) throw abortError();
            size += value.byteLength;
            if (size > responseBytes) { cancel(); throw new ChatError('RESPONSE_LIMIT', '응답 크기 제한에 도달했습니다.', {partial:true}); }
            text += decoder.decode(value, {stream:true});
          } text += decoder.decode(); } finally { controller.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
        } else {
          text = await response.text();
          if (encoder.encode(text).length > responseBytes) throw new ChatError('RESPONSE_LIMIT', '응답 크기 제한에 도달했습니다.', {partial:true});
        }
        if (controller.signal.aborted) throw abortError();
        let data;
        try { data = JSON.parse(text); } catch { throw new ChatError('JSON', '채팅 JSON 응답을 읽을 수 없습니다.'); }
        return normalizeChatPage(data, maxRowBytes);
      })()]);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timeout) throw new ChatError('TIMEOUT', '채팅 응답 시간이 초과되었습니다.', {retryable:true});
      if (error instanceof ChatError || error.name === 'AbortError') throw error;
      throw new ChatError('NETWORK', '공개 채팅 서버에 연결하지 못했습니다.', {retryable:true});
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      controller.signal.removeEventListener('abort', listener);
    }
  }
  return {async page(sourceInput, cursorMs, {signal, onAttempt = async () => {}} = {}) {
    const source = requireVodSource(sourceInput); requireTimeMs(cursorMs);
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw abortError();
      await onAttempt();
      try { return await once(source, cursorMs, signal); }
      catch (error) {
        if (!error.retryable || attempt >= 3 || signal?.aborted) throw error;
        if (error.retryAfterMs > 60000) throw new ChatError('RATE_WAIT', '서버 대기 시간이 길어 일시 중단했습니다. 나중에 재개해 주세요.', {retryAt:now()+error.retryAfterMs});
        await wait(Math.max(1000 * 2 ** attempt, error.retryAfterMs || 0), signal);
      }
    }
  }};
}
