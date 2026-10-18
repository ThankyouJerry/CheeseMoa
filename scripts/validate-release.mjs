import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function validateRelease({ packageVersion, manifestVersion, notes, tag }) {
  assert.match(packageVersion, /^\d+\.\d+\.\d+$/, 'Package version must be a release version');
  assert.equal(manifestVersion, packageVersion, 'Manifest and package versions must match');
  const heading = notes.split(/\r?\n/).find(line => line.trim());
  assert.match(heading || '', /^# 치즈모아 v\d+\.\d+\.\d+(?:\s|$)/, 'Release notes must start with a versioned heading');
  const notesVersion = heading.match(/^# 치즈모아 v(\d+\.\d+\.\d+)(?:\s|$)/)[1];
  assert.equal(notesVersion, packageVersion, 'Release notes and package versions must match');
  if (tag !== undefined) assert.equal(tag, `v${packageVersion}`, 'Release tag and package versions must match');
}

export async function validateReleaseFiles({ tag } = {}) {
  const root = new URL('../', import.meta.url);
  const [pkg, manifest, notes] = await Promise.all([
    readFile(new URL('package.json', root), 'utf8'),
    readFile(new URL('manifest.json', root), 'utf8'),
    readFile(new URL('RELEASE_NOTES.md', root), 'utf8'),
  ]);
  validateRelease({ packageVersion: JSON.parse(pkg).version, manifestVersion: JSON.parse(manifest).version, notes, tag });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--tag' && args[1]), 'Usage: node scripts/validate-release.mjs [--tag vVERSION]');
    await validateReleaseFiles({ tag: args[1] });
    console.log('Release versions are consistent');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
