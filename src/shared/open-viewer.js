export async function openViewerTab() {
  return navigator.locks.request("cheesemoa.viewer", async () => {
    const url = chrome.runtime.getURL("src/viewer/viewer.html");
    const contexts = await chrome.runtime.getContexts({contextTypes: ["TAB"], documentUrls: [url]});
    const existing = contexts.find((context) => context.tabId >= 0);
    if (existing) {
      await chrome.tabs.update(existing.tabId, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else await chrome.tabs.create({ url });
  });
}
