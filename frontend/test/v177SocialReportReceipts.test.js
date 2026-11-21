import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeReportReceiptsV177, socialReportReasonOptionsV177, socialReportReceiptsTextV177 } from '../src/pages/user/social/socialReportReceiptsV177.js';
const SRC = new URL('../src/pages/user/Social.jsx', import.meta.url);
const MOD = new URL('../src/pages/user/social/model.js', import.meta.url);
const UI = new URL('../src/pages/user/social/MyReportsV177.jsx', import.meta.url);
test('#151 accepts only receipts explicitly identified as submission-only', () => {
  const one={id:2,postId:5,reason:'misleading',createdAt:'2026-11-20T12:00:00Z'};
  assert.deepEqual(normalizeReportReceiptsV177({reports:[one],moderationStatusAvailable:false}),[one]);
  for(const bad of [{reports:[],moderationStatusAvailable:true},{reports:'any',moderationStatusAvailable:false},{reports:[{...one,reason:'deleted'}],moderationStatusAvailable:false},{reports:[{...one,createdAt:'n/a'}],moderationStatusAvailable:false}]) {
    assert.throws(()=>normalizeReportReceiptsV177(bad));
  }
});
test('#151 frontend reasons and 500-char limit agree with server contract', () => {
  const source=fs.readFileSync(SRC,'utf8');
  assert.deepEqual(socialReportReasonOptionsV177,['spam','inappropriate','misleading','other']);
  assert.match(source, /<option value="misleading">/);
  assert.doesNotMatch(source, /<option value="copyright">/);
  assert.match(source, /maxLength=\{500\}\s+value=\{reportText\}/);
});
test('#151 private receipt API is authenticated and UI clears on account change', () => {
  const source=fs.readFileSync(MOD,'utf8');
  const component=fs.readFileSync(UI,'utf8');
  assert.match(source,/export async function loadMySocialReportsV177/);
  assert.match(source,/"GET", "\/api\/social\/my-reports"/);
  assert.match(component,/subscribeSession/);
  assert.match(component,/getSession\(\)\?\.accountId !== initialAccount.current/);
  assert.match(component,/controller.abort\(\)/);
  assert.match(component,/onClose/);
});
test('#151 translations describe receipt, not moderation outcome',()=>{
  for(const lang of ['uz','ru','en']) {
    assert.ok(socialReportReceiptsTextV177[lang]?.title);
    assert.ok(socialReportReceiptsTextV177[lang]?.note.length>30);
    assert.equal(Object.keys(socialReportReceiptsTextV177[lang].reasons).length,4);
  }
});
