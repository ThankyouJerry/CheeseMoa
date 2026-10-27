// Isolated-world VOD adapter. No page-message, network, account or storage bridge.
(() => {
  globalThis.__cheesemoaVodFrameDispose?.();
  const runtime = chrome.runtime;
  const toolsUrl = runtime.getURL('src/vod/vod-tools.html');
  const REQUEST = 'cheesemoa-vod-player', RESPONSE = 'cheesemoa-vod-player-result';
  let started = false, source = null, generation = '', observer, pendingSeek = null;
  let media = null, mediaUrl = '', advertising = false;
  const tokens = new Set();
  function readSource() {
    try {
      const url = new URL(location.href);
      const match = /^\/video\/(\d{1,32})$/.exec(url.pathname);
      if (url.origin !== 'https://chzzk.naver.com' || !match || url.username || url.password) return null;
      const videoId = match[1];
      return {schemaVersion: 1, platform: 'chzzk', sourceKind: 'vod', videoId,
        canonicalUrl: `https://chzzk.naver.com/video/${videoId}`, sourceKey: `chzzk:vod:${videoId}`, timeBasis: 'vod-relative-ms'};
    } catch { return null; }
  }
  function refresh() {
    const next = readSource();
    const videos = document.querySelectorAll('video');
    const nextMedia = videos.length === 1 ? videos[0] : null;
    const nextUrl = nextMedia ? nextMedia.currentSrc || nextMedia.getAttribute('src') || '' : '';
    const nextAd = !!document.querySelector('.ad-showing, .pzp-pc--ad, [data-ad-playing="true"]');
    if (next?.sourceKey !== source?.sourceKey || nextMedia !== media || nextUrl !== mediaUrl || nextAd !== advertising) {
      source = next; media = nextMedia; mediaUrl = nextUrl; advertising = nextAd;
      generation = crypto.randomUUID(); tokens.clear();
      pendingSeek?.cancel();
    }
    return source;
  }
  function mediaReset(event) {
    if (event.target !== media) return;
    generation = crypto.randomUUID(); tokens.clear(); pendingSeek?.cancel(); refresh();
  }
  function videoNow() {
    // An ad/ambiguous player is not a trustworthy VOD timestamp source.
    if (document.querySelector('.ad-showing, .pzp-pc--ad, [data-ad-playing="true"]')) return null;
    const videos = [...document.querySelectorAll('video')];
    if (videos.length !== 1) return null;
    const video = videos[0];
    if (!video.isConnected || video.readyState < 1 || video.error || !Number.isFinite(video.currentTime) || video.currentTime < 0 ||
      !Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime > video.duration) return null;
    return video;
  }
  function reply(data, identity = source, epoch = generation) {
    if (!started || !identity || readSource()?.sourceKey !== identity.sourceKey || generation !== epoch) return;
    try { Promise.resolve(runtime.sendMessage({type: RESPONSE, version: 1, source: identity, generation: epoch,
      label: (document.title || `다시보기 ${identity.videoId}`).slice(0, 160), ...data})).catch(() => {}); } catch {}
  }
  function position(video) {
    const ms = Math.round(video.currentTime * 1000);
    return Number.isSafeInteger(ms) && ms >= 0 ? ms : null;
  }
  function seek(message, video, identity, epoch) {
    if (pendingSeek || !Number.isSafeInteger(message.positionMs) || message.positionMs < 0) return false;
    const seconds = message.positionMs / 1000;
    if (seconds > video.duration) return false;
    let allowed = false;
    try {
      for (let i = 0; i < video.seekable.length; i++) {
        if (video.seekable.start(i) <= seconds && seconds <= video.seekable.end(i)) { allowed = true; break; }
      }
    } catch { return false; }
    if (!allowed) return false;
    let timer, settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); video.removeEventListener('seeked', complete);
      pendingSeek = null;
      refresh();
      if (ok && (videoNow() !== video || readSource()?.sourceKey !== identity.sourceKey || generation !== epoch)) ok = false;
      reply({action: 'seek', requestId: message.requestId, ok, ...(ok ? {positionMs: position(video)} : {})}, identity, epoch);
    };
    const complete = () => finish(!video.seeking && Math.abs(video.currentTime - seconds) <= 0.05);
    pendingSeek = {cancel: () => finish(false)};
    video.addEventListener('seeked', complete);
    timer = setTimeout(() => finish(false), 2500);
    try {
      // Preserve pause/play and audio state: seek only; never call play/pause.
      if (!video.seeking && Math.abs(video.currentTime - seconds) < 0.0005) complete();
      else video.currentTime = seconds;
    } catch { finish(false); }
    return true;
  }
  function message(data, sender, respond) {
    if (!started || sender?.id !== runtime.id || sender.url !== toolsUrl || data?.type !== REQUEST || data.version !== 1) return;
    refresh();
    if (!source) return;
    if (data.action === 'discover' && typeof data.discoveryId === 'string' && data.discoveryId.length >= 8 && data.discoveryId.length <= 100) {
      if (!videoNow()) return;
      reply({action: 'register', discoveryId: data.discoveryId}); respond?.({received: true}); return;
    }
    if (!['snapshot', 'seek'].includes(data.action) || data.generation !== generation || data.sourceKey !== source.sourceKey ||
      typeof data.requestId !== 'string' || data.requestId.length < 8 || data.requestId.length > 100 || tokens.has(data.requestId)) return;
    // Bound replay memory; stop accepting rather than evicting and replaying seeks.
    if (tokens.size >= 1000) { generation = crypto.randomUUID(); tokens.clear(); pendingSeek?.cancel(); return; }
    tokens.add(data.requestId);
    respond?.({received: true});
    const identity = source, epoch = generation, video = videoNow();
    if (!video || video.seeking) { reply({action: data.action, requestId: data.requestId, ok: false}); return; }
    if (data.action === 'snapshot') {
      const ms = position(video);
      reply({action: data.action, requestId: data.requestId, ok: ms !== null, ...(ms !== null ? {positionMs: ms} : {})});
    } else if (!seek(data, video, identity, epoch)) reply({action: data.action, requestId: data.requestId, ok: false});
  }
  function stop() {
    started = false; pendingSeek?.cancel(); observer?.disconnect();
    runtime.onMessage.removeListener(message);
    window.removeEventListener('popstate', refresh); window.removeEventListener('hashchange', refresh);
    document.removeEventListener('emptied', mediaReset, true); document.removeEventListener('loadstart', mediaReset, true);
    source = null; media = null; mediaUrl = ''; advertising = false; tokens.clear(); generation = crypto.randomUUID();
  }
  function start() {
    if (started) return;
    started = true; generation = crypto.randomUUID(); refresh();
    runtime.onMessage.addListener(message);
    window.addEventListener('popstate', refresh); window.addEventListener('hashchange', refresh);
    document.addEventListener('emptied', mediaReset, true); document.addEventListener('loadstart', mediaReset, true);
    observer = new MutationObserver(refresh); observer.observe(document.documentElement, {childList: true, subtree: true,
      attributes: true, attributeFilter: ['src', 'class', 'data-ad-playing']});
  }
  function dispose() { stop(); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', start); }
  globalThis.__cheesemoaVodFrameDispose = dispose;
  window.addEventListener('pagehide', stop); window.addEventListener('pageshow', start); start();
})();
