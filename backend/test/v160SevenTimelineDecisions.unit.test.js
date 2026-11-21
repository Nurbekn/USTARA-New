'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const get=()=>import('../scripts/v160-seven-timeline-decisions.mjs');

test('v160: seven original unique decision references after v159',async()=>{
 const report=(await get()).auditTimelineSeven();
 assert.deepEqual(report.decisions.map(x=>x.id),[32,33,34,35,36,37,38]);
 assert.equal(report.previousSourceTraces,35);assert.equal(report.uniqueSourceTraces,42);
 assert.equal(report.notYetTraced,143);assert.equal(report.newSourceTraces,7);
 assert.equal(report.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v160: source indexing is never called production verification',async()=>{
 const report=(await get()).auditTimelineSeven();
 assert.ok(report.decisions.every(x=>x.productionVerified===false&&x.sourceStatus==='PARTIAL_SOURCE_GAP'));
 for(const field of ['postgresE2E','browserE2E','telegramE2E'])assert.equal(report[field],'NOT_RUN');
 assert.equal(report.productionReady,false);
 assert.deepEqual(report.knownGaps.slice(0,2).map(x=>x.id),[18,22]);
});
test('v160: changed canonical wording fails the audit',async()=>{
 const {auditTimelineSeven}=await get();
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v160-'));
 try{
  const changed=path.join(temp,'source.csv');
  fs.writeFileSync(changed,fs.readFileSync(path.join(ROOT,'docs/USTARA_185_NAZORAT.csv'),'utf8').replace('Vertikal rangli bron timeline','Tampered decision'));
  assert.throws(()=>auditTimelineSeven({registryPath:changed}),/NOT VERIFIED|NOT PASS/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('v160: CLI accepts source-only audit, rejects production claim',()=>{
 const script=path.join(ROOT,'backend/scripts/v160-seven-timeline-decisions.mjs');
 const ok=spawnSync(process.execPath,[script,'--json'],{encoding:'utf8',timeout:30000});
 assert.equal(ok.status,0,ok.stderr);
 assert.equal(JSON.parse(ok.stdout).uniqueSourceTraces,42);
 const notReady=spawnSync(process.execPath,[script,'--require-production'],{encoding:'utf8',timeout:30000});
 assert.notEqual(notReady.status,0);assert.match(notReady.stderr,/NOT VERIFIED/);
});
test('v160: CI executes original decision audit before npm install',()=>{
 const flow=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const check=flow.indexOf('node backend/scripts/v160-seven-timeline-decisions.mjs --json');
 assert.ok(check>0&&check<flow.indexOf('Install backend and frontend from locks'));
});
