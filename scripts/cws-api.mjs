// Chrome Web Store API v2. No dependency and no publish-to-users operation.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyArtifact} from './verify-store-artifact.mjs';

export const REPOSITORY = 'ThankyouJerry/CheeseMoa';
const WORKFLOW = `${REPOSITORY}/.github/workflows/chrome-web-store.yml@refs/heads/main`;
const fail = code => { throw new Error(code); };
export function parseArgs(args) {
  const [mode, ...rest] = args;
  if (!['upload', 'submit'].includes(mode)) fail('CWS_EXPLICIT_MODE_REQUIRED');
  const out = {mode, execute: false};
  const names = {'--artifact':'artifactPath', '--sha256':'expectedSha256', '--receipt':'receiptPath', '--output':'outputPath'};
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (seen.has(flag)) fail('CWS_DUPLICATE_ARGUMENT');
    seen.add(flag);
    if (flag === '--execute' || flag === '--dry-run') {
      if (seen.has(flag === '--execute' ? '--dry-run' : '--execute')) fail('CWS_CONFLICTING_MODE');
      out.execute = flag === '--execute';
    } else if (names[flag] && rest[i + 1] && !rest[i + 1].startsWith('--')) out[names[flag]] = rest[++i];
    else fail('CWS_UNKNOWN_ARGUMENT');
  }
  if (!out.artifactPath || !/^[a-f0-9]{64}$/.test(out.expectedSha256 || '')) fail('CWS_ARTIFACT_AND_SHA_REQUIRED');
  return out;
}

export async function obtainAccessToken(env, fetchImpl = globalThis.fetch) {
  if (env.CWS_ACCESS_TOKEN) {
    if (/[\r\n]/.test(env.CWS_ACCESS_TOKEN)) fail('CWS_ACCESS_TOKEN_REQUIRED');
    return env.CWS_ACCESS_TOKEN;
  }
  if (!env.CWS_CLIENT_ID || !env.CWS_CLIENT_SECRET || !env.CWS_REFRESH_TOKEN) fail('CWS_CREDENTIALS_REQUIRED');
  try {
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({client_id:env.CWS_CLIENT_ID, client_secret:env.CWS_CLIENT_SECRET,
        refresh_token:env.CWS_REFRESH_TOKEN, grant_type:'refresh_token'})
    });
    if (!response.ok) throw new Error();
    const token = await response.json();
    if (typeof token.access_token !== 'string' || !token.access_token || /[\r\n]/.test(token.access_token) ||
        token.token_type?.toLowerCase() !== 'bearer' ||
        (token.scope !== undefined && (typeof token.scope !== 'string' || !token.scope.split(/\s+/).includes('https://www.googleapis.com/auth/chromewebstore')))) throw new Error();
    return token.access_token;
  } catch { fail('CWS_TOKEN_EXCHANGE_FAILED'); }
}

