import { bindPopupPower } from "./popup-power.js";
import { createDisplayName, parseChzzkUrls } from "../shared/chzzk-url.js";
import { loadChannels, updateChannels, subscribeChannels } from "../shared/storage.js";
import { openViewerTab } from "../shared/open-viewer.js";
import { bindLoginCheck } from "../shared/login-session.js";

const input = document.querySelector("#url-input");
const message = document.querySelector("#message");
const addButton = document.querySelector("#add-button");
const openButton = document.querySelector("#open-button");
const loginButton = document.querySelector("#login-button");
const savedList = document.querySelector("#saved-list");
const savedCount = document.querySelector("#saved-count");
savedList.tabIndex = 0;
savedList.setAttribute("role", "region");
savedList.setAttribute("aria-label", "저장된 방송 목록, 스크롤 가능");

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
    label.title = label.textContent;
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
    if (!rejected.length) await openSiteViewer();
  } catch (error) { showMessage("저장 또는 탭 열기에 실패했습니다. 다시 시도해주세요.", true); }
  finally { addButton.disabled = false; }
});

openButton.addEventListener("click", () => openViewer().catch(() => showMessage("멀티뷰 탭을 열지 못했습니다.", true)));
bindLoginCheck(loginButton);

subscribeChannels((nextChannels) => { channels = nextChannels; render(); });
try { channels = await loadChannels(); }
catch { showMessage("목록을 불러오지 못했습니다. 팝업을 다시 열어주세요.", true); }
render();

bindPopupPower(() => channels);

const siteViewButton = document.querySelector("#site-view-button");
const siteViewStatus = document.querySelector("#site-view-status");
const siteHostReady = globalThis.chrome?.runtime?.getManifest?.().content_scripts?.some(entry => entry.js?.includes("src/viewer/site-host.js"));
if (!siteHostReady) {
  siteViewButton.disabled = true;
  siteViewStatus.textContent = "새 멀티뷰는 확장을 다시 로드한 뒤 사용할 수 있습니다. 현재 방송·수집 중에는 다시 로드하지 마세요. 모은 통나무 조회는 지금 사용할 수 있습니다.";
}
async function openSiteViewer() {
  if (!siteHostReady) throw new Error("새 멀티뷰를 사용하려면 확장을 다시 로드해야 합니다.");
  await chrome.tabs.create({url:"https://chzzk.naver.com/lives#cheesemoa-multiview"});
  window.close();
}

siteViewButton.addEventListener("click", async () => {
  try {
    await openSiteViewer();
  } catch { siteViewStatus.textContent = "새 멀티뷰를 열지 못했습니다. 기존 방송과 수집기는 유지됩니다."; }
});
