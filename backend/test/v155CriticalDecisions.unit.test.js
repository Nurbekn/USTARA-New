"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const script=path.join(ROOT,'backend/scripts/v155-critical-decisions.mjs');
let mod;
const load=async()=>mod??=await import('../scripts/v155-critical-decisions.mjs');
test('v155: all seven mappings reference the exact original 185-decision registry',async()=>{
 const {auditCriticalDecisions}=await load(),r=auditCriticalDecisions();
 assert.deepEqual(r.decisions.map(x=>x.id),[5,6,27,75,76,107,165]);
 assert.equal(r.auditedDecisions,7);assert.equal(r.unreviewedDecisions,178);
 assert.equal(r.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v155: original registry still reports zero production-verified decisions',async()=>{
 const {auditCriticalDecisions}=await load(),r=auditCriticalDecisions();
 assert.equal(r.originalCounts.verifiedComplete,0);
 assert.equal(r.originalCounts.verificationNeeded,130);
 assert.equal(r.originalCounts.partialEvidence,47);
 assert.equal(r.originalCounts.deferredOrCancelled,7);
 assert.equal(r.originalCounts.blockedOrUnknown,1);
 assert.equal(r.productionReady,false);assert.equal(r.releaseReadiness,'NOT_VERIFIED');
});
test('v155: seven source references are not presented as completed runtime integrations',async()=>{
 const {auditCriticalDecisions}=await load();
 for(const entry of auditCriticalDecisions().decisions){
  assert.equal(entry.sourceStatus,'REFERENCES_PRESENT_ONLY');
  assert.equal(entry.unitExecution,'NOT_INFERRED');
  assert.equal(entry.postgresE2E,'NOT_RUN');
  assert.equal(entry.browserE2E,'NOT_RUN');
  assert.equal(entry.productionVerified,false);
  assert.ok(entry.code.length>=2);assert.ok(entry.tests.length>=1);
 }
});
test('v155: original CSV remains byte-for-byte unchanged after audit',async()=>{
 const p=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv');
 const before=fs.readFileSync(p);(await load()).auditCriticalDecisions();
 assert.deepEqual(fs.readFileSync(p),before);
});
test('v155: source and test paths never escape project root',async()=>{
 const {assertEvidenceFile}=await load();
 for(const bad of ['../etc/passwd','/etc/passwd','foo/../../backend/package.json','foo\\bar','./package.json','a//b']){
  assert.throws(()=>assertEvidenceFile(ROOT,bad,'hello'),/unsafe evidence/);
 }
});
test('v155: source and test references reject symlinks',async()=>{
 const {assertEvidenceFile}=await load();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v155-sym-'));
 try{
  fs.writeFileSync(path.join(tmp,'target.txt'),'sample test content long enough');
  fs.symlinkSync(path.join(tmp,'target.txt'),path.join(tmp,'alias.txt'));
  assert.throws(()=>assertEvidenceFile(tmp,'alias.txt','sample'),/unsafe or empty/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v155: deleted and empty evidence never passes',async()=>{
 const {assertEvidenceFile}=await load();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v155-blank-'));
 try{
  assert.throws(()=>assertEvidenceFile(tmp,'missing.js','export'),/missing evidence/);
  fs.writeFileSync(path.join(tmp,'blank.js'),' ');
  assert.throws(()=>assertEvidenceFile(tmp,'blank.js',' '),/unsafe or empty/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v155: unrelated replacement content cannot claim code evidence',async()=>{
 const {assertEvidenceFile}=await load();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v155-drift-'));
 try{
  fs.writeFileSync(path.join(tmp,'code.js'),'export const unrelated = true;');
  assert.throws(()=>assertEvidenceFile(tmp,'code.js','publicQueueLink'),/contract drift/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v155: altered decision registry fails even when seven evidence files exist',async()=>{
 const {auditCriticalDecisions}=await load();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v155-csv-'));
 try{
  const copy=path.join(tmp,'csv');
  fs.writeFileSync(copy,fs.readFileSync(path.join(ROOT,'docs/USTARA_185_NAZORAT.csv'),'utf8').replace('Smart Support yordam markazi','Boshqa talab'));
  assert.throws(()=>auditCriticalDecisions({registryPath:copy}),/bytes differ/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v155: new CI gate happens before npm install and cannot present itself as E2E',()=>{
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const audit=ci.indexOf('node backend/scripts/v155-critical-decisions.mjs --json');
 const install=ci.indexOf('Install backend and frontend from locks');
 assert.ok(audit>0&&audit<install);
 assert.match(ci,/seven critical decisions source-to-test trace \(NOT production verification\)/);
});
test('v155: existing production-browser proof retains original 4-case release transcript',()=>{
 const smoke=fs.readFileSync(path.join(ROOT,'backend/test/pagesBuild.browser.e2e.test.js'),'utf8');
 assert.match(smoke,/SPA fallback: direct forgot-password route renders/);
 assert.match(smoke,/queue\/check-in\/\$\{qrToken\}/);
 assert.match(smoke,/help\?lang=en/);
 assert.doesNotMatch(smoke,/qr-requests|\.click\(/);
});
test('v155: QR production browser checks preserve token confidentiality and locale',()=>{
 const smoke=fs.readFileSync(path.join(ROOT,'backend/test/pagesBuild.browser.e2e.test.js'),'utf8');
 assert.match(smoke,/const qrToken='c'\.repeat\(48\)/);
 assert.match(smoke,/document\.documentElement\.lang'\),'ru'/);
 assert.match(smoke,/document\.querySelector\("#hc-language"\)\.value/);
});
test('v155: CLI emits an explicit source-only JSON report, never production ready',()=>{
 const child=spawnSync(process.execPath,[script,'--json'],{encoding:'utf8',timeout:15000});
 assert.equal(child.status,0,child.stderr);
 const r=JSON.parse(child.stdout);
 assert.equal(r.totalDecisions,185);assert.equal(r.auditedDecisions,7);
 assert.equal(r.productionReady,false);
 assert.ok(!JSON.stringify(r).includes('PRODUCTION_READY'));
});
test('v155: production-approval CLI requires unavailable real evidence and fails closed',()=>{
 const child=spawnSync(process.execPath,[script,'--require-production'],{encoding:'utf8',timeout:15000});
 assert.notEqual(child.status,0);
 assert.match(child.stderr,/NOT VERIFIED/);
});
test('v155: Chrome path guard rejects encoded path, traversal and off-domain routes',async()=>{
 const {waitForRoute}=require('./helpers/v64ChromeRoutes');
 const evaluate=async()=>true;
 for(const bad of ['/other/help','/USTARA-New/../../help','/USTARA-New/queue/%2f','/USTARA-New/help?lang=en','/USTARA-New//help','/USTARA-New/queue/check-in/'+'a'.repeat(100)]){
  await assert.rejects(waitForRoute(evaluate,bad,'true',{attempts:1,pollMs:0}),/invalid/);
 }
});
test('v155: Chrome route guard accepts nested QR deep link only after exact route match',async()=>{
 const {waitForRoute}=require('./helpers/v64ChromeRoutes');
 const target='/USTARA-New/queue/check-in/'+'a'.repeat(48);
 let probes=[];
 assert.equal(await waitForRoute(async expr=>{probes.push(expr);return probes.length===2;},target,'!!document.querySelector("form")',{attempts:2,pollMs:0,pause:async()=>{}}),true);
 assert.ok(probes[0].includes(JSON.stringify(target)));assert.equal(probes.length,2);
});