export async function runRelease({mode, execute = false, config, artifactPath, expectedSha256, root,
  receipt, env = process.env, fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), verify = verifyArtifact}) {
  if (!['upload','submit'].includes(mode)) fail('CWS_EXPLICIT_MODE_REQUIRED');
  if (typeof execute !== 'boolean') fail('CWS_INVALID_EXECUTE');
  if (config?.repository !== REPOSITORY) fail('CWS_REPOSITORY_DENIED');
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '')) fail('CWS_SHA_REQUIRED');
  const artifact = await verify({artifactPath, expectedSha256, root});
  if (artifact.sha256 !== expectedSha256) fail('CWS_SHA_MISMATCH');
  const targetReady = config.verified === true && /^[A-Za-z0-9_-]{1,128}$/.test(config.publisherId || '') && /^[a-p]{32}$/.test(config.itemId || '');
  const binding = {repository: REPOSITORY, publisherId: config.publisherId, itemId: config.itemId,
    sha256: artifact.sha256, version: artifact.version};
  if (!execute) return {...binding, mode, dryRun: true, targetVerified: targetReady, networkRequests: 0};
  if (!targetReady) fail('CWS_TARGET_NOT_VERIFIED');
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_WORKFLOW_REF !== WORKFLOW ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) fail('CWS_EXECUTION_CONTEXT_DENIED');
  if (mode === 'submit') {
    if (env.CWS_SUBMISSION_APPROVED !== artifact.sha256) fail('CWS_SUBMISSION_APPROVAL_REQUIRED');
    if (!receipt || receipt.operation !== 'upload' || receipt.uploadState !== 'UPLOAD_SUCCESS' ||
        receipt.versionVerified !== true || Object.entries(binding).some(([k,v]) => receipt[k] !== v)) fail('CWS_UPLOAD_RECEIPT_MISMATCH');
  }
  const accessToken = await obtainAccessToken(env, fetchImpl);
  const name = `publishers/${config.publisherId}/items/${config.itemId}`;
  async function request(path, method, body, type) {
    // Never retry a mutation: timeouts may mean the server already accepted it.
    let response;
    try {
      response = await fetchImpl(`https://chromewebstore.googleapis.com/${path}`, {
        method, headers: {Authorization: `Bearer ${accessToken}`, ...(type ? {'Content-Type': type} : {})},
        body, redirect: 'error', signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) fail('HTTP');
      const data = await response.json();
      if (data?.name !== name || data?.itemId !== config.itemId) fail('IDENTITY');
      return data;
    } catch {
      // Intentionally discard server bodies and underlying exceptions (may contain credentials).
      fail(method === 'POST' ? 'CWS_MUTATION_UNCONFIRMED_CHECK_DASHBOARD' : 'CWS_STATUS_UNCONFIRMED');
    }
  }
  const uploaded = await request(`upload/v2/${name}:upload`, 'POST', artifact.bytes, 'application/zip');
  let state = uploaded.uploadState;
  if (!['UPLOAD_SUCCESS','UPLOAD_IN_PROGRESS'].includes(state)) fail('CWS_UPLOAD_FAILED_CHECK_DASHBOARD');
  if (state === 'UPLOAD_SUCCESS' && uploaded.crxVersion !== artifact.version) fail('CWS_UPLOADED_VERSION_MISMATCH');
  const versionVerified = state === 'UPLOAD_SUCCESS';
  for (let attempt = 0; state === 'UPLOAD_IN_PROGRESS' && attempt < 6; attempt++) {
    await sleep(5000);
    const status = await request(`v2/${name}:fetchStatus`, 'GET');
    state = status.lastAsyncUploadState;
    if (!['UPLOAD_SUCCESS','UPLOAD_IN_PROGRESS'].includes(state)) fail('CWS_UPLOAD_FAILED_CHECK_DASHBOARD');
  }
  if (state !== 'UPLOAD_SUCCESS') fail('CWS_UPLOAD_PENDING_CHECK_DASHBOARD');
  const result = {...binding, operation: 'upload', uploadState: state, versionVerified, commit: env.GITHUB_SHA};
  if (mode === 'upload') return result;
  // fetchStatus has no draft digest/version field. Never infer draft version from an older submitted revision.
  if (!versionVerified) fail('CWS_ASYNC_VERSION_UNVERIFIED_NO_SUBMISSION');
  // Reupload above binds our bytes immediately before submission; API v2 offers no atomic digest/CAS guard.
  const submitted = await request(`v2/${name}:publish`, 'POST', JSON.stringify({
    publishType: 'STAGED_PUBLISH', skipReview: false, blockOnWarnings: true
  }), 'application/json');
  if (!['PENDING_REVIEW','STAGED'].includes(submitted.state)) fail('CWS_SUBMISSION_STATE_UNCONFIRMED_CHECK_DASHBOARD');
  return {...result, operation: 'submit', state: submitted.state, publishType: 'STAGED_PUBLISH'};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = JSON.parse(await readFile(resolve(root, 'config/chrome-web-store.json'), 'utf8'));
  const receipt = options.receiptPath ? JSON.parse(await readFile(options.receiptPath, 'utf8')) : undefined;
  const result = await runRelease({...options, root, config, receipt});
  const output = JSON.stringify(result, null, 2) + '\n';
  if (options.outputPath) await writeFile(options.outputPath, output, {mode: 0o600});
  process.stdout.write(output);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(/^CWS_[A-Z_]+$/.test(error.message) ? error.message : 'CWS_LOCAL_VALIDATION_FAILED'); process.exitCode = 1; });
}
