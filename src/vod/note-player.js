import {requireVodSource} from './source.js';
import {requireTimeMs} from './time.js';
import {noteError} from './note-model.js';

const REQUEST = 'cheesemoa-vod-player';
const RESPONSE = 'cheesemoa-vod-player-result';
export function createNotePlayer({chromeApi = globalThis.chrome, uuid = () => crypto.randomUUID(),
  schedule = setTimeout, cancel = clearTimeout, discoveryMs = 600, timeoutMs = 4000} = {}) {
  let disposed = false, discovery = null;
  const registrations = new Map(), pending = new Map();
  const key = p => `${p.tabId}:${p.frameId}:${p.documentId}:${p.generation}`;
  const unavailable = () => noteError('UNAVAILABLE', '연결된 다시보기 플레이어를 찾지 못했습니다. 수동 시각을 입력하거나 다시 검색해 주세요.');
  function identity(sender, data) {
    if (sender?.id !== chromeApi.runtime.id || !Number.isInteger(sender.tab?.id) || sender.tab.id < 0 ||
      !Number.isInteger(sender.frameId) || sender.frameId < 0 || typeof sender.documentId !== 'string' || !sender.documentId ||
      typeof data?.generation !== 'string' || data.generation.length < 8 || data.generation.length > 100) return null;
    try {
      const url = new URL(sender.url);
      if (url.origin !== 'https://chzzk.naver.com' || !/^\/video\/\d{1,32}$/.test(url.pathname) || url.username || url.password) return null;
      const source = requireVodSource(data.source);
      if (requireVodSource(sender.url).sourceKey !== source.sourceKey) return null;
      return {tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, source,
        label: typeof data.label === 'string' ? data.label.slice(0, 160) : `다시보기 ${source.videoId}`, generation: data.generation};
    } catch { return null; }
  }
  function receive(data, sender) {
    if (disposed || data?.type !== RESPONSE || data.version !== 1) return;
    const player = identity(sender, data);
    if (!player) return;
    if (data.action === 'register') {
      if (!discovery || data.discoveryId !== discovery.id || !discovery.tabs.has(player.tabId)) return;
      for (const [registeredKey, registered] of registrations) {
        if (registered.tabId === player.tabId && registered.frameId === player.frameId) registrations.delete(registeredKey);
      }
      registrations.set(key(player), Object.freeze({...player, source: Object.freeze({...player.source})}));
      return;
    }
    const request = pending.get(data.requestId);
    if (!request || key(request.player) !== key(player) || request.player.source.sourceKey !== player.source.sourceKey ||
        data.action !== request.action) return;
    pending.delete(data.requestId); cancel(request.timer);
    if (data.ok !== true) {
      request.reject(noteError('UNAVAILABLE', '플레이어의 시각을 확인하거나 이동하지 못했습니다. 다시 검색하거나 수동 시각을 사용해 주세요.'));
      return;
    }
    try { request.resolve({source: player.source, positionMs: requireTimeMs(data.positionMs)}); }
    catch { request.reject(noteError('INVALID', '플레이어가 올바르지 않은 시각을 보냈습니다.')); }
  }
  chromeApi?.runtime?.onMessage?.addListener(receive);
  function finishDiscovery(error) {
    if (!discovery) return;
    const current = discovery; discovery = null; cancel(current.timer);
    if (error) current.reject(error);
    else current.resolve([...registrations.values()].sort((a, b) => a.tabId - b.tabId || a.frameId - b.frameId));
  }
  async function discover() {
    if (disposed || !chromeApi?.tabs || !chromeApi?.runtime?.onMessage) throw unavailable();
    finishDiscovery(noteError('STALE', '새 플레이어 검색을 시작했습니다.'));
    for (const request of pending.values()) { cancel(request.timer); request.reject(noteError('STALE', '플레이어를 다시 선택해 주세요.')); }
    pending.clear(); registrations.clear();
    const id = uuid();
    return new Promise((resolve, reject) => {
      discovery = {id, resolve, reject, tabs: new Set(), timer: schedule(() => finishDiscovery(), discoveryMs + timeoutMs)};
      Promise.resolve().then(() => chromeApi.tabs.query({url: 'https://chzzk.naver.com/*'})).then(tabs => {
        if (disposed || discovery?.id !== id) return;
        if (!Array.isArray(tabs)) { finishDiscovery(unavailable()); return; }
        cancel(discovery.timer);
        discovery.timer = schedule(() => finishDiscovery(), discoveryMs);
        for (const tab of tabs) {
          if (!Number.isInteger(tab?.id) || tab.id < 0) continue;
          discovery.tabs.add(tab.id);
          // Broadcast only asks each matching frame to register independently.
          // The first sendMessage response never chooses a player.
          Promise.resolve().then(() => chromeApi.tabs.sendMessage(tab.id, {type: REQUEST, version: 1, action: 'discover', discoveryId: id})).catch(() => {});
        }
      }, () => { if (discovery?.id === id) finishDiscovery(unavailable()); });
    });
  }
  function command(player, action, positionMs) {
    if (disposed) return Promise.reject(unavailable());
    const selected = player && registrations.get(key(player));
    if (!selected || selected.source.sourceKey !== player.source?.sourceKey) return Promise.reject(noteError('STALE', '플레이어를 검색한 뒤 목록에서 다시 선택해 주세요.'));
    const requestId = uuid();
    return new Promise((resolve, reject) => {
      const timer = schedule(() => {
        pending.delete(requestId);
        reject(noteError('TIMEOUT', '플레이어 응답 시간이 지났습니다. 자동 재시도하지 않았습니다. 다시 검색해 주세요.'));
      }, timeoutMs);
      pending.set(requestId, {resolve, reject, timer, player: selected, action});
      Promise.resolve().then(() => {
        if (!pending.has(requestId) || disposed) return;
        return chromeApi.tabs.sendMessage(selected.tabId,
        {type: REQUEST, version: 1, action, requestId, generation: selected.generation,
          sourceKey: selected.source.sourceKey, ...(action === 'seek' ? {positionMs} : {})},
        {frameId: selected.frameId, documentId: selected.documentId});
      }).catch(() => {
        const waiting = pending.get(requestId);
        if (!waiting) return;
        pending.delete(requestId); cancel(timer); reject(unavailable());
      });
    });
  }
  return {
    discover,
    snapshot: player => command(player, 'snapshot'),
    seek(player, positionMs) { try { return command(player, 'seek', requireTimeMs(positionMs)); } catch (error) { return Promise.reject(error); } },
    dispose() {
      disposed = true; finishDiscovery(noteError('CLOSED', '플레이어 연결을 닫았습니다.'));
      chromeApi?.runtime?.onMessage?.removeListener(receive);
      for (const request of pending.values()) { cancel(request.timer); request.reject(noteError('CLOSED', '플레이어 연결을 닫았습니다.')); }
      pending.clear(); registrations.clear();
    },
  };
}
