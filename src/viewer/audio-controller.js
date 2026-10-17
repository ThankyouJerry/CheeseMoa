import { updateChannels } from "../shared/storage.js";
const equal = (a,b) => a.volume === b.volume && a.muted === b.muted;
export function createAudioController(onError, {persistAudio = updateChannels} = {}) {
  const entries = new Map();
  let soloId = null;
  function render(entry) {
    const {card, base, available, id} = entry;
    const mute = card.querySelector('[data-action="mute"]');
    mute.disabled = !available;
    mute.textContent = base.muted ? "음소거 해제" : "음소거";
    mute.setAttribute("aria-pressed", String(base.muted));
    const solo = card.querySelector('[data-action="solo"]');
    solo.disabled = !available; solo.setAttribute("aria-pressed", String(soloId === id));
    solo.textContent = soloId === id ? "솔로 해제" : "혼자 듣기";
    const volume = card.querySelector('[data-action="volume"]');
    volume.disabled = !available; volume.value = String(Math.round(base.volume * 100));
    card.querySelector('[data-volume-label]').textContent = `${Math.round(base.volume * 100)}%`;
    card.classList.toggle("solo-muted", !!soloId && soloId !== id);
  }
  function send(entry) {
    const muted = soloId ? soloId !== entry.id : entry.base.muted;
    entry.iframe.contentWindow.postMessage(entry.initialized || soloId
      ? {type: "cheesemoa-set-audio", volume: entry.base.volume, muted}
      : {type: "cheesemoa-audio-query"}, "https://chzzk.naver.com");
    render(entry);
  }
  function sendAll() { for (const entry of entries.values()) send(entry); }
  async function save(entry) {
    entry.pendingSaves++;
    try { await persistAudio({type: "audio", id: entry.id, audio: {...entry.base}}); }
    catch { onError("음량을 저장하지 못했습니다. 현재 조작은 유지되지만 다시 열면 이전 설정을 사용합니다."); }
    finally { entry.pendingSaves--; }
  }
  return {
    attach(card, channel) {
      const iframe = card.querySelector("iframe");
      const entry = {card, iframe, id: channel.id, base: channel.audio ? {...channel.audio} : {volume: .5, muted: false}, initialized: !!channel.audio, available: false, editing: false, pendingSaves: 0};
      entries.set(channel.id, entry);
      card.querySelector('[data-action="mute"]').onclick = () => {
        if (soloId === entry.id) soloId = null;
        entry.initialized = true; entry.base.muted = !entry.base.muted; sendAll(); void save(entry);
      };
      card.querySelector('[data-action="solo"]').onclick = () => { soloId = soloId === entry.id ? null : entry.id; sendAll(); };
      const volume = card.querySelector('[data-action="volume"]');
      volume.oninput = () => {
        entry.editing = true;
        entry.initialized = true; entry.base.volume = Number(volume.value) / 100; send(entry);
      };
      volume.onchange = () => { entry.editing = false; void save(entry); };
      render(entry);
    },
    detach(id) {
      entries.delete(id);
      if (soloId === id) { soloId = null; sendAll(); }
    },
    update(channel, {force = false} = {}) {
      const entry = entries.get(channel.id);
      if (force && entry) entry.editing = false;
      // A metadata/storage notification may still contain the pre-drag audio.
      if (entry && (force || (!entry.editing && !entry.pendingSaves)) && channel.audio && !equal(entry.base, channel.audio)) {
        entry.base = {...channel.audio}; entry.initialized = true; send(entry);
      }
    },
    sync(iframe, loading = false) {
      const entry = [...entries.values()].find(e => e.iframe === iframe);
      if (!entry) return;
      if (loading) entry.available = false;
      send(entry);
    },
    receive(iframe, data) {
      const entry = [...entries.values()].find(e => e.iframe === iframe);
      if (!entry || typeof data.available !== "boolean" || typeof data.muted !== "boolean" ||
          (data.available && (!Number.isFinite(data.volume) || data.volume < 0 || data.volume > 1))) return;
      entry.available = data.available;
      if (data.available && (!entry.initialized || (data.reason === "native" && !soloId))) {
        entry.base = {volume: data.volume, muted: typeof data.rawMuted === "boolean" ? data.rawMuted : data.muted};
        entry.initialized = true;
        if (data.reason === "native") void save(entry);
      }
      render(entry);
      if (data.reason === "native" && soloId) send(entry);
    },
    clearSolo() { soloId = null; sendAll(); },
    snapshot(channels) { return channels.map(channel => ({...channel, audio: {...(entries.get(channel.id)?.base || channel.audio || {volume:.5,muted:false})}})); },
  };
}
