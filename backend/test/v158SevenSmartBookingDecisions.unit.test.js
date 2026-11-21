'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
let modulePromise;
const source=()=>modulePromise??=import('../scripts/v158-seven-smart-booking-decisions.mjs');
const file=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv');

test('v158: 7 original, unique decision IDs #17–#23 extend 21 prior traces',async()=>{
 const {auditSmartSeven}=await source();
 const r=auditSmartSeven();
 assert.deepEqual(r.decisions.map(item=>item.id),[17,18,19,20,21,22,23]);
 assert.equal(r.totalDecisions,185);
 assert.equal(r.previousSourceTraces,21);
 assert.equal(r.uniqueSourceTraces,28);
 assert.equal(r.notYetTraced,157);
 assert.equal(r.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v158: known #18 and #22 implementation gaps are never reported as production complete',async()=>{
 const r=(await source()).auditSmartSeven();
 assert.deepEqual(r.knownGaps.map(item=>item.id),[18,22]);
 assert.equal(r.decisions.find(item=>item.id===22).sourceStatus,'PARTIAL_SOURCE_GAP');
 assert.match(r.decisions.find(item=>item.id===22).missingImplementation.join(' '),/faqat cancellation/);
 assert.match(r.decisions.find(item=>item.id===18).missingImplementation.join(' '),/eslatma/);
 assert.ok(r.decisions.every(item=>!item.productionVerified && item.code.length>=2 && item.tests.length>=1));
 assert.equal(r.todayOffersView,'UNIT_TESTED_ONLY');
 assert.equal(r.postgresE2E,'NOT_RUN');
 assert.equal(r.browserE2E,'NOT_RUN');
 assert.equal(r.telegramE2E,'NOT_RUN');
 assert.equal(r.productionReady,false);
});
test('v158: no edits of original 185 agreed decisions',async()=>{
 const original=fs.readFileSync(file);
 (await source()).auditSmartSeven();
 assert.deepEqual(fs.readFileSync(file),original);
});
test('v158: modified source decision text must fail closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v158-'));
 try{
  const altered=path.join(dir,'decisions.csv');
  fs.writeFileSync(altered,fs.readFileSync(file,'utf8').replace('Takliflar bugungi jadvalda ko‘rinadi','Takliflar o‘zgardi'));
  const {auditSmartSeven}=await source();
  assert.throws(()=>auditSmartSeven({registryPath:altered}),/NOT PASS|NOT VERIFIED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('v158: CLI is source-only and refuses release claims',()=>{
 const cli=path.join(ROOT,'backend/scripts/v158-seven-smart-booking-decisions.mjs');
 const ok=spawnSync(process.execPath,[cli,'--json'],{encoding:'utf8',timeout:15000});
 assert.equal(ok.status,0,ok.stderr);
 assert.equal(JSON.parse(ok.stdout).uniqueSourceTraces,28);
 const denied=spawnSync(process.execPath,[cli,'--require-production'],{encoding:'utf8',timeout:15000});
 assert.notEqual(denied.status,0);
 assert.match(denied.stderr,/NOT VERIFIED/);
});
test('v158: CI checks new seven before npm installation',()=>{
 const s=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const index=s.indexOf('node backend/scripts/v158-seven-smart-booking-decisions.mjs --json');
 assert.ok(index>0 && index<s.indexOf('Install backend and frontend from locks'));
});
