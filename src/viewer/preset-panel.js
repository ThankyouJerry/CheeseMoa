import {loadPresets, savePreset, deletePreset} from "../shared/presets.js";
export function bindPresetPanel(container, {snapshot, apply}) {
  const title = document.createElement("h3"); title.textContent = "방송·배치·음량 프리셋";
  const name = document.createElement("input"); name.placeholder = "프리셋 이름"; name.maxLength = 60; name.setAttribute("aria-label", "프리셋 이름");
  const save = document.createElement("button"); save.type = "button"; save.textContent = "현재 구성 저장";
  const list = document.createElement("div");
  const status = document.createElement("p"); status.setAttribute("role", "status");
  container.append(title, name, save, status, list);
  let busy = false;
  async function action(fn) {
    if (busy) return;
    busy = true; save.disabled = true;
    try { await fn(); await refresh(); }
    catch (error) { status.textContent = error.message || "프리셋 처리에 실패했습니다."; }
    finally { busy = false; save.disabled = false; }
  }
  async function refresh() {
    const items = await loadPresets(); list.replaceChildren();
    for (const item of items) {
      const row = document.createElement("div"); row.className = "preset-row";
      const label = document.createElement("span"); label.textContent = `${item.name} · ${item.channels.length}개`;
      const use = document.createElement("button"); use.type = "button"; use.textContent = "불러오기"; use.setAttribute("aria-label", `${item.name} 불러오기`);
      use.onclick = () => action(async () => {
        if (!window.confirm(`“${item.name}”의 방송·배치·음량으로 바꿀까요? 기존 목록에서 빠지는 방송은 닫힙니다.`)) return;
        await apply(item); status.textContent = "프리셋을 불러왔습니다. 솔로 듣기는 해제했습니다.";
      });
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "삭제"; remove.setAttribute("aria-label", `${item.name} 삭제`);
      remove.onclick = () => action(async () => {
        if (!window.confirm(`“${item.name}” 프리셋을 삭제할까요?`)) return;
        await deletePreset(item.id); status.textContent = "프리셋을 삭제했습니다.";
      });
      row.append(label, use, remove); list.append(row);
    }
    if (!items.length) list.textContent = "저장된 프리셋이 없습니다.";
  }
  save.onclick = () => action(async () => {
    await savePreset({...snapshot(), name: name.value}); name.value = ""; status.textContent = "프리셋을 저장했습니다. 솔로 듣기는 저장하지 않습니다.";
  });
  void refresh().catch(error => {status.textContent = error.message;});
  return {refresh};
}
