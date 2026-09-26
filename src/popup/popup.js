import { createDisplayName, parseChzzkUrls } from "../shared/chzzk-url.js";
import { loadChannels, updateChannels, subscribeChannels } from "../shared/storage.js";
import { openViewerTab } from "../shared/open-viewer.js";

const input = document.querySelector("#url-input");
const message = document.querySelector("#message");
const addButton = document.querySelector("#add-button");
const openButton = document.querySelector("#open-button");
const loginButton = document.querySelector("#login-button");
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
    await openViewerTab();
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

  addButton.disabled = true;
  try {
    await updateChannels({ type: "add", items });
    channels = await loadChannels();
    input.value = rejected.join("\n");
    showMessage(rejected.length ? `인식하지 못한 링크 ${rejected.length}개는 입력란에 남겼습니다.` : "목록에 반영했습니다. 중복 링크는 제외됩니다.", rejected.length > 0);
    render();
    if (!rejected.length) await openViewer();
  } catch { showMessage("저장 또는 탭 열기에 실패했습니다. 다시 시도해주세요.", true); }
  finally { addButton.disabled = false; }
});

openButton.addEventListener("click", () => openViewer().catch(() => showMessage("멀티뷰 탭을 열지 못했습니다.", true)));
loginButton.addEventListener("click", async () => {
  const url = "https://chzzk.naver.com/";
  if (typeof chrome !== "undefined" && chrome.tabs) await chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
});

subscribeChannels((nextChannels) => { channels = nextChannels; render(); });
try { channels = await loadChannels(); }
catch { showMessage("목록을 불러오지 못했습니다. 팝업을 다시 열어주세요.", true); }
render();
