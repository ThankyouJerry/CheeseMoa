import { createDisplayName, parseChzzkUrls } from "../shared/chzzk-url.js";
import { loadChannels, saveChannels, subscribeChannels } from "../shared/storage.js";

const grid = document.querySelector("#viewer-grid");
const emptyState = document.querySelector("#empty-state");
const template = document.querySelector("#viewer-card-template");
const sidebar = document.querySelector("#sidebar");
const scrim = document.querySelector("#scrim");
const sidebarToggle = document.querySelector("#sidebar-toggle");
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

function getAutoColumns(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

function setSidebar(open) {
  sidebar.classList.toggle("open", open);
  scrim.classList.toggle("open", open);
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function removeChannel(id) {
  channels = channels.filter((channel) => channel.id !== id);
  await saveChannels(channels);
  render();
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

  card.querySelector('[data-action="reload"]').addEventListener("click", () => {
    iframe.src = channel.url;
  });
  card.querySelector('[data-action="fullscreen"]').addEventListener("click", () => {
    card.requestFullscreen();
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
    label.textContent = createDisplayName(channel, index);
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${label.textContent} 제거`);
    remove.addEventListener("click", () => removeChannel(channel.id));
    row.append(dot, label, remove);
    channelList.append(row);
  });
}

function render() {
  grid.replaceChildren(...channels.map(createCard));
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
    render();
  });
});

sidebarToggle.addEventListener("click", () => setSidebar(true));
sidebarClose.addEventListener("click", () => setSidebar(false));
emptyAddButton.addEventListener("click", () => setSidebar(true));
scrim.addEventListener("click", () => setSidebar(false));

addButton.addEventListener("click", async () => {
  const { items, rejected } = parseChzzkUrls(input.value);
  if (items.length === 0) {
    showMessage("올바른 CHZZK 라이브 또는 다시보기 링크를 입력해 주세요.", true);
    return;
  }

  const merged = new Map(channels.map((channel) => [channel.id, channel]));
  items.forEach((item) => merged.set(item.id, item));
  channels = [...merged.values()];
  await saveChannels(channels);
  input.value = "";
  showMessage(rejected.length ? `${items.length}개 추가 · 인식 실패 ${rejected.length}개` : `${items.length}개 방송을 추가했습니다.`);
  render();
});

subscribeChannels((nextChannels) => {
  channels = nextChannels;
  render();
});

channels = await loadChannels();
render();
if (channels.length === 0) setSidebar(true);
