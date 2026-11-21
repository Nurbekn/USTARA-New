'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const script=path.join(ROOT,'backend/scripts/v156-seven-ui-decisions.mjs');
let loaded;async function source(){return loaded??=await import('../scripts/v156-seven-ui-decisions.mjs');}
test('v156: next 7 mappings reference exact original decision wordings',async()=>{
 const r=(await source()).auditNextSeven();
 assert.deepEqual(r.decisions.map(d=>d.id),[1,2,3,4,7,8,9]);
 assert.equal(r.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v156: total traced decisions is 14 without duplicates',async()=>{
 const r=(await source()).auditNextSeven();
 assert.equal(r.previousSourceTraces,7);assert.equal(r.newSourceTraces,7);
 assert.equal(r.uniqueSourceTraces,14);assert.equal(r.notYetTraced,171);
});
test('v156: UI source references are NOT runtime or production validation',async()=>{
 const r=(await source()).auditNextSeven();
 for(const d of r.decisions){assert.equal(d.sourceStatus,'REFERENCES_PRESENT_ONLY');
  assert.equal(d.productionVerified,false);assert.ok(d.code.length>=2&&d.tests.length>=1);}
 assert.equal(r.postgresE2E,'NOT_RUN');assert.equal(r.browserE2E,'NOT_RUN');
 assert.equal(r.productionReady,false);assert.equal(r.releaseReadiness,'NOT_VERIFIED');
});
test('v156: 185-decision original CSV remains unmodified by tracing',async()=>{
 const file=path.join(ROOT,'docs/USTARA_185_NAZORAT.csv'),initial=fs.readFileSync(file);
 (await source()).auditNextSeven();assert.deepEqual(initial,fs.readFileSync(file));
});
test('v156: altered original decision label is NOT accepted as a mapping',async()=>{
 const src=fs.readFileSync(path.join(ROOT,'docs/USTARA_185_NAZORAT.csv'),'utf8');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v156-dec-'));
 try{const fake=path.join(tmp,'other.csv');fs.writeFileSync(fake,src.replace('Bosh sahifa kartalari adaptiv','Bosh sahifa kartalari eski'));
 assert.throws(()=>(loaded&&loaded.auditNextSeven({registryPath:fake})),/bytes differ|NOT VERIFIED/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v156: a missing source file fails closed',async()=>{
 const {SEVEN}=await source();
 assert.deepEqual(SEVEN.map(x=>x.id),[1,2,3,4,7,8,9]);
 const {assertEvidenceFile}=await import('../scripts/v155-critical-decisions.mjs');
 assert.throws(()=>assertEvidenceFile(ROOT,'frontend/src/pages/barber/NoSuchCalendar.jsx','calendarDates'),/NOT VERIFIED/);
});
test('v156: audit CLI emits source-only JSON with 171 untraced decisions',()=>{
 const run=spawnSync(process.execPath,[script,'--json'],{encoding:'utf8',timeout:15000});
 assert.equal(run.status,0,run.stderr);
 const r=JSON.parse(run.stdout);assert.equal(r.notYetTraced,171);assert.equal(r.productionReady,false);
});
test('v156: no CLI flag may falsely certify 185 completed decisions',()=>{
 const run=spawnSync(process.execPath,[script,'--require-production'],{encoding:'utf8',timeout:15000});
 assert.notEqual(run.status,0);assert.match(run.stderr,/NOT VERIFIED/);
});
test('v156: new audit is mandatory before npm in isolated CI',()=>{
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const entry=ci.indexOf('node backend/scripts/v156-seven-ui-decisions.mjs --json');
 assert.ok(entry>0&&entry<ci.indexOf('Install backend and frontend from locks'));
});
