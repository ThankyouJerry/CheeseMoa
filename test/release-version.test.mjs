import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateRelease, validateReleaseFiles } from '../scripts/validate-release.mjs';

const valid = { packageVersion: '0.1.15', manifestVersion: '0.1.15', notes: '# 치즈모아 v0.1.15\n\nNotes', tag: 'v0.1.15' };
test('matching release metadata passes, including CRLF and leading blank lines', () => {
  validateRelease(valid);
  validateRelease({ ...valid, notes: '\r\n# 치즈모아 v0.1.15 — 준비\r\n' });
});
for (const [label, patch] of [
  ['manifest', { manifestVersion: '0.1.6' }],
  ['stale notes', { notes: '# 치즈모아 v0.1.6\n' }],
  ['missing notes heading', { notes: 'Text mentions v0.1.15\n# 치즈모아 v0.1.15' }],
  ['missing notes', { notes: '' }],
  ['extra version component', { notes: '# 치즈모아 v0.1.15.1' }],
  ['different tag', { tag: 'v0.1.16' }],
  ['missing v prefix', { tag: '0.1.15' }],
  ['empty tag', { tag: '' }],
  ['non-version tag', { tag: 'version-next' }],
  ['prerelease tag', { tag: 'v0.1.15-beta' }],
]) test(`rejects ${label}`, () => assert.throws(() => validateRelease({ ...valid, ...patch })));
test('ordinary validation requires notes consistency without a tag', () => {
  const { tag, ...metadata } = valid;
  validateRelease(metadata);
  assert.throws(() => validateRelease({ ...metadata, notes: '# 치즈모아 v0.1.6' }));
});
test('repository metadata is consistent', async () => { await validateReleaseFiles(); });
test('CLI rejects missing/invalid tag and unexpected arguments', () => {
  for (const args of [['--tag'], ['--tag', ''], ['--tag', 'v0.0.0'], ['--unknown'], ['--tag', 'v0.1.15', 'extra']]) {
    const result = spawnSync(process.execPath, ['scripts/validate-release.mjs', ...args], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
    assert.equal(result.status, 1, JSON.stringify(args));
  }
});
test('publishing checks the actual tag before building or releasing', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const guard = workflow.indexOf('node scripts/validate-release.mjs --tag "$GITHUB_REF_NAME"');
  assert.ok(guard > 0);
  assert.ok(guard < workflow.indexOf('npm run build'));
  assert.ok(guard < workflow.indexOf('gh release create'));
  const validate = await readFile(new URL('../scripts/validate.mjs', import.meta.url), 'utf8');
  assert.match(validate, /await validateReleaseFiles\(\)/);
});
