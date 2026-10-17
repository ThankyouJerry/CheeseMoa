import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const LIMIT = 32 * 1024 * 1024;
const entries = ['manifest.json', 'LICENSE', 'assets/brand/cheesemoa-mark.svg', 'assets/icons', 'src'];
const fail = message => { throw new Error(`Store artifact rejected: ${message}`); };

// Inspect metadata before asking unzip to decompress anything. No archive paths are extracted.
function inspectZip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) fail('invalid ZIP end record');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count !== bytes.readUInt16LE(end + 8) || count === 65535 || count > 4096 || start + size !== end) fail('unsupported ZIP layout');
  const names = new Set(), result = [], ranges = [];
  let offset = start, total = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail('invalid ZIP directory');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20), length = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42), mode = bytes.readUInt32LE(offset + 38) >>> 16;
    if (offset + 46 + nameLength + extra + comment > end) fail('truncated ZIP directory');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const directory = name.endsWith('/'), components = (directory ? name.slice(0, -1) : name).split('/');
    if (!/^[A-Za-z0-9_./-]+$/.test(name) || components.some(p => !p || p === '.' || p === '..') || names.has(name)) fail('unsafe or duplicate ZIP path');
    names.add(name);
    const kind = mode & 0xf000;
    if ((kind && kind !== (directory ? 0x4000 : 0x8000)) || (flags & ~0x0800) || ![0, 8].includes(method) || bytes.readUInt16LE(offset + 34)) fail('unsupported ZIP entry type');
    if (length > LIMIT || (total += length) > LIMIT || (directory && length)) fail('ZIP expansion limit');
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) fail('invalid local ZIP entry');
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    if (local + 30 + localNameLength + localExtra + compressed > start || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || !bytes.subarray(local + 30, local + 30 + localNameLength).equals(Buffer.from(name))) fail('inconsistent ZIP entry');
    if (bytes.readUInt32LE(local + 14) !== bytes.readUInt32LE(offset + 16) || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== length) fail('inconsistent ZIP sizes or CRC');
    ranges.push([local, local + 30 + localNameLength + localExtra + compressed]);
    result.push({ name, directory, length });
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end) fail('unexpected ZIP directory data');
  let localEnd = 0;
  for (const [begin, finish] of ranges.sort((a, b) => a[0] - b[0])) {
    if (begin !== localEnd) fail('overlapping or hidden ZIP data');
    localEnd = finish;
  }
  if (localEnd !== start) fail('unlisted ZIP data');
  return result;
}

export async function verifyArtifact({ artifactPath, expectedSha256, root = fileURLToPath(new URL('../', import.meta.url)) }) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 || '')) fail('expected SHA-256 is required');
  const stat = await lstat(artifactPath);
  if (!stat.isFile() || stat.size > LIMIT) fail('invalid artifact file or size');
  const bytes = await readFile(artifactPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha256.toLowerCase()) fail('SHA-256 mismatch');
  const archive = inspectZip(bytes), files = new Map(), directories = new Set();
  async function collect(name) {
    const stat = await lstat(join(root, name));
    if (stat.isSymbolicLink()) fail('checkout symlink');
    if (stat.isDirectory()) {
      directories.add(`${name}/`);
      for (const child of await readdir(join(root, name))) await collect(`${name}/${child}`);
    } else if (stat.isFile()) files.set(name, await readFile(join(root, name)));
    else fail('unsupported checkout entry');
  }
  for (const entry of [...entries, 'package.json', 'package-lock.json', 'scripts/build-power-page.mjs']) {
    const parts = entry.split('/');
    for (let i = 1; i <= parts.length; i++) {
      if ((await lstat(join(root, ...parts.slice(0, i)))).isSymbolicLink()) fail('checkout symlink');
    }
    if (entries.includes(entry)) await collect(entry);
  }
  const manifest = JSON.parse(files.get('manifest.json').toString());
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  if (manifest.name !== '치즈모아 - CheeseMoa' || pkg.name !== 'cheesemoa' || lock.name !== pkg.name || lock.packages?.['']?.name !== pkg.name || manifest.manifest_version !== 3) fail('project identity mismatch');
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || manifest.version !== pkg.version || lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) fail('version mismatch');
  const temp = await mkdtemp(join(tmpdir(), 'cheesemoa-artifact-'));
  try {
    const frozenZip = join(temp, 'artifact.zip');
    await writeFile(frozenZip, bytes);
    const seen = new Set();
    for (const entry of archive) {
      if (entry.directory) { if (!directories.has(entry.name)) fail('unexpected ZIP directory'); continue; }
      const expected = files.get(entry.name);
      if (!expected || entry.length !== expected.length) fail('unexpected or changed ZIP file');
      let actual;
      try { actual = execFileSync('unzip', ['-p', frozenZip, entry.name], { maxBuffer: LIMIT, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch { fail('ZIP integrity check failed'); }
      if (!actual.equals(expected)) fail('ZIP contents differ from checkout');
      seen.add(entry.name);
    }
    if (seen.size !== files.size) fail('missing ZIP files');
    for (const [name, contents] of files) {
      await mkdir(dirname(join(temp, name)), { recursive: true });
      await writeFile(join(temp, name), contents);
    }
    await mkdir(join(temp, 'scripts'));
    await writeFile(join(temp, 'scripts/build-power-page.mjs'), await readFile(join(root, 'scripts/build-power-page.mjs')));
    execFileSync(process.execPath, [join(temp, 'scripts/build-power-page.mjs')], { timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!(await readFile(join(temp, 'src/viewer/power-page.js'))).equals(files.get('src/viewer/power-page.js'))) fail('generated bundle is stale');
    return { bytes, sha256, version: pkg.version };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { sha256, version } = await verifyArtifact({ artifactPath: process.argv[2], expectedSha256: process.argv[3] });
    console.log(JSON.stringify({ sha256, version }));
  } catch { console.error('Store artifact verification failed. Check the artifact, expected digest and checkout.'); process.exitCode = 1; }
}
