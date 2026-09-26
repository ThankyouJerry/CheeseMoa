import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.minimum_chrome_version, "116");
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "치즈모아 - CheeseMoa");
assert.deepEqual(manifest.host_permissions, ["https://chzzk.naver.com/*", "https://api.chzzk.naver.com/*"]);
assert.deepEqual(manifest.permissions, ["storage"]);

const requiredFiles = [
  manifest.action.default_popup,
  "src/viewer/viewer.html",
  "src/shared/storage.js",
  "src/shared/open-viewer.js",
  "src/shared/chzzk-url.js",
  "src/shared/channel-info.js",
  "src/shared/frame-layout.js",
  "src/viewer/viewer.js",
  "src/viewer/player-frame.js",
  "src/popup/popup.js",
  ...Object.values(manifest.icons),
];
await Promise.all(requiredFiles.map((file) => access(file)));

console.log(`CheeseMoa ${manifest.version}: manifest and ${requiredFiles.length} assets validated`);
