const STORAGE_KEY = "cheesemoa.channels";
const hasExtensionStorage = typeof chrome !== "undefined" && chrome.storage?.local;

export async function loadChannels() {
  if (!hasExtensionStorage) {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  }
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

export async function saveChannels(channels) {
  if (!hasExtensionStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: channels });
}

export function subscribeChannels(callback) {
  if (!hasExtensionStorage) {
    const listener = (event) => {
      if (event.key === STORAGE_KEY) callback(JSON.parse(event.newValue ?? "[]"));
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    callback(changes[STORAGE_KEY].newValue ?? []);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
