import {searchChannels, loadFollowingChannels, DISCOVERY_MAX_PAGES} from "../shared/channel-discovery.js";
import {loadChannels, updateChannels} from "../shared/storage.js";

export function bindDiscoveryPanel(container, {
  onAdded = () => {}, onError = () => {},
  search = searchChannels, following = loadFollowingChannels,
  loadSaved = loadChannels, saveSelected = updateChannels,
} = {}) {
  const doc = container.ownerDocument;
  const make = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, role) => {
    const node = make("button", text);
    node.type = "button";
    node.dataset.role = role;
    return node;
  };
  const tabs = make("div", "", "discovery-tabs");
  const searchTab = button("이름으로 검색", "search");
  const followingTab = button("팔로잉 라이브", "following");
  tabs.append(searchTab, followingTab);
  const form = make("form", "", "discovery-form");
  const label = make("label", "채널 이름");
  const input = make("input");
  input.type = "search"; input.maxLength = 100; input.placeholder = "스트리머 이름 입력";
  input.dataset.role = "keyword";
  label.append(input);
  const submit = button("검색", "submit"); submit.type = "submit";
  form.append(label, submit);
  const status = make("p", "채널을 검색하거나 내 팔로잉을 불러와 선택해 주세요.", "discovery-status");
  status.dataset.role = "status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const results = make("div", "", "discovery-results"); results.dataset.role = "results";
  const actions = make("div", "", "discovery-actions");
  const more = button("더 불러오기", "more"); more.hidden = true;
  const add = button("선택한 채널 추가", "add"); add.disabled = true;
  const cancel = button("불러오기 취소", "cancel"); cancel.hidden = true;
  actions.append(more, add, cancel);
  container.replaceChildren(tabs, form, status, results, actions);

  let mode = "search", keyword = "", next = null, pages = 0, generation = 0;
  let controller = null, busy = false, adding = false, destroyed = false;
  let savedIds = new Set();
  const items = new Map(), selected = new Set(), controls = new Map();
  const listeners = [];
  const listen = (node, type, handler) => { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); };
  const message = (text, error = false) => { status.textContent = text; status.classList.toggle("error", error); };
  const report = (error) => { message(error?.message || "목록을 불러오지 못했습니다.", true); onError(error); };
  function sync() {
    add.disabled = adding || selected.size === 0;
    add.textContent = adding ? "추가 중…" : selected.size ? `선택한 ${selected.size}개 채널 추가` : "선택한 채널 추가";
    more.hidden = next === null; more.disabled = busy || adding || pages >= DISCOVERY_MAX_PAGES;
    cancel.hidden = !busy;
    searchTab.setAttribute("aria-pressed", String(mode === "search"));
    followingTab.setAttribute("aria-pressed", String(mode === "following"));
    for (const [id, checkbox] of controls) {
      checkbox.disabled = adding || savedIds.has(id);
      checkbox.checked = selected.has(id);
      checkbox.closest(".discovery-row").classList.toggle("saved", savedIds.has(id));
      checkbox.closest(".discovery-row").querySelector("small").textContent = savedIds.has(id) ? "이미 추가됨" : items.get(id).openLive ? "방송 중" : "라이브 채널";
    }
  }
  async function refreshSaved() {
    const channels = await loadSaved();
    if (destroyed) return;
    savedIds = new Set(channels.map(item => item.id));
    for (const id of selected) if (savedIds.has(id)) selected.delete(id);
    sync();
  }
  function render() {
    for (const [id, item] of items) {
      if (controls.has(id)) continue;
      const row = make("label", "", "discovery-row");
      const checkbox = make("input"); checkbox.type = "checkbox";
      checkbox.dataset.role = "selection"; checkbox.dataset.channelId = id;
      const name = make("span", item.streamerName);
      const detail = make("small");
      row.append(checkbox, name, detail); results.append(row); controls.set(id, checkbox);
    }
    sync();
  }
  function stop() {
    generation++; controller?.abort(); controller = null; busy = false; sync();
  }
  async function load(reset, target = mode) {
    if (destroyed || adding || (!reset && (busy || next === null || pages >= DISCOVERY_MAX_PAGES))) return;
    if (reset) {
      stop(); mode = target; keyword = input.value.trim(); next = 0;
      pages = 0; items.clear(); controls.clear(); selected.clear(); results.replaceChildren();
      form.hidden = mode === "following";
      if (mode === "search" && !keyword) { next = null; message("검색할 채널 이름을 입력해 주세요."); sync(); return; }
    }
    const token = ++generation;
    controller = new AbortController(); busy = true; sync(); message("목록을 불러오는 중…");
    const requested = next;
    try {
      const page = mode === "search"
        ? await search(keyword, {offset: requested, signal: controller.signal})
        : await following({page: requested, signal: controller.signal});
      if (destroyed || token !== generation) return;
      const previous = items.size;
      for (const item of page.channels) items.set(item.id, item);
      if (pages > 0 && items.size === previous && page.next !== null) throw new Error("같은 목록이 반복되어 불러오기를 중단했습니다. 이미 표시된 채널은 선택할 수 있습니다.");
      next = page.next; pages++; render();
      message(pages >= DISCOVERY_MAX_PAGES && next !== null
        ? `${items.size}개 표시 · 조회 한도에 도달했습니다. 전체 목록이 아닙니다. 이름 검색으로 나머지 채널을 찾아 주세요.`
        : items.size ? `${items.size}개 표시${next !== null ? " · 더 불러올 채널이 있습니다." : mode === "following" ? " · 방송 중인 팔로잉만 표시합니다." : " · 검색 목록을 모두 불러왔습니다."}`
          : mode === "following" ? "방송 중인 팔로잉이 없거나 로그인 확인이 필요합니다. 치지직 로그인 상태를 확인해 주세요." : "검색 결과가 없습니다.");
      await refreshSaved();
    } catch (error) {
      if (!destroyed && token === generation && error?.name !== "AbortError") {
        // Preserve the cursor and already displayed rows so manual retry is possible.
        report(error);
      }
    } finally {
      if (!destroyed && token === generation) { busy = false; controller = null; sync(); }
    }
  }
  listen(form, "submit", event => { event.preventDefault(); void load(true, "search"); });
  listen(searchTab, "click", () => {
    stop(); mode = "search"; form.hidden = false; next = null;
    items.clear(); controls.clear(); selected.clear(); results.replaceChildren();
    message("검색할 채널 이름을 입력해 주세요."); sync(); input.focus();
  });
  listen(followingTab, "click", () => { void load(true, "following"); });
  listen(more, "click", () => { void load(false); });
  listen(cancel, "click", () => { stop(); message("불러오기를 취소했습니다. 표시된 채널은 선택할 수 있습니다."); });
  listen(input, "input", () => {
    if (mode === "search" && input.value.trim() !== keyword) {
      stop(); next = null; sync(); message("검색어가 변경되었습니다. 검색 버튼을 눌러 주세요.");
    }
  });
  listen(results, "change", event => {
    const checkbox = event.target;
    const id = checkbox?.dataset?.channelId;
    if (!controls.has(id) || checkbox.disabled) return;
    if (checkbox.checked) selected.add(id);
    else selected.delete(id);
    sync();
  });
  listen(add, "click", async () => {
    if (adding || !selected.size || destroyed) return;
    adding = true; sync();
    const chosen = [...selected].map(id => items.get(id));
    try {
      const channels = await saveSelected({type: "add", items: chosen});
      if (destroyed) return;
      // Saving must remain atomic; playback selection is handled by the viewer.
      const stored = new Set(channels.map(item => item.id));
      if (chosen.some(item => !stored.has(item.id))) throw new Error("선택한 채널을 모두 추가하지 못했습니다. 표시된 목록을 확인해 주세요.");
      savedIds = stored; selected.clear(); message(`${chosen.length}개 채널을 저장했습니다. 동시 재생은 최대 4개이며 방송 목록에서 선택합니다.`);
      onAdded(channels);
    } catch (error) { if (!destroyed) report(error); }
    finally { adding = false; if (!destroyed) sync(); }
  });
  sync(); void refreshSaved().catch(error => { if (!destroyed) report(error); });
  return {
    refreshSaved,
    destroy() { destroyed = true; stop(); for (const remove of listeners) remove(); },
  };
}
