'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const load=()=>import('../scripts/v161-seven-chat-advertising-decisions.mjs');
test('v161 traces exact #39–#45 decisions without claiming production',async()=>{
 const report=(await load()).auditChatSeven();
 assert.deepEqual(report.decisions.map(x=>x.id),[39,40,41,42,43,44,45]);
 assert.equal(report.uniqueSourceTraces,49);assert.equal(report.notYetTraced,136);
 assert.equal(report.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.ok(report.decisions.every(d=>d.productionVerified===false&&d.sourceStatus==='PARTIAL_SOURCE_GAP'));
 for(const e2e of ['postgresE2E','browserE2E','telegramE2E'])assert.equal(report[e2e],'NOT_RUN');
});
test('v161 decision registry corruption is rejected even when a new file looks plausible',async()=>{
 const original=fs.readFileSync(path.join(ROOT,'docs/USTARA_185_NAZORAT.csv'),'utf8');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v161-'));
 try {const changed=path.join(dir,'bad.csv');fs.writeFileSync(changed,original.replace('Real-time chat va post ulashish','Real-time chat not needed'));
  const {auditChatSeven}=await load();
  assert.throws(()=>auditChatSeven({registryPath:changed}),/NOT PASS|NOT VERIFIED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('v161 source-only CLI succeeds and production requirement fails',()=>{
 const p=path.join(ROOT,'backend/scripts/v161-seven-chat-advertising-decisions.mjs');
 const ok=spawnSync(process.execPath,[p,'--json'],{encoding:'utf8',timeout:30000});
 assert.equal(ok.status,0,ok.stderr);assert.equal(JSON.parse(ok.stdout).uniqueSourceTraces,49);
 const nope=spawnSync(process.execPath,[p,'--require-production'],{encoding:'utf8',timeout:30000});
 assert.notEqual(nope.status,0);assert.match(nope.stderr,/NOT VERIFIED/);
});
test('v161 is added to CI structural audit before dependency installation',()=>{
 const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const index=workflow.indexOf('node backend/scripts/v161-seven-chat-advertising-decisions.mjs --json');
 assert.ok(index>0);assert.ok(index<workflow.indexOf('Install backend and frontend from locks'));
});
