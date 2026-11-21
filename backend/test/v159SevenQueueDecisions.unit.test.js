'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
let cache;
const source=()=>cache??=import('../scripts/v159-seven-queue-decisions.mjs');
test('v159: seven unique #24–#31 decisions, #27 was already counted',async()=>{
 const r=(await source()).auditQueueSeven();
 assert.deepEqual(r.decisions.map(x=>x.id),[24,25,26,28,29,30,31]);
 assert.equal(r.previousSourceTraces,28);
 assert.equal(r.newSourceTraces,7);
 assert.equal(r.uniqueSourceTraces,35);
 assert.equal(r.notYetTraced,150);
 assert.equal(r.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v159: source references do not prove production',async()=>{
 const r=(await source()).auditQueueSeven();
 assert.ok(r.decisions.every(x=>x.productionVerified===false&&x.sourceStatus==='PARTIAL_SOURCE_GAP'));
 assert.equal(r.smartBookingAdminControl,'UNIT_TESTED_ONLY');
 assert.equal(r.releaseReadiness,'NOT_VERIFIED');
 assert.equal(r.postgresE2E,'NOT_RUN');assert.equal(r.browserE2E,'NOT_RUN');
 assert.equal(r.telegramE2E,'NOT_RUN');assert.equal(r.productionReady,false);
 assert.deepEqual(r.knownGaps.slice(0,2).map(x=>x.id),[18,22]);
});
test('v159: audit detects changed original CSV decision text',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v159-audit-'));
 try{
  const dest=path.join(dir,'changed.csv');
  fs.writeFileSync(dest,fs.readFileSync(path.join(ROOT,'docs/USTARA_185_NAZORAT.csv'),'utf8').replace('Smart Booking markaziy Admin qoidalari','Soxta admin qoidalari'));
  const {auditQueueSeven}=await source();
  assert.throws(()=>auditQueueSeven({registryPath:dest}),/NOT VERIFIED|NOT PASS/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('v159: CLI source audit succeeds but production claim fails',()=>{
 const file=path.join(ROOT,'backend/scripts/v159-seven-queue-decisions.mjs');
 const good=spawnSync(process.execPath,[file,'--json'],{encoding:'utf8',timeout:15000});
 assert.equal(good.status,0,good.stderr);
 assert.equal(JSON.parse(good.stdout).uniqueSourceTraces,35);
 const bad=spawnSync(process.execPath,[file,'--require-production'],{encoding:'utf8',timeout:15000});
 assert.notEqual(bad.status,0);assert.match(bad.stderr,/NOT VERIFIED/);
});
test('v159: new audit CI step runs before dependency installation',()=>{
 const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const index=workflow.indexOf('node backend/scripts/v159-seven-queue-decisions.mjs --json');
 assert.ok(index>0&&index<workflow.indexOf('Install backend and frontend from locks'));
});
