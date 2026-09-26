// Runs only inside CHZZK frames. It measures the player without modifying playback.
(() => {
  if (window === window.top) return;
  const owner = `chrome-extension://${chrome.runtime.id}`;
  let timer;
  function report() {
    const videos = [...document.querySelectorAll("video")];
    const boxes = videos.map((video) => video.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    const box = boxes[0];
    window.parent.postMessage({ type: "cheesemoa-player-bounds", rect: box ? {
      x: box.x, y: box.y, width: box.width, height: box.height,
    } : null }, owner);
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== owner ||
        event.data?.type !== "cheesemoa-measure-player") return;
    clearInterval(timer);
    if (event.data.enabled === true) {
      report();
      timer = setInterval(report, 500);
    }
  });
  window.parent.postMessage({ type: "cheesemoa-player-ready" }, owner);
})();
