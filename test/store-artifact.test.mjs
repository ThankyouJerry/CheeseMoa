import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyArtifact } from '../scripts/verify-store-artifact.mjs';
const source = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'cheesemoa-verify-test-'));
  try {
    for (const entry of ['manifest.json', 'package.json', 'package-lock.json', 'LICENSE', 'assets', 'src', 'scripts']) await cp(join(source, entry), join(root, entry), { recursive: true });
    const artifactPath = join(root, 'release.zip');
    const zip = () => execFileSync('zip', ['-q', '-r', artifactPath, 'manifest.json', 'LICENSE', 'assets/brand/cheesemoa-mark.svg', 'assets/icons', 'src'], { cwd: root });
    zip();
    const verify = async () => verifyArtifact({ root, artifactPath, expectedSha256: hash(await readFile(artifactPath)) });
    await fn({ root, artifactPath, verify });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('store artifact: exact package is accepted and returns the verified bytes', () => fixture(async ({ artifactPath, verify }) => {
  const result = await verify();
  assert.equal(result.sha256, hash(await readFile(artifactPath)));
  assert.deepEqual(result.bytes, await readFile(artifactPath));
  assert.equal(result.version, JSON.parse(await readFile(join(source, 'package.json'))).version);
}));

test('store artifact: checksum required and wrong digest rejected before upload', () => fixture(async ({ root, artifactPath }) => {
  await assert.rejects(verifyArtifact({ root, artifactPath }), /SHA-256 is required/);
  await assert.rejects(verifyArtifact({ root, artifactPath, expectedSha256: '0'.repeat(64) }), /SHA-256 mismatch/);
}));

test('store artifact: changed source or manifest in archive is rejected', () => fixture(async ({ root, artifactPath, verify }) => {
  const original = await readFile(join(root, 'manifest.json'));
  await writeFile(join(root, 'manifest.json'), Buffer.concat([original, Buffer.from(' ')]));
  execFileSync('zip', ['-q', artifactPath, 'manifest.json'], { cwd: root });
  await writeFile(join(root, 'manifest.json'), original);
  await assert.rejects(verify(), /changed ZIP file/);
}));

test('store artifact: extra files are rejected', () => fixture(async ({ root, artifactPath, verify }) => {
  await writeFile(join(root, 'secret.txt'), 'not a secret, test fixture');
  execFileSync('zip', ['-q', artifactPath, 'secret.txt'], { cwd: root });
  await assert.rejects(verify(), /unexpected or changed ZIP file/);
}));

test('store artifact: lock version mismatch is rejected', () => fixture(async ({ root, verify }) => {
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json')));
  lock.packages[''].version = '99.0.0';
  await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
  await assert.rejects(verify(), /version mismatch/);
}));

test('store artifact: stale generated bundle is rejected even if ZIP matches checkout', () => fixture(async ({ root, artifactPath, verify }) => {
  await writeFile(join(root, 'src/viewer/power-page.js'), '// stale bundle\n');
  execFileSync('zip', ['-q', artifactPath, 'src/viewer/power-page.js'], { cwd: root });
  await assert.rejects(verify(), /generated bundle is stale/);
}));

// Invalid metadata must be rejected before unzip sees these entries.
function metadataZip(names, mode = 0o100644) {
  const local = [], central = [];
  let offset = 0;
  for (const name of names) {
    const n = Buffer.from(name), l = Buffer.alloc(30), c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50); l.writeUInt16LE(20, 4); l.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(n.length, 28); c.writeUInt32LE((mode * 65536) >>> 0, 38); c.writeUInt32LE(offset, 42);
    local.push(l, n); central.push(c, n); offset += l.length + n.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}
for (const [label, bytes, error] of [
  ['traversal', metadataZip(['../manifest.json']), /unsafe/],
  ['duplicate', metadataZip(['manifest.json', 'manifest.json']), /duplicate/],
  ['symlink', metadataZip(['manifest.json'], 0o120777), /entry type/],
  ['invalid ZIP', Buffer.from('not a zip'), /invalid ZIP/],
]) test(`store artifact: ${label} is rejected`, () => fixture(async ({ artifactPath, verify }) => {
  await writeFile(artifactPath, bytes);
  await assert.rejects(verify(), error);
}));

test('store artifact: same-size changed source bytes are rejected', () => fixture(async ({ root, artifactPath, verify }) => {
  const name = 'src/shared/power-build.js';
  const original = await readFile(join(root, name));
  const changed = Buffer.from(original); changed[0] ^= 1;
  await writeFile(join(root, name), changed);
  execFileSync('zip', ['-q', artifactPath, name], { cwd: root });
  await writeFile(join(root, name), original);
  await assert.rejects(verify(), /contents differ/);
}));

test('store artifact: missing packaged files are rejected', () => fixture(async ({ artifactPath, verify }) => {
  execFileSync('zip', ['-q', '-d', artifactPath, 'LICENSE']);
  await assert.rejects(verify(), /missing ZIP files/);
}));
