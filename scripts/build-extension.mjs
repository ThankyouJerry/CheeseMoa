import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const distDir = join(root, "dist");
const folderName = `CheeseMoa-v${version}`;
const unpackedDir = join(distDir, folderName);
const zipPath = join(distDir, `${folderName}.zip`);

const packageEntries = [
  "manifest.json",
  "LICENSE",
  "assets/brand/cheesemoa-mark.svg",
  "assets/icons",
  "src",
];

await rm(distDir, { recursive: true, force: true });
await mkdir(unpackedDir, { recursive: true });

for (const entry of packageEntries) {
  await cp(join(root, entry), join(unpackedDir, entry), { recursive: true });
}

const manifest = JSON.parse(await readFile(join(unpackedDir, "manifest.json"), "utf8"));
if (manifest.version !== version) {
  throw new Error(`Version mismatch: package ${version}, manifest ${manifest.version}`);
}

execFileSync("zip", ["-q", "-r", zipPath, ...packageEntries], { cwd: unpackedDir });

const zipBytes = await readFile(zipPath);
const checksum = createHash("sha256").update(zipBytes).digest("hex");
await writeFile(join(distDir, "SHA256SUMS.txt"), `${checksum}  ${basename(zipPath)}\n`);

console.log(`Built ${zipPath}`);
console.log(`Unpacked ${unpackedDir}`);
console.log(`SHA-256 ${checksum}`);
