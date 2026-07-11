import { createDisplayName, parseChzzkUrls } from "../shared/chzzk-url.js";
import { loadChannels, saveChannels } from "../shared/storage.js";

const input = document.querySelector("#url-input");
const message = document.querySelector("#message");
const addButton = document.querySelector("#add-button");
const openButton = document.querySelector("#open-button");
const savedList = document.querySelector("#saved-list");
const savedCount = document.querySelector("#saved-count");

let channels = [];

function render() {
  savedCount.textContent = `${channels.length}개`;
  openButton.disabled = channels.length === 0;
  savedList.replaceChildren();

  if (channels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "아직 저장된 방송이 없습니다.";
    savedList.append(empty);
    return;
  }

  channels.forEach((channel, index) => {
    const item = document.createElement("div");
    item.className = "saved-item";
    const dot = document.createElement("i");
    const label = document.createElement("span");
    label.textContent = createDisplayName(channel, index);
    item.append(dot, label);
    savedList.append(item);
  });
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

async function openViewer() {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.runtime) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/viewer/viewer.html") });
    window.close();
    return;
  }
  window.location.href = "../viewer/viewer.html";
}

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
  showMessage(rejected.length ? `${items.length}개 추가 · 인식하지 못한 링크 ${rejected.length}개` : `${items.length}개 방송을 추가했습니다.`);
  render();
  await openViewer();
});

openButton.addEventListener("click", openViewer);

channels = await loadChannels();
render();
