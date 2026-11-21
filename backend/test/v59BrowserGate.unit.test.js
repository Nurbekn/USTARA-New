'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateBrowserTranscript}=require('../scripts/v55-release-gate');
const {summarize}=require('../scripts/v56-ci-summary');
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
const ci=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
const pages=fs.readFileSync(path.join(root,'.github/workflows/deploy-pages.yml'),'utf8');
const tap=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - test`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;

// Actual Chrome/DB integration runs in GitHub after 9 PostgreSQL suites. These
// tests verify the fail-closed gate, NOT a local live Chrome result.
test('v59: Chrome browser gate requires all three observed scenarios and zero SKIP',()=>{
 assert.equal(validateBrowserTranscript(browserTap()),4);
 const report=browserTap();
 for(const bad of [
  report.replace('    ok 1 - customer:', '    # ok 1 - customer:'),
  report.replace('    ok 2 - barber:', '    not ok 2 - barber:'),
  report.replace('    ok 3 - admin:', '    ok 3 - missing:'),
  report.replace('ok 1 - Login E2E:', 'not ok 1 - Login E2E:'),
  report.replace('# skipped 0','# skipped 1'),
  report.replace('    ok 2 - barber:', '    ok 2 - barber:') + '    ok 9 - hidden failure # SKIP\n',
  tap(5),
  '',
 ]) assert.throws(()=>validateBrowserTranscript(bad),/NOT PASS/);
});

test('v59: CI runs real Chrome against isolated login-test role, never production URL',()=>{
 assert.match(ci,/CREATE ROLE ustara_login_test LOGIN PASSWORD/);
 assert.match(ci,/GRANT ustara_account_test TO ustara_login_test/);
 assert.match(ci,/USTARA_TEST_DATABASE_URL: postgresql:\/\/ustara_login_test:ci_ephemeral_only_ustara_55@127\.0\.0\.1:5432\/ustara_test_db/);
 assert.match(ci,/USTARA_LOGIN_E2E: '1'/);
 assert.match(ci,/USTARA_LOGIN_WRITE_TESTS: I_AUTHORIZE_TEST_DATA/);
 assert.match(ci,/command -v google-chrome/);
 assert.match(ci,/node --test test\/login\.browser\.e2e\.test\.js/);
 assert.match(ci,/browser\.tap/);
 assert.ok(ci.indexOf('Nine real PostgreSQL suites')<ci.indexOf('Real Chrome login E2E'));
 assert.ok(ci.indexOf('Real Chrome login E2E')<ci.indexOf('Release evidence gate'));
 assert.match(ci,/set -euo pipefail\n\s*if command -v google-chrome/);
 assert.doesNotMatch(ci,/USTARA_LOGIN_E2E: '0'/);
});

test('v59: redacted report rejects all evidence without completed Chrome E2E',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v59-'));
 try{
  fs.mkdirSync(path.join(dir,'dist','assets'),{recursive:true});
  fs.writeFileSync(path.join(dir,'dist','index.html'),'<script type="module" src="/USTARA-New/assets/app.js"></script>');
  fs.writeFileSync(path.join(dir,'dist','assets','app.js'),'var ok=1');
  fs.writeFileSync(path.join(dir,'backend.tap'),tap(2));
  fs.writeFileSync(path.join(dir,'frontend.tap'),tap(2));
  const files=require('../scripts/v55-release-gate').STAGING_FILES;
  fs.writeFileSync(path.join(dir,'staging.log'),files.map(x=>`v41 staging: ${x}: 1/1 PASS, 0 skipped`).join('\n')+'\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n');
  fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify({ciGate:'PASS',productionReady:false,postgresSuites:9,
   browserTests:4,publishBrowserTests:4,backendUnit:2,frontendUnit:2,decisions:185,forwardMigrations:48,publishFiles:2,frontendJsAssets:1,publishTreeSha256:sha256PublishTree(path.join(dir,'dist'))}));
  assert.equal(summarize(dir,path.join(dir,'dist')).releaseGate,'NOT_VERIFIED');
  fs.writeFileSync(path.join(dir,'browser.tap'),browserTap());
  fs.writeFileSync(path.join(dir,'published-browser.tap'),publishedBrowserTap());
  const good=summarize(dir,path.join(dir,'dist'));
  assert.equal(good.releaseGate,'PASS');assert.deepEqual(good.browser,{status:'PASS',tests:4});
  fs.writeFileSync(path.join(dir,'browser.tap'),browserTap().replace('    ok 1 - customer:', '    not ok 1 - customer:'));
  assert.equal(summarize(dir,path.join(dir,'dist')).releaseGate,'NOT_VERIFIED');
  assert.equal(summarize(dir,path.join(dir,'dist')).browser.status,'NOT_VERIFIED');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('v59: Pages rejects CI proof without verified mobile/desktop browser coverage',async()=>{
 const {verifyPagesEvidence}=await import(path.join(root,'frontend/scripts/verify-pages-evidence.mjs'));
 const {apiBaseSha256}=require('../../scripts/production-api-url.cjs');
 const sha='a'.repeat(40),api='https://api.ustara.uz';
 const record={releaseGate:'PASS',productionReady:false,sourceSha:sha,sourceRunId:123,sourceRunAttempt:1,
  apiBaseSha256:apiBaseSha256(api),backend:{status:'PASS'},frontend:{status:'PASS'},
  postgres:{status:'PASS',suites:9},viteBuild:'ARTIFACT_VERIFIED',publishTreeSha256:'a'.repeat(64),browser:{status:'PASS',tests:4},publishedBrowser:{status:'PASS',tests:4}};
 const input={sha,apiBaseUrl:api,runId:123,runAttempt:1};
 assert.equal(verifyPagesEvidence(record,input),true);
 for(const browser of [undefined,{status:'NOT_VERIFIED',tests:0},{status:'PASS',tests:1},
   {status:'PASS',tests:'4'},{status:'PASS',tests:0}])
  assert.throws(()=>verifyPagesEvidence({...record,browser},input),/NOT PASS/);
 assert.match(pages,/verify-pages-evidence\.mjs/);
});

test('v59: Chrome integration test script tests customer mobile, barber desktop and admin',()=>{
 const source=fs.readFileSync(path.join(root,'backend/test/login.browser.e2e.test.js'),'utf8');
 assert.match(source,/\['customer', 390\]/);
 assert.match(source,/\['barber', 1440\]/);
 assert.match(source,/admin: takroriy/);
 assert.match(source,/USTARA_LOGIN_WRITE_TESTS/);
 assert.match(source,/USTARA_LOGIN_E2E/);
 assert.match(source,/Chrome, React, HTTP va PostgreSQL/);
});
