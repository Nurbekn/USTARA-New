import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateOpsReadOnlyV165,opsReadOnlyLocaleV165} from '../src/pages/adminOpsReadOnlyV165.js';
const labels=opsReadOnlyLocaleV165;
const base={checkedAt:'2026-11-21T12:00:00Z',status:'ok',automaticResend:false,
 telegramDelivery:{status:'ok',alerts:[],summary:{queue:{pending:{total:2,due:1,overdue_pending:0,stale_lease:0}},smart_booking:{}}}};
test('v165: read-only Telegram and system status response contracts reject malformed data',()=>{
 assert.equal(validateOpsReadOnlyV165(base,'telegram'),true);
 assert.equal(validateOpsReadOnlyV165({...base,telegramDelivery:{...base.telegramDelivery,alerts:[{channel:'evil',status:'failed',count:1,overdue_pending:0,stale_lease:0}]}},'telegram'),false);
 assert.equal(validateOpsReadOnlyV165({...base,automaticResend:true},'telegram'),false);
 assert.equal(validateOpsReadOnlyV165({...base,status:'unknown'},'telegram'),false);
 assert.equal(validateOpsReadOnlyV165({...base,telegramDelivery:{...base.telegramDelivery,summary:{queue:{}}}},'telegram'),false);
 const system={...base,telegramDelivery:{status:'ok',alerts:[]},database:{status:'reachable'},featureFlags:{adminReadOnlyOperations:'enabled'},automatedRollback:false,monitoring:{alertCount:0}};
 assert.equal(validateOpsReadOnlyV165(system,'system'),true);
 assert.equal(validateOpsReadOnlyV165({...system,automatedRollback:true},'system'),false);
 assert.equal(validateOpsReadOnlyV165({...system,monitoring:{alertCount:1}},'system'),false);
});
test('v165: operator UI is read-only, aborts stale responses and supports 3 languages',()=>{
 const jsx=fs.readFileSync(new URL('../src/pages/AdminOpsReadOnlyV165.jsx',import.meta.url),'utf8');
 const parent=fs.readFileSync(new URL('../src/pages/AdminPanel.jsx',import.meta.url),'utf8');
 assert.match(jsx,/request\('GET',endpoint/);
 assert.doesNotMatch(jsx,/request\(['"](?:POST|PUT|PATCH|DELETE)/);
 assert.match(jsx,/active=false;controller\.abort\(\)/);
 assert.match(jsx,/onUnauthorized\?\.\(\)/);
 assert.match(parent,/<AdminOpsReadOnlyV165 token=\{token\}/);
 assert.match(parent,/\['system','telegram'\]\.includes\(tab\)/);
 for(const lang of ['uz','ru','en']){
  assert.ok(labels[lang]?.system&&labels[lang]?.outbox&&labels[lang]?.unknown);
  assert.ok(labels[lang]?.attention&&labels[lang]?.disabled&&labels[lang]?.notVerified);
 }
});
