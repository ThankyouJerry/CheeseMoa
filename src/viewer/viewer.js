import { createDisplayName, parseChzzkUrls } from "../shared/chzzk-url.js";
import { loadChannels, updateChannels, subscribeChannels } from "../shared/storage.js";

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
  title.textContent = createDisplayName(channel, index);
  type.textContent = channel.typeLabel;
  iframe.src = channel.url;
  iframe.title = `${title.textContent} CHZZK 플레이어`;
  const external = card.querySelector('[data-action="external"]');
  external.href = channel.url;

  card.querySelector('[data-action="reload"]').addEventListener("click", () => {
    iframe.src = channel.url;
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
    label.textContent = createDisplayName(channel, index);
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
    if (!ids.has(id)) { card.remove(); cards.delete(id); }
  }
  channels.forEach((channel, index) => {
    let card = cards.get(channel.id);
    if (!card) {
      card = createCard(channel, index);
      cards.set(channel.id, card);
      grid.append(card);
    }
    card.querySelector("strong").textContent = createDisplayName(channel, index);
    card.querySelector("iframe").title = `${createDisplayName(channel, index)} CHZZK 플레이어`;
  });
  const isEmpty = channels.length === 0;
  emptyState.hidden = !isEmpty;
  grid.hidden = isEmpty;
  grid.style.setProperty("--columns", fixedColumns || getAutoColumns(channels.length));
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
  if (event.key === "Escape") setSidebar(false);
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
