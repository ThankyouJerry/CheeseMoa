import { parseChzzkUrl } from "./chzzk-url.js";
const STORAGE_KEY = "cheesemoa.channels";
const hasExtensionStorage = typeof chrome !== "undefined" && chrome.storage?.local;

export function normalizeChannels(value) {
  const items = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    const parsed = typeof item?.url === "string" && parseChzzkUrl(item.url);
    if (parsed) items.set(parsed.id, {
      ...parsed, name: typeof item.name === "string" ? item.name.trim().slice(0, 60) : "",
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

async function saveChannels(channels) {
  if (!hasExtensionStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: channels });
}

export async function updateChannels(operation) {
  // Web Locks serialize read-modify-write across popup and viewer documents.
  return navigator.locks.request("cheesemoa.channels", async () => {
    const channels = await loadChannels();
    if (operation.type === "add") {
      const known = new Set(channels.map((item) => item.id));
      for (const item of normalizeChannels(operation.items)) {
        if (!known.has(item.id)) { channels.push(item); known.add(item.id); }
      }
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
    await saveChannels(channels);
    return channels;
  });
}

export function subscribeChannels(callback) {
  if (!hasExtensionStorage) {
    const listener = (event) => {
      if (event.key === STORAGE_KEY) {
        try { callback(normalizeChannels(JSON.parse(event.newValue ?? "[]"))); }
        catch { callback([]); }
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    callback(normalizeChannels(changes[STORAGE_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
