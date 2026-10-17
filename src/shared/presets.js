import { normalizeChannels } from "./storage.js";
const KEY = "cheesemoa.presets.v1";
export const MAX_PRESETS = 10;
export function validatePreset(value) {
  if (!value || typeof value.name !== "string" || !value.name.trim() || value.name.length > 60 ||
      !Array.isArray(value.channels) || !value.channels.length || ![0,1,2,3].includes(value.columns)) {
    throw new Error("프리셋 이름·방송 목록·배치를 확인해 주세요.");
  }
  const channels = normalizeChannels(value.channels);
  if (channels.length !== value.channels.length) throw new Error("프리셋에 잘못된 방송이 있습니다.");
  for (const item of value.channels) {
    if (item.audio !== undefined && (!item.audio || !Number.isFinite(item.audio.volume) || item.audio.volume < 0 || item.audio.volume > 1 || typeof item.audio.muted !== "boolean")) throw new Error("프리셋 음량이 올바르지 않습니다.");
  }
  return {name: value.name.trim(), channels, columns: value.columns};
}
export async function loadPresets() {
  const extension = globalThis.chrome?.storage?.local;
  const value = extension ? (await extension.get(KEY))[KEY] : JSON.parse(localStorage.getItem(KEY) || "null");
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_PRESETS) throw new Error("저장된 프리셋 형식을 확인할 수 없습니다. 기존 기록은 보존했습니다.");
  return value.map(item => {
    if (typeof item?.id !== "string" || !item.id) throw new Error("프리셋 식별자가 올바르지 않습니다.");
    return {...validatePreset(item), id: item.id};
  });
}
async function persist(items) {
  if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({[KEY]: items});
  else localStorage.setItem(KEY, JSON.stringify(items));
}
export async function savePreset(snapshot) {
  const value = validatePreset(snapshot);
  return navigator.locks.request(KEY, async () => {
    const items = await loadPresets();
    if (items.length >= MAX_PRESETS) throw new Error("프리셋은 최대 10개입니다. 필요 없는 항목을 먼저 삭제해 주세요.");
    const item = {...value, id: crypto.randomUUID()};
    items.push(item); await persist(items); return item;
  });
}
export async function deletePreset(id) {
  return navigator.locks.request(KEY, async () => {
    const items = await loadPresets();
    await persist(items.filter(item => item.id !== id));
  });
}
