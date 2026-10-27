import { validateReleaseFiles } from './validate-release.mjs';
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.minimum_chrome_version, "116");
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "치즈모아 - CheeseMoa");
assert.deepEqual(manifest.host_permissions, ["https://chzzk.naver.com/*", "https://api.chzzk.naver.com/*", "https://comm-api.game.naver.com/*"]);
assert.deepEqual(manifest.permissions, ["storage"]);

const requiredFiles = [
  "src/vod/vod-tools.html", "src/vod/vod-tools.js", "src/vod/vod-tools.css",
  "src/vod/vod-frame.js", "src/vod/source.js", "src/vod/time.js",
  "src/vod/chat-api.js", "src/vod/chat-job.js", "src/vod/chat-store.js", "src/vod/chat-csv.js",
  "src/vod/note-model.js", "src/vod/note-store.js", "src/vod/note-player.js",
  manifest.action.default_popup,
  manifest.background.service_worker,
  "src/viewer/power-page.js",
  "src/background/power-coordinator.js",
  "src/viewer/viewer.html",
  "src/shared/storage.js",
  "src/shared/presets.js",
  "src/shared/channel-discovery.js",
  "src/viewer/audio-controller.js",
  "src/viewer/preset-panel.js",
  "src/viewer/discovery-panel.js",
  "src/shared/open-viewer.js",
  "src/shared/chzzk-url.js",
  "src/shared/channel-info.js",
  "src/shared/login-session.js",
  "src/shared/login-session.css",
  "src/shared/log-power.js",
  "src/shared/power-build.js",
  "src/shared/power-summary.js",
  "src/popup/popup-power.js",
  "src/viewer/site-host.js",
  "src/shared/power-collector.js",
  "src/shared/power-session.js",
  "src/viewer/power-panel.js",
  "src/shared/frame-layout.js",
  "src/viewer/viewer.js",
  "src/viewer/player-frame.js",
  "src/popup/popup.js",
  ...Object.values(manifest.icons),
];
await Promise.all(requiredFiles.map((file) => access(file)));

console.log(`CheeseMoa ${manifest.version}: manifest and ${requiredFiles.length} assets validated`);

await validateReleaseFiles();
