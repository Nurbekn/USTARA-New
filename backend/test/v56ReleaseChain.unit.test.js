'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {summarize}=require('../scripts/v56-ci-summary');
const {STAGING_FILES,validateStagingTranscript}=require('../scripts/v55-release-gate');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
const pages=fs.readFileSync(path.join(root,'.github/workflows/deploy-pages.yml'),'utf8');
const verify=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
const tap=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - case ${i+1}`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
const staging=()=>STAGING_FILES.map(f=>`v41 staging: ${f}: 1/1 PASS, 0 skipped`).join('\n')+ '\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';

test('v56: Pages deploy waits for completed verified main push; no direct push or manual bypass',()=>{
 assert.match(pages,/workflow_run:\s*\n\s*workflows:/);
 assert.match(pages,/USTARA v55 isolated verification/);
 assert.match(pages,/types: \[completed\]/);
 for(const value of ['conclusion == \'success\'','event == \'push\'',
  'head_branch == \'main\'','head_repository.full_name == github.repository'])
  assert.ok(pages.includes(value),`Missing trusted workflow_run guard: ${value}`);
 assert.doesNotMatch(pages,/^\s+(?:push|workflow_dispatch):\s*$/m);
 assert.ok(pages.indexOf('workflow_run:')<pages.indexOf('jobs:'));
});

test('v56: build and deploy independently verify verified SHA is still main HEAD',()=>{
 assert.equal((pages.match(/ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/g)||[]).length,2);
 assert.equal((pages.match(/github\.rest\.repos\.getBranch\(/g)||[]).length,2);
 assert.equal((pages.match(/test "\$\(git rev-parse HEAD\)" = "\$VERIFIED_SHA"/g)||[]).length,2);
 assert.match(pages,/group: ustara-pages-main/);
 assert.match(pages,/cancel-in-progress: false/);
 assert.ok(pages.indexOf('Re-check current main')<pages.indexOf('actions/deploy-pages@v4'));
 assert.ok(pages.indexOf('Verify exact commit')<pages.indexOf('Download exact build'));
});

test('v56: CI uploads only redacted diagnostics on every outcome',()=>{
 assert.match(verify,/if: always\(\)/);
 assert.match(verify,/node backend\/scripts\/v56-ci-summary\.js/);
 assert.match(verify,/actions\/upload-artifact@v4/);
 assert.match(verify,/ci-summary\.json/);
 assert.doesNotMatch(verify,/path:\s*.*(?:backend\.tap|frontend\.tap|staging\.log)/);
 assert.match(verify,/v55-release-gate\.js.*release\.json/);
});

test('v56: staging transcript requires ordered, nonzero suites and exactly one terminal marker',()=>{
 const valid=staging();
 assert.equal(validateStagingTranscript(valid),9);
 const rows=valid.split('\n');
 const reversed=rows.slice(0,2).reverse().concat(rows.slice(2)).join('\n');
 for(const bad of [reversed,valid+'v54: nine real PostgreSQL suites PASS, zero SKIP.\n',
  valid+'unverified tail\n', valid.replace('1/1 PASS','0/0 PASS')])
  assert.throws(()=>validateStagingTranscript(bad),/NOT PASS/);
});

test('v56: redacted summary reports missing evidence without logging any secret',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v56-'));
 const dist=path.join(dir,'dist');
 try{
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dir,'backend.tap'),'SECRET_TOKEN_12345\n');
  const report=summarize(dir,dist);
  assert.equal(report.backend.status,'NOT_VERIFIED');
  assert.equal(report.postgres.status,'NOT_VERIFIED');
  assert.equal(report.releaseGate,'NOT_VERIFIED');
  assert.equal(report.productionReady,false);
  assert.doesNotMatch(JSON.stringify(report),/SECRET_TOKEN_12345|password|postgresql:\/\//i);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('v56: redacted summary accepts verified logs, but never declares production-ready',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v56-'));
 const dist=path.join(dir,'dist');
 try{
  fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
  fs.writeFileSync(path.join(dist,'index.html'),'<script type="module" src="/USTARA-New/assets/index-ABC.js"></script>');
  fs.writeFileSync(path.join(dist,'assets','index-ABC.js'),'console.log(123)');
  fs.writeFileSync(path.join(dir,'backend.tap'),tap(2));
  fs.writeFileSync(path.join(dir,'frontend.tap'),tap(1));
  fs.writeFileSync(path.join(dir,'staging.log'),staging());
  fs.writeFileSync(path.join(dir,'browser.tap'),browserTap());
  fs.writeFileSync(path.join(dir,'published-browser.tap'),publishedBrowserTap());
  fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify({ciGate:'PASS',productionReady:false,
   postgresSuites:9,browserTests:4,publishBrowserTests:4,backendUnit:2,frontendUnit:1,decisions:185,forwardMigrations:48,publishFiles:2,frontendJsAssets:1,publishTreeSha256:sha256PublishTree(dist)}));
  const report=summarize(dir,dist);
  assert.equal(report.backend.pass,2);
  assert.equal(report.frontend.pass,1);
  assert.equal(report.postgres.suites,9);
  assert.equal(report.releaseGate,'PASS');
  assert.equal(report.viteBuild,'ARTIFACT_VERIFIED');
  assert.equal(report.productionReady,false);
  fs.unlinkSync(path.join(dist,'assets','index-ABC.js'));
  assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
  fs.writeFileSync(path.join(dist,'assets','index-ABC.js'),'console.log(123)');
  fs.writeFileSync(path.join(dir,'release.json'),'{"ciGate":"PASS","productionReady":true}');
  assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('v56: archived checkpoint and progress are up to date and decision CSV is immutable',()=>{
 const cp=fs.readFileSync(path.join(root,'docs/USTARA_LATEST_CHECKPOINT.md'),'utf8');
 const progress=fs.readFileSync(path.join(root,'docs/USTARA_PROGRESS.md'),'utf8');
 const report=fs.readFileSync(path.join(root,'docs/USTARA_185_AUDIT_V56.md'),'utf8');
 const match=cp.match(/checkpoint v(\d+)/);
 assert.ok(match && Number(match[1])>=56,'checkpoint must not regress below v56');
 assert.match(progress,/## v55/);
 assert.match(progress,/## v56/);
 assert.match(report,/185/);
 assert.match(report,/bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71/);
});
