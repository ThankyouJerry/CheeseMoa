import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePower,formatPowerSummary} from '../src/shared/power-summary.js';
test('totals deduplicate successful account receipts and never infer from balances or uncertain attempts',()=>{
 const r={accountId:'a',channelId:'c',claimId:'1',confirmedAt:20,amount:100};
 const history={receipts:[r,{...r},{...r,claimId:'2',amount:null},{...r,claimId:'3',accountId:undefined},{...r,channelId:'d',claimId:'4',amount:10,confirmedAt:5}],attempts:[{amount:900,status:'unconfirmed'}],balances:[{amount:99999}]};
 assert.deepEqual(summarizePower(history,{channelId:'c'}),{amount:100,count:2,unknown:1});
 assert.deepEqual(summarizePower(history,{since:10}),{amount:100,count:2,unknown:1});
 assert.deepEqual(summarizePower({receipts:[]}),{amount:0,count:0,unknown:0});
 assert.match(formatPowerSummary(summarizePower(history)),/110 파워 · 3건 · 이 중 1건 금액 미확인/);
});
