import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkStoreApproval } from '../scripts/check-store-approval.mjs';
const config = { repository: 'ThankyouJerry/CheeseMoa', verified: true, publisherId: 'publisher', itemId: 'a'.repeat(32), reviewerLogin: 'owner' };
function fixture(change = () => {}) {
  const environment = { name: 'cws-upload', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { login: 'owner' } }] }], deployment_branch_policy: { custom_branch_policies: true, protected_branches: false } };
  const branches = { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] };
  const branch = { name: 'main', protected: true };
  change({ environment, branches, branch });
  const paths = [];
  return { paths, args: { config, repository: config.repository, ref: 'refs/heads/main', mode: 'submit', get: async path => {
    paths.push(path);
    if (path.endsWith('/branches/main')) return branch;
    if (path.includes('deployment-branch-policies')) return branches;
    return { ...environment, name: path.endsWith('/cws-submit') ? 'cws-submit' : environment.name };
  } } };
}
test('approval gate verifies both exact environments and main-only policies', async () => {
  const { paths, args } = fixture();
  assert.equal(await checkStoreApproval(args), true);
  assert.equal(paths.length, 4);
  assert.ok(paths.some(p => p.endsWith('/cws-submit')));
});
for (const [name, change] of [
  ['administrator bypass', ({ environment }) => { environment.can_admins_bypass = true; }],
  ['unknown bypass policy', ({ environment }) => { delete environment.can_admins_bypass; }],
  ['self approval', ({ environment }) => { environment.protection_rules[0].prevent_self_review = false; }],
  ['missing required reviewer', ({ environment }) => { environment.protection_rules = []; }],
  ['wrong reviewer', ({ environment }) => { environment.protection_rules[0].reviewers[0].reviewer.login = 'other'; }],
  ['additional reviewer can approve alone', ({ environment }) => { environment.protection_rules[0].reviewers.push({ type: 'User', reviewer: { login: 'other' } }); }],
  ['team reviewer', ({ environment }) => { environment.protection_rules[0].reviewers[0].type = 'Team'; }],
  ['wildcard branch', ({ branches }) => { branches.branch_policies[0].name = '*'; }],
  ['tag named main', ({ branches }) => { branches.branch_policies[0].type = 'tag'; }],
  ['unknown branches', ({ branches }) => { delete branches.total_count; }],
  ['unrestricted branches', ({ environment }) => { environment.deployment_branch_policy = null; }],
]) test(`approval gate rejects ${name}`, async () => { await assert.rejects(checkStoreApproval(fixture(change).args)); });
for (const status of [403, 404, 500]) test(`approval lookup fails closed for HTTP ${status}`, async () => {
  const { args } = fixture();
  args.get = async () => { throw new Error(`HTTP ${status}`); };
  await assert.rejects(checkStoreApproval(args), new RegExp(String(status)));
});
test('protected-branch policy requires independently confirmed main protection', async () => {
  const { args } = fixture(({ environment }) => { environment.deployment_branch_policy = { protected_branches: true, custom_branch_policies: false }; });
  assert.equal(await checkStoreApproval(args), true);
  const bad = fixture(({ environment, branch }) => { environment.deployment_branch_policy = { protected_branches: true, custom_branch_policies: false }; branch.protected = false; });
  await assert.rejects(checkStoreApproval(bad.args));
});
for (const changes of [{ repository: 'other/CheeseMoa' }, { ref: 'refs/heads/feature' }, { mode: 'publish' }, { config: { ...config, verified: false } }, { config: { ...config, reviewerLogin: null } }]) test(`approval context rejects ${JSON.stringify(changes)}`, async () => {
  const { args, paths } = fixture();
  await assert.rejects(checkStoreApproval({ ...args, ...changes }));
  assert.equal(paths.length, 0);
});
test('store workflow has manual entry, pinned actions, immutable artifacts, no publish path', async () => {
  const source = await readFile(new URL('../.github/workflows/chrome-web-store.yml', import.meta.url), 'utf8');
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /default: dry-run/);
  assert.doesNotMatch(source, /^  (push|pull_request|schedule):/m);
  assert.match(source, /group: cheesemoa-chrome-web-store\n  cancel-in-progress: false/);
  assert.doesNotMatch(source, /contents: write|id-token: write|persist-credentials: true/);
  for (const [, action] of source.matchAll(/uses: (\S+)/g)) assert.match(action, /^actions\/[a-z-]+@[0-9a-f]{40}$/);
  assert.equal((source.match(/persist-credentials: false/g) || []).length, 3);
  assert.equal((source.match(/ref: \$\{\{ github.sha \}\}/g) || []).length, 3);
  assert.match(source, /npm ci --ignore-scripts/);
  assert.match(source, /artifact-ids: \$\{\{ needs.prepare.outputs.artifact_id \}\}/);
  assert.match(source, /artifact-ids: \$\{\{ needs.upload.outputs.receipt_id \}\}/);
  assert.match(source, /sha256sum --check --strict/);
  assert.match(source, /environment: cws-upload/);
  assert.match(source, /environment: cws-submit/);
  assert.match(source, /CWS_SUBMISSION_APPROVED: \$\{\{ needs.prepare.outputs.sha256 \}\}/);
  assert.doesNotMatch(source, /cws-api.mjs publish|chrome-webstore-upload-cli/);
  const preparation = source.split('\n  upload:')[0];
  assert.doesNotMatch(preparation, /secrets\./);
});
