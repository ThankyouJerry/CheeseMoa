import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "치즈모아 - CheeseMoa");
assert.deepEqual(manifest.host_permissions, ["https://chzzk.naver.com/*"]);

const requiredFiles = [
  manifest.action.default_popup,
  "src/viewer/viewer.html",
  "rules/chzzk-frames.json",
  ...Object.values(manifest.icons),
];
await Promise.all(requiredFiles.map((file) => access(file)));

console.log(`CheeseMoa ${manifest.version}: manifest and ${requiredFiles.length} assets validated`);
