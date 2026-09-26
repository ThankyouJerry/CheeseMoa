import { createDisplayName, parseChzzkUrls } from "../shared/chzzk-url.js";
import { loadChannels, updateChannels, subscribeChannels } from "../shared/storage.js";
import { fitFrame } from "../shared/frame-layout.js";
import { loadChannelInfo, channelHeading } from "../shared/channel-info.js";

const grid = document.querySelector("#viewer-grid");
const emptyState = document.querySelector("#empty-state");
const template = document.querySelector("#viewer-card-template");
const sidebar = document.querySelector("#sidebar");
const scrim = document.querySelector("#scrim");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const loginButton = document.querySelector("#login-button");
const sidebarClose = document.querySelector("#sidebar-close");
const emptyAddButton = document.querySelector("#empty-add-button");
const input = document.querySelector("#url-input");
const addButton = document.querySelector("#add-button");
const message = document.querySelector("#message");
const channelList = document.querySelector("#channel-list");
const channelCount = document.querySelector("#channel-count");
const layoutButtons = [...document.querySelectorAll("[data-columns]")];

let channels = [];
let fixedColumns = 0;
try { fixedColumns = Number(localStorage.getItem("cheesemoa.columns")) || 0; } catch {}
if (![0, 1, 2, 3].includes(fixedColumns)) fixedColumns = 0;
const cards = new Map();
const playerViews = new WeakMap();
const channelInfo = new Map();

async function refreshChannelInfo(channel, card) {
  let info;
  try { info = await loadChannelInfo(channel); }
  catch { info = { name: "", title: "정보 조회 실패 · 재생은 계속됩니다" }; }
  if (cards.get(channel.id) !== card) return;
  channelInfo.set(channel.id, info);
  updateCardHeading(card, channels.find((item) => item.id === channel.id), channels.findIndex((item) => item.id === channel.id));
  renderSidebar();
  if (info.name) {
    try { await updateChannels({ type: "metadata", id: channel.id, streamerName: info.name }); }
    catch { showMessage("스트리머 이름을 저장하지 못했습니다. 현재 재생은 유지됩니다.", true); }
  }
}

function updateCardHeading(card, channel, index) {
  const heading = channelHeading(channel, index, channelInfo.get(channel.id));
  card.querySelector("strong").textContent = heading;
  card.querySelector("strong").title = heading;
  card.querySelector("iframe").title = heading;
}
function sizeFrame(target) {
    const width = target.clientWidth;
    const height = target.clientHeight;
    const fit = fitFrame(width, height);
    if (!fit) return;
    const iframe = target.querySelector("iframe");
    iframe.style.width = `${fit.width}px`;
    iframe.style.height = `${fit.height}px`;
    const rect = playerViews.get(iframe)?.rect;
    const scale = rect ? Math.min(width / rect.width, height / rect.height) : fit.scale;
    iframe.style.transform = `scale(${scale})`;
    iframe.style.left = rect ? `${(width - rect.width * scale) / 2 - rect.x * scale}px` : "0px";
    iframe.style.top = rect ? `${(height - rect.height * scale) / 2 - rect.y * scale}px` : "0px";
    iframe.style.clipPath = rect ? `inset(${rect.y}px ${fit.width - rect.x - rect.width}px ${fit.height - rect.y - rect.height}px ${rect.x}px)` : "none";
}
const frameObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
  for (const { target } of entries) sizeFrame(target);
});

window.addEventListener("message", (event) => {
  if (event.origin !== "https://chzzk.naver.com" || !["cheesemoa-player-bounds", "cheesemoa-player-ready"].includes(event.data?.type)) return;
  for (const card of cards.values()) {
    const iframe = card.querySelector("iframe");
    const state = playerViews.get(iframe);
    if (event.source !== iframe.contentWindow || !state) continue;
    if (event.data.type === "cheesemoa-player-ready") {
      iframe.contentWindow.postMessage({ type: "cheesemoa-measure-player", enabled: true }, "https://chzzk.naver.com");
      return;
    }
    const rect = event.data.rect;
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
      state.rect = null;
      sizeFrame(card.querySelector(".frame-wrap"));
      card.querySelector('[data-action="focus"]').title = "영상을 찾는 중입니다. 재생 후 다시 확인해주세요.";
      return;
    }
    state.rect = rect;
    card.querySelector('[data-action="focus"]').title = "이 칸의 원래 채널 화면으로 복원합니다";
    sizeFrame(card.querySelector(".frame-wrap"));
  }
});

