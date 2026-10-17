// Only this extension or its exact same-origin multiview parent may control media.
(() => {
  if (window === window.top) return;
  const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
  const siteOrigin = 'https://chzzk.naver.com';
  const build = 'frame-20261017.2';
  globalThis.__cheesemoaFrameBridgeDispose?.();
  let timer, observer, started = false;
  let desiredMuted = null, desiredVolume = null, lastApplied = null, knownMedia = [];
  function parentOrigin() {
    // ancestorOrigins is browser supplied; unknown parents fail closed.
    const ancestor = window.location?.ancestorOrigins?.[0];
    if (ancestor === extensionOrigin) return extensionOrigin;
    try {
      const parent = window.parent;
      if (parent !== window.top || parent.location.origin !== siteOrigin ||
          parent.location.pathname !== '/lives' || parent.location.search || parent.location.hash !== '#cheesemoa-multiview') return null;
      const root = parent.document.getElementById('cheesemoa-site-host')?.shadowRoot;
      if ([...(root?.querySelectorAll('iframe') || [])].some(frame => frame.contentWindow === window)) return siteOrigin;
    } catch { /* Cross-origin parents are not inspected or trusted by guessing. */ }
    return null;
  }
  function send(data) {
    const origin = parentOrigin();
    if (started && origin) window.parent.postMessage(data, origin);
  }
  function reportAudio(reason = 'query') {
    const media = [...document.querySelectorAll('video, audio')];
    send({type:'cheesemoa-audio-state', available:media.length>0,
      muted:media.length>0 && media.every(item=>item.muted || item.volume===0),
      rawMuted:media.length>0 && media.every(item=>item.muted),
      volume:media.length ? media[0].volume : 0, reason});
  }
  function applyAudio() {
    // Media replacement can occur after SPA navigation or iframe detachment.
    // A previously authorized command must not outlive its trusted parent.
    if (!started || !parentOrigin()) {
      desiredMuted = null; desiredVolume = null; lastApplied = null;
      return;
    }
    if (desiredMuted !== null) for (const media of document.querySelectorAll('video, audio')) {
      media.muted = desiredMuted;
      if (desiredVolume !== null) media.volume = desiredVolume;
      else if (!desiredMuted && media.volume === 0) media.volume = 0.5;
    }
    const first = document.querySelectorAll('video, audio')[0];
    lastApplied = first ? {muted:first.muted,volume:first.volume} : null;
    reportAudio('command');
  }
  function volumeChanged() {
    // Native events can arrive after ownership is lost; do not cache them as
    // commands to replay when the parent later returns to multiview.
    if (!started || !parentOrigin()) {
      desiredMuted = null; desiredVolume = null; lastApplied = null;
      return;
    }
    const first = document.querySelectorAll('video, audio')[0];
    const echo = first && lastApplied && first.muted === lastApplied.muted && first.volume === lastApplied.volume;
    if (!echo && first) {desiredMuted=first.muted;desiredVolume=first.volume;}
    reportAudio(echo ? 'command' : 'native');
  }
  function report() {
    if (!parentOrigin()) {clearInterval(timer);timer=undefined;return;}
    const boxes = [...document.querySelectorAll('video')].map(v=>v.getBoundingClientRect())
      .filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite) && b.width>0 && b.height>0)
      .sort((a,b)=>b.width*b.height-a.width*a.height);
    const b=boxes[0];
    send({type:'cheesemoa-player-bounds',rect:b?{x:b.x,y:b.y,width:b.width,height:b.height}:null});
  }
  function message(event) {
    if (!started || event.source !== window.parent) return;
    const origin=parentOrigin();
    if (!origin || event.origin !== origin || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return;
    const data=event.data;
    if (data.type==='cheesemoa-set-audio') {
      if (typeof data.muted!=='boolean' || !Number.isFinite(data.volume) || data.volume<0 || data.volume>1) return;
      desiredMuted=data.muted;desiredVolume=data.volume;applyAudio();return;
    }
    if (data.type==='cheesemoa-set-muted') {
      if (typeof data.muted!=='boolean') return;
      desiredMuted=data.muted;desiredVolume=null;applyAudio();return;
    }
    if (data.type==='cheesemoa-audio-query') {reportAudio();return;}
    if (data.type!=='cheesemoa-measure-player' || typeof data.enabled!=='boolean') return;
    clearInterval(timer);timer=undefined;
    if (data.enabled) {report();timer=setInterval(report,500);}
  }
  function stop() {
    started=false;clearInterval(timer);timer=undefined;observer?.disconnect();
    window.removeEventListener('message',message);document.removeEventListener('volumechange',volumeChanged,true);
  }
  function start() {
    if (started) return;
    started=true;knownMedia=[];
    document.documentElement?.setAttribute('data-cheesemoa-player-bridge',build);
    window.addEventListener('message',message);document.addEventListener('volumechange',volumeChanged,true);
    observer=new MutationObserver(()=>{
      const media=[...document.querySelectorAll('video, audio')];
      if (media.length===knownMedia.length && media.every((v,i)=>v===knownMedia[i])) return;
      knownMedia=media;applyAudio();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    send({type:'cheesemoa-player-ready'});reportAudio();
  }
  function dispose() {stop();window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',start);}
  globalThis.__cheesemoaFrameBridgeDispose=dispose;
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);
  start();
})();
