'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parseTapSummary}=require('../scripts/v40-staging');
const {STAGING_FILES,validateStagingTranscript,verifyReleaseEvidence}=require('../scripts/v55-release-gate');
const projectRoot=path.resolve(__dirname,'../..');
const tap=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - test ${i+1}`).join('\n')}\n1..${n}\n# tests ${n}\n# suites 0\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
const stage=()=>STAGING_FILES.map(file=>`v41 staging: ${file}: 1/1 PASS, 0 skipped`).join('\n')+ '\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';
test('v55 parser requires actual top-level passing TAP results and an end plan',()=>{
 assert.equal(parseTapSummary(tap(2)).pass,2);
 for(const invalid of [tap(2).replace('ok 1 - test 1\n',''),tap(2).replace('ok 2','ok 1'),
  tap(2).replace('1..2\n',''),tap(2).replace('1..2\n','1..2\n1..2\n'),
  tap(2).replace('TAP version 13\n',''),tap(2)+'not ok 3 - hidden failure\n',
  tap(2).replace('# skipped 0','# skipped 1')])
  assert.throws(()=>parseTapSummary(invalid),/NOT PASS/);
});
test('v55 staging requires every exact suite once, with nonzero results and final marker',()=>{
 assert.equal(validateStagingTranscript(stage()),9);
 for(const invalid of [stage().replace('v54: nine real PostgreSQL suites PASS, zero SKIP.',''),
  stage().replace('v49ConsentLock.postgres.integration.test.js','wrong.test.js'),
  stage().replace('1/1 PASS','0/0 PASS'),
  stage()+'v41 staging: v54QrShopWorker.postgres.integration.test.js: 1/1 PASS, 0 skipped\n'])
  assert.throws(()=>validateStagingTranscript(invalid),/NOT PASS/);
});
test('v55 release gate needs backend, frontend, nine staging suites, build assets and decisions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v55-'));
 const logs=path.join(dir,'logs'),dist=path.join(dir,'dist');
 fs.mkdirSync(logs);fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 try{
  fs.writeFileSync(path.join(logs,'backend.tap'),tap(10));
  fs.writeFileSync(path.join(logs,'frontend.tap'),tap(3));
  fs.writeFileSync(path.join(logs,'staging.log'),stage());
  fs.writeFileSync(path.join(logs,'browser.tap'),browserTap());
  fs.writeFileSync(path.join(logs,'published-browser.tap'),publishedBrowserTap());
  fs.writeFileSync(path.join(dist,'index.html'),'<script type="module" src="/USTARA-New/assets/index-123.js"></script>');
  fs.writeFileSync(path.join(dist,'assets','index-123.js'),'console.log("ready")');
  const result=verifyReleaseEvidence({logsDir:logs,frontendDist:dist,projectRoot});
  assert.equal(result.ciGate,'PASS');assert.equal(result.postgresSuites,9);
  assert.equal(result.productionReady,false);assert.equal(result.telegramLiveE2E,'NOT_RUN');
  fs.unlinkSync(path.join(dist,'assets','index-123.js'));
  assert.throws(()=>verifyReleaseEvidence({logsDir:logs,frontendDist:dist,projectRoot}),/NOT PASS/);
  fs.writeFileSync(path.join(dist,'assets','index-123.js'),'x');
  fs.writeFileSync(path.join(logs,'frontend.tap'),tap(0).replace('# tests 0','# tests 0'));
  assert.throws(()=>verifyReleaseEvidence({logsDir:logs,frontendDist:dist,projectRoot}),/NOT PASS/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('v55 Github workflow is isolated and does not auto-deploy or use production credentials',()=>{
 const yaml=fs.readFileSync(path.join(projectRoot,'.github/workflows/v55-verify.yml'),'utf8');
 assert.match(yaml,/image: postgres:18/);
 assert.match(yaml,/NODE_ENV: test/);
 assert.match(yaml,/CREATE DATABASE ustara_test_db OWNER ustara_account_test/);
 assert.match(yaml,/v54-staging\.js/);
 assert.match(yaml,/v55-release-gate\.js/);
 assert.doesNotMatch(yaml,/\bdeploy-pages\b|DB_PASSWORD:.*\$\{\{/);
});
test('v55 deterministic PostgreSQL boundary test does not depend on sleep timing',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'v53QrFinalBoundaries.postgres.integration.test.js'),'utf8');
 assert.doesNotMatch(sql,/pg_sleep/);
 assert.match(sql,/SET expires_at=clock_timestamp\(\)-interval '1 second'/);
 assert.match(sql,/clock_timestamp\(\)\+interval '10 minutes'/);
});