function getAutoColumns(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

function setSidebar(open) {
  sidebar.classList.toggle("open", open);
  scrim.classList.toggle("open", open);
  sidebar.inert = !open;
  if (open) input.focus();
  else sidebarToggle.focus();
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function removeChannel(id) {
  try {
    await updateChannels({ type: "remove", id });
    channels = await loadChannels();
    render();
  } catch { showMessage("저장하지 못했습니다. 다시 시도해주세요.", true); }
}

function createCard(channel, index) {
  const card = template.content.firstElementChild.cloneNode(true);
  const title = card.querySelector("strong");
  const type = card.querySelector("header span");
  const iframe = card.querySelector("iframe");
  frameObserver?.observe(card.querySelector(".frame-wrap"));
  title.textContent = createDisplayName(channel, index);
  type.hidden = true;
  iframe.src = channel.url;
  iframe.title = `${title.textContent} CHZZK 플레이어`;
  const external = card.querySelector('[data-action="external"]');
  external.href = channel.url;

  card.querySelector('[data-action="focus"]').addEventListener("click", () => {
    const enabled = !playerViews.has(iframe);
    if (enabled) playerViews.set(iframe, { rect: null });
    else playerViews.delete(iframe);
    const button = card.querySelector('[data-action="focus"]');
    button.textContent = enabled ? "채널 화면 복원" : "칸 안 영상 확대";
    button.setAttribute("aria-pressed", String(enabled));
    button.title = enabled ? "영상 영역을 확인 중입니다. 반응이 없으면 확장 프로그램과 페이지를 새로고침해주세요." : "이 칸의 영상만 확대합니다";
    iframe.contentWindow.postMessage({ type: "cheesemoa-measure-player", enabled }, "https://chzzk.naver.com");
    sizeFrame(card.querySelector(".frame-wrap"));
  });
  iframe.addEventListener("load", () => {
    if (playerViews.has(iframe)) {
      playerViews.get(iframe).rect = null;
      sizeFrame(card.querySelector(".frame-wrap"));
      iframe.contentWindow.postMessage({ type: "cheesemoa-measure-player", enabled: true }, "https://chzzk.naver.com");
    }
  });

  card.querySelector('[data-action="reload"]').addEventListener("click", () => {
    iframe.src = channel.url;
    refreshChannelInfo(channel, card);
  });
  card.querySelector('[data-action="fullscreen"]').addEventListener("click", () => {
    card.requestFullscreen().catch(() => {
      setSidebar(true);
      showMessage("전체화면을 열지 못했습니다. 다시 시도해주세요.", true);
    });
  });
  card.querySelector('[data-action="remove"]').addEventListener("click", () => {
    removeChannel(channel.id);
  });
  return card;
}

function renderSidebar() {
  channelCount.textContent = `${channels.length}개`;
  channelList.replaceChildren();
  channels.forEach((channel, index) => {
    const row = document.createElement("div");
    row.className = "channel-row";
    const dot = document.createElement("i");
    const label = document.createElement("span");
    const remove = document.createElement("button");
    const rename = document.createElement("button");
    label.textContent = channelHeading(channel, index, channelInfo.get(channel.id));
    label.title = label.textContent;
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${label.textContent} 제거`);
    remove.addEventListener("click", () => removeChannel(channel.id));
    rename.textContent = "이름";
    rename.setAttribute("aria-label", `${label.textContent} 이름 변경`);
    rename.addEventListener("click", async () => {
      const name = window.prompt("방송 이름 (최대 60자, 비우면 기본 이름)", channel.name || "");
      if (name === null) return;
      try {
        await updateChannels({ type: "rename", id: channel.id, name });
        channels = await loadChannels();
        render();
      } catch { showMessage("이름을 저장하지 못했습니다.", true); }
    });
    row.append(dot, label, rename, remove);
    channelList.append(row);
  });
}

function render() {
  const ids = new Set(channels.map((channel) => channel.id));
  for (const [id, card] of cards) {
    if (!ids.has(id)) {
      frameObserver?.unobserve(card.querySelector(".frame-wrap"));
      card.remove(); cards.delete(id);
      channelInfo.delete(id);
    }
  }
  channels.forEach((channel, index) => {
    let card = cards.get(channel.id);
    if (!card) {
      card = createCard(channel, index);
      cards.set(channel.id, card);
      grid.append(card);
      refreshChannelInfo(channel, card);
    }
    updateCardHeading(card, channel, index);
  });
  const isEmpty = channels.length === 0;
  emptyState.hidden = !isEmpty;
  grid.hidden = isEmpty;
  const columns = fixedColumns || getAutoColumns(channels.length);
  grid.style.setProperty("--columns", columns);
  grid.style.setProperty("--rows", Math.max(1, Math.ceil(channels.length / columns)));
  renderSidebar();
}

layoutButtons.forEach((button) => {
  button.addEventListener("click", () => {
    fixedColumns = Number(button.dataset.columns);
    layoutButtons.forEach((item) => item.classList.toggle("active", item === button));
    try { localStorage.setItem("cheesemoa.columns", String(fixedColumns)); }
    catch { setSidebar(true); showMessage("화면 배치를 저장하지 못했습니다.", true); }
    render();
  });
});

sidebarToggle.addEventListener("click", () => setSidebar(true));
loginButton.addEventListener("click", async () => {
  const url = "https://chzzk.naver.com/";
  if (typeof chrome !== "undefined" && chrome.tabs) await chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
});
sidebarClose.addEventListener("click", () => setSidebar(false));
emptyAddButton.addEventListener("click", () => setSidebar(true));
scrim.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (sidebar.classList.contains("open")) setSidebar(false);
  }
});

addButton.addEventListener("click", async () => {
  const { items, rejected } = parseChzzkUrls(input.value);
  if (items.length === 0) {
    showMessage("올바른 CHZZK 라이브 또는 다시보기 링크를 입력해 주세요.", true);
    return;
  }

  addButton.disabled = true;
  try {
    await updateChannels({ type: "add", items });
    channels = await loadChannels();
    input.value = rejected.join("\n");
    showMessage(rejected.length ? `인식하지 못한 링크 ${rejected.length}개는 입력란에 남겼습니다.` : "목록에 반영했습니다. 중복 링크는 제외됩니다.", rejected.length > 0);
    render();
  } catch { showMessage("저장하지 못했습니다. 입력은 유지됩니다. 다시 시도해주세요.", true); }
  finally { addButton.disabled = false; }
});

subscribeChannels((nextChannels) => {
  channels = nextChannels;
  render();
});

try { channels = await loadChannels(); }
catch { showMessage("목록을 불러오지 못했습니다. 새로고침해주세요.", true); }
render();
layoutButtons.forEach((button) => button.classList.toggle("active", Number(button.dataset.columns) === fixedColumns));
setSidebar(channels.length === 0);
