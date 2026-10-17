import { parseChzzkUrl } from "./chzzk-url.js";
// Persisted lists may exceed the playback limit; never truncate saved channels.
export const MAX_ACTIVE_CHANNELS = 4;
const STORAGE_KEY = "cheesemoa.channels";
const hasExtensionStorage = typeof chrome !== "undefined" && chrome.storage?.local;

export function normalizeChannels(value) {
  const items = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    const parsed = typeof item?.url === "string" && parseChzzkUrl(item.url);
    if (parsed) items.set(parsed.id, {
      ...parsed, ...(item.audio && Number.isFinite(item.audio.volume) && item.audio.volume >= 0 && item.audio.volume <= 1 && typeof item.audio.muted === "boolean"
        ? { audio: {volume: item.audio.volume, muted: item.audio.muted} } : {}), name: typeof item.name === "string" ? item.name.trim().slice(0, 60) : "",
      ...(typeof item.streamerName === "string" && item.streamerName.trim()
        ? { streamerName: item.streamerName.trim().slice(0, 100) } : {}),
    });
  }
  return [...items.values()];
}

export async function loadChannels() {
  if (!hasExtensionStorage) {
    try {
      return normalizeChannels(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    } catch {
      return [];
    }
  }
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeChannels(result[STORAGE_KEY]);
}

async function saveChannels(channels, columns) {
  if (!hasExtensionStorage) {
    const old = localStorage.getItem("cheesemoa.columns");
    if (columns !== undefined) localStorage.setItem("cheesemoa.columns", String(columns));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(channels)); }
    catch (error) {
      if (columns !== undefined) {
        if (old === null) localStorage.removeItem("cheesemoa.columns");
        else localStorage.setItem("cheesemoa.columns", old);
      }
      throw error;
    }
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: channels, ...(columns === undefined ? {} : {"cheesemoa.columns": columns}) });
}

export async function updateChannels(operation) {
  // Web Locks serialize read-modify-write across popup and viewer documents.
  return navigator.locks.request("cheesemoa.channels", async () => {
    let channels = await loadChannels();
    if (operation.type === "add") {
      const known = new Set(channels.map((item) => item.id));
      const incoming = normalizeChannels(operation.items);
      for (const item of incoming) {
        if (!known.has(item.id)) { channels.push(item); known.add(item.id); }
      }
    } else if (operation.type === "replace") {
      const next = normalizeChannels(operation.items);
      if (!Array.isArray(operation.items) || next.length !== operation.items.length || ![0,1,2,3].includes(operation.columns)) {
        throw new Error("프리셋의 방송 목록 또는 배치가 올바르지 않습니다.");
      }
      channels = next;
    } else if (operation.type === "audio") {
      const item = channels.find(item => item.id === operation.id);
      if (!item) return channels;
      const audio = operation.audio;
      if (!audio || !Number.isFinite(audio.volume) || audio.volume < 0 || audio.volume > 1 || typeof audio.muted !== "boolean") throw new Error("올바르지 않은 음량입니다.");
      item.audio = {volume: audio.volume, muted: audio.muted};
    } else if (operation.type === "remove") {
      const index = channels.findIndex((item) => item.id === operation.id);
      if (index >= 0) channels.splice(index, 1);
    } else if (operation.type === "rename") {
      const item = channels.find((item) => item.id === operation.id);
      if (item) item.name = String(operation.name).trim().slice(0, 60);
    } else if (operation.type === "metadata") {
      const item = channels.find((item) => item.id === operation.id);
      const name = typeof operation.streamerName === "string" ? operation.streamerName.trim().slice(0, 100) : "";
      if (!item || !name || item.streamerName === name) return channels;
      item.streamerName = name;
    } else throw new Error("Unknown operation");
    await saveChannels(channels, operation.type === "replace" ? operation.columns : undefined);
    return channels;
  });
}

export function subscribeChannels(callback) {
  if (!hasExtensionStorage) {
    const listener = (event) => {
      if (event.key === STORAGE_KEY || event.key === "cheesemoa.columns") {
        try { callback(normalizeChannels(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")), Number(localStorage.getItem("cheesemoa.columns") || 0)); }
        catch { callback([]); }
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  const listener = (changes, areaName) => {
    if (areaName !== "local" || (!changes[STORAGE_KEY] && !changes["cheesemoa.columns"])) return;
    if (changes[STORAGE_KEY]) callback(normalizeChannels(changes[STORAGE_KEY].newValue), changes["cheesemoa.columns"]?.newValue);
    else void loadChannels().then(channels => callback(channels, changes["cheesemoa.columns"]?.newValue));
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadLayout() {
  const stored = hasExtensionStorage ? (await chrome.storage.local.get("cheesemoa.columns"))["cheesemoa.columns"] : undefined;
  const value = stored ?? Number(localStorage.getItem("cheesemoa.columns") || 0);
  return [0,1,2,3].includes(value) ? value : 0;
}
export async function saveLayout(columns) {
  if (![0,1,2,3].includes(columns)) throw new Error("올바르지 않은 배치입니다.");
  return navigator.locks.request("cheesemoa.channels", async () => {
    if (hasExtensionStorage) await chrome.storage.local.set({"cheesemoa.columns": columns});
    else localStorage.setItem("cheesemoa.columns", String(columns));
  });
}
