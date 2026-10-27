import test from 'node:test';
import assert from 'node:assert/strict';
import {collectWatchUiReward} from '../src/shared/watch-ui-claim.js';

const channelId = 'a'.repeat(32);
const reward = {claimId: 'requested-hour', claimType: 'WATCH_1_HOUR', state: 'COMPLIED', saveType: 'ACTIVE', amount: 100};
const otherHour = {...reward, claimId: 'other-hour'};

function harness(claims) {
  let clicks = 0, requests = 0;
  const button = {disabled: false, className: 'live_chatting_power_button__mock',
    textContent: '통나무 파워 받기', title: '', parentElement: null,
    getAttribute: () => null, getClientRects: () => [{}], click: () => clicks++};
  const doc = {URL: `https://chzzk.naver.com/live/${channelId}`,
    querySelector: () => ({querySelectorAll: () => [button]})};
  return {
    get clicks() { return clicks; }, get requests() { return requests; },
    options: {channelId, claimId: reward.claimId, getDocument: () => doc,
      isPlaying: () => true, isEnabled: () => true, wait: async () => {}, now: () => 12345,
      fetcher: async (_url, options) => {
        assert.equal(options.method, 'GET', 'hourly collection must not send PUT');
        requests++;
        // These observations could otherwise falsely attribute an ambiguous button to the requested claim.
        return new Response(JSON.stringify({code: 200, content: {active: true,
          amount: clicks ? 200 : 100,
          claims: clicks ? claims.filter(claim => claim.claimId !== reward.claimId) : claims}}));
      }},
  };
}

for (const [name, claims] of [
  ['requested first', [reward, otherHour]],
  ['requested second', [otherHour, reward]],
  ['three hourly rewards', [reward, otherHour, {...reward, claimId: 'third-hour'}]],
]) test(`one visible button cannot identify multiple eligible hourly rewards: ${name}`, async () => {
  const h = harness(claims);
  await assert.rejects(collectWatchUiReward(h.options), error => {
    assert.equal(error.code, 'POWER_WATCH_UI_WAIT');
    assert.equal(error.mutationDispatched, false);
    assert.equal(error.method, 'GET');
    assert.equal(error.phase, 'eligibility');
    assert.equal(error.retryable, true);
    assert.equal(error.status, 0);
    return true;
  });
  assert.equal(h.clicks, 0);
  assert.equal(h.requests, 1);
});

test('a sole hourly reward with another claim ID remains unavailable without clicking', async () => {
  const h = harness([otherHour]);
  await assert.rejects(collectWatchUiReward(h.options), error =>
    error.code === 'WATCH_ALREADY_UNAVAILABLE' && error.status === 409 && error.mutationDispatched === false);
  assert.equal(h.clicks, 0);
  assert.equal(h.requests, 1);
});

for (const [name, extras] of [
  ['alone', []],
  ['with eligible non-hour rewards', [
    {...reward, claimId: 'five-minutes', claimType: 'WATCH_5_MIN'},
    {...reward, claimId: 'follow', claimType: 'FOLLOW'},
  ]],
  ['with an inactive hourly reward', [{...otherHour, saveType: 'INACTIVE'}]],
]) test(`the sole eligible requested hourly reward still confirms: ${name}`, async () => {
  const h = harness([...extras, reward]);
  const receipt = await collectWatchUiReward(h.options);
  assert.equal(h.clicks, 1);
  assert.equal(h.requests, 2);
  assert.equal(receipt.claimId, reward.claimId);
  assert.equal(receipt.collectionMethod, 'official-ui');
  assert.equal(receipt.confirmation, 'claim-and-balance');
  assert.equal(receipt.balanceBefore, 100);
  assert.equal(receipt.balanceAfter, 200);
  assert.equal(receipt.confirmedAt, 12345);
});
