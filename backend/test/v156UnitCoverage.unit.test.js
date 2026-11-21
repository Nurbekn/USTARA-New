'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {FLOORS,verifySourceMatrix,verifyFullUnitCoverage}=require('../scripts/v156-unit-coverage');
const {verifyReleaseEvidence}=require('../scripts/v55-release-gate');
const ROOT=path.resolve(__dirname,'../..');
function tap(count){return `TAP version 13\n${Array.from({length:count},(_,i)=>`ok ${i+1} - test ${i+1}`).join('\n')}\n1..${count}\n# tests ${count}\n# pass ${count}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;}
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v156-'));
 const write=(name,value)=>fs.writeFileSync(path.join(dir,name),value);
 write('backend.tap',tap(FLOORS.backend.minTests));
 write('frontend.tap',tap(FLOORS.frontend.minTests));
 return {dir,write,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('v156: both full package scripts and >= v155 test-file inventory remain present',()=>{
 const report=verifySourceMatrix(ROOT);
 assert.equal(report.sourceMatrix,'PASS');assert.equal(report.productionReady,false);
 assert.ok(report.backend.testFiles>=161);assert.ok(report.frontend.testFiles>=114);
 assert.ok(report.backend.scriptVerified&&report.frontend.scriptVerified);
});
test('v156: same source inventory rejects a reduced backend unit command',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v156-pkg-'));
 try{
  for(const kind of ['backend','frontend']){
   const dir=path.join(tmp,kind);fs.mkdirSync(path.join(dir,'test'),{recursive:true});
   const old=JSON.parse(fs.readFileSync(path.join(ROOT,kind,'package.json')));
   if(kind==='backend')old.scripts['test:unit']='node --test test/single.unit.test.js';
   fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(old));
  }
  assert.throws(()=>verifySourceMatrix(tmp),/NOT PASS/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v156: CLI preinstall can verify source without network, pg or node_modules',()=>{
 const p=spawnSync(process.execPath,[path.join(ROOT,'backend/scripts/v156-unit-coverage.js'),'--source-only'],{encoding:'utf8',timeout:15000});
 assert.equal(p.status,0,p.stderr);const report=JSON.parse(p.stdout);
 assert.equal(report.runtimeSuites,'NOT_INFERRED');assert.equal(report.productionReady,false);
});
test('v156: full on-disk v155 backend TAP is correctly BLOCKED, not called PASS',()=>{
 const base=path.resolve(ROOT,'../../v155_backend_full.tap');
 if(fs.existsSync(base)){
  const f=fixture();try{
   f.write('backend.tap',fs.readFileSync(base));
   assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
  }finally{f.close();}
 }
});
test('v156: exact minimum healthy backend AND frontend TAP reports pass',()=>{
 const f=fixture();try{
  const r=verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir});
  assert.equal(r.coverageGate,'PASS');assert.equal(r.backend.tests,1501);
  assert.equal(r.frontend.tests,1609);assert.equal(r.productionReady,false);
  assert.equal(r.databaseE2E,'NOT_INFERRED');
 }finally{f.close();}
});
test('v156: tiny passing backend TAP can never replace the 1501+ test suite',()=>{
 const f=fixture();try{
  f.write('backend.tap',tap(3));
  assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
 }finally{f.close();}
});
test('v156: tiny passing frontend TAP can never replace the 1609+ test suite',()=>{
 const f=fixture();try{
  f.write('frontend.tap',tap(2));
  assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
 }finally{f.close();}
});
test('v156: short or duplicated TAP plans are rejected even at full test count',()=>{
 const f=fixture();try{
  const good=tap(FLOORS.backend.minTests);
  for(const bad of [good.replace('1..1501\n','1..1499\n'),good+'1..1501\n',good.replace('ok 8 -','ok 7 -')]){
   f.write('backend.tap',bad);
   assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
  }
 }finally{f.close();}
});
test('v156: skip, TODO and failure may never be counted as a successful full suite',()=>{
 const f=fixture();try{
  const good=tap(FLOORS.frontend.minTests);
  for(const bad of [good.replace('ok 8 - test 8','ok 8 - test 8 # SKIP'),
   good.replace('# skipped 0','# skipped 1'),good.replace('# fail 0','# fail 1'),
   good.replace('ok 9 - test 9','not ok 9 - test 9'),
   good.replace('# todo 0','# todo 1')]){
   f.write('frontend.tap',bad);
   assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
  }
 }finally{f.close();}
});
test('v156: no missing or empty TAP is accepted as proof',()=>{
 const f=fixture();try{
  fs.unlinkSync(path.join(f.dir,'frontend.tap'));
  assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
  f.write('frontend.tap',' ');
  assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
 }finally{f.close();}
});
test('v156: TAP symlink is forbidden as a release evidence input',()=>{
 const f=fixture();try{
  fs.renameSync(path.join(f.dir,'backend.tap'),path.join(f.dir,'real_backend.tap'));
  fs.symlinkSync(path.join(f.dir,'real_backend.tap'),path.join(f.dir,'backend.tap'));
  assert.throws(()=>verifyFullUnitCoverage({projectRoot:ROOT,logsDir:f.dir}),/NOT PASS/);
 }finally{f.close();}
});
test('v156: CLI emits sanitized status, not secrets or false release readiness',()=>{
 const f=fixture();try{
  const p=spawnSync(process.execPath,[path.join(ROOT,'backend/scripts/v156-unit-coverage.js'),f.dir],{encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,p.stderr);
  const r=JSON.parse(p.stdout);assert.equal(r.coverageGate,'PASS');
  assert.equal(r.productionReady,false);assert.ok(!JSON.stringify(r).includes('POSTGRES_PASSWORD'));
 }finally{f.close();}
});
test('v156: release gate opt-in actually rechecks reduced evidence',()=>{
 const f=fixture();try{
  f.write('backend.tap',tap(1));
  const old=process.env.USTARA_V156_REQUIRE_COMPLETE_MATRIX;
  process.env.USTARA_V156_REQUIRE_COMPLETE_MATRIX='1';
  try{assert.throws(()=>verifyReleaseEvidence({projectRoot:ROOT,logsDir:f.dir,frontendDist:path.join(f.dir,'none')}),/NOT PASS/);}
  finally{if(old===undefined)delete process.env.USTARA_V156_REQUIRE_COMPLETE_MATRIX;else process.env.USTARA_V156_REQUIRE_COMPLETE_MATRIX=old;}
 }finally{f.close();}
});
test('v156: CI requires source check pre-npm, TAP check post-tests, and release gate revalidation',()=>{
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 const source=ci.indexOf('v156-unit-coverage.js --source-only');
 const install=ci.indexOf('Install backend and frontend from locks');
 const backend=ci.indexOf('Full backend unit suite');
 const frontend=ci.indexOf('Full frontend unit suite');
 const complete=ci.indexOf('v156-unit-coverage.js "$RUNNER_TEMP/ustara-v55"');
 const release=ci.indexOf('Release evidence gate — fail closed');
 assert.ok(source>0&&source<install&&install<backend&&backend<frontend&&frontend<complete&&complete<release);
 assert.match(ci,/USTARA_V156_REQUIRE_COMPLETE_MATRIX: '1'/);
 const gate=fs.readFileSync(path.join(ROOT,'backend/scripts/v55-release-gate.js'),'utf8');
 assert.match(gate,/verifyFullUnitCoverage\(\{projectRoot,logsDir\}\)/);
});
