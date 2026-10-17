import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'ThankyouJerry/CheeseMoa';
export async function checkStoreApproval({ config, repository, ref, mode, get }) {
  if (repository !== REPOSITORY || config.repository !== REPOSITORY || ref !== 'refs/heads/main') throw new Error('Only CheeseMoa main is permitted');
  if (!['upload', 'submit'].includes(mode)) throw new Error('Invalid release mode');
  if (config.verified !== true || !/^[A-Za-z0-9-]+$/.test(config.reviewerLogin || '') || !config.publisherId || !config.itemId) throw new Error('Verified store identity and explicit reviewer are required');
  for (const name of mode === 'submit' ? ['cws-upload', 'cws-submit'] : ['cws-upload']) {
    const base = `/repos/${REPOSITORY}/environments/${name}`;
    const environment = await get(base);
    const rule = environment.protection_rules?.find(rule => rule.type === 'required_reviewers');
    if (environment.name !== name || environment.can_admins_bypass !== false || rule?.prevent_self_review !== true || !Array.isArray(rule.reviewers) || rule.reviewers.length !== 1 || rule.reviewers[0].type !== 'User' || rule.reviewers[0].reviewer?.login !== config.reviewerLogin) throw new Error(`Unsafe approval policy: ${name}`);
    const policy = environment.deployment_branch_policy;
    if (policy?.custom_branch_policies === true && policy.protected_branches === false) {
      const branches = await get(`${base}/deployment-branch-policies?per_page=100`);
      if (branches.total_count !== 1 || branches.branch_policies?.length !== 1 || branches.branch_policies[0].name !== 'main' || branches.branch_policies[0].type !== 'branch') throw new Error(`Only main branch may deploy: ${name}`);
    } else if (policy?.protected_branches === true && policy.custom_branch_policies === false) {
      const branch = await get(`/repos/${REPOSITORY}/branches/main`);
      if (branch.name !== 'main' || branch.protected !== true) throw new Error('Main branch protection is not verified');
    } else throw new Error(`Missing branch restrictions: ${name}`);
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(await readFile('config/chrome-web-store.json', 'utf8'));
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error('Read-only GitHub token required');
    await checkStoreApproval({ config, repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, mode: process.argv[2], get: async path => {
      const response = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error(`Approval policy lookup failed (HTTP ${response.status})`);
      return response.json();
    } });
    console.log('Approval and branch restrictions verified');
  } catch (error) { console.error('Store approval policy verification failed; confirm environment protections and read access.'); process.exitCode = 1; }
}
