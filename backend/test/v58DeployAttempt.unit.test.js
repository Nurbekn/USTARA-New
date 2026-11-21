'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
const verify=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
const pages=fs.readFileSync(path.join(root,'.github/workflows/deploy-pages.yml'),'utf8');
const {verifiedSourceRun}=require('../scripts/v55-release-gate');
const {verifyPagesOutput,validatePublishTree}=require('../../scripts/publish-tree-check.cjs');
const {summarize}=require('../scripts/v56-ci-summary');
const {apiBaseSha256}=require('../../scripts/production-api-url.cjs');
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
function withTemp(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v58-'));
 try {return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function build(dir){const dist=path.join(dir,'dist');fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 const html='<script type="module" src="/USTARA-New/assets/index-A1.js"></script>';
 fs.writeFileSync(path.join(dist,'index.html'),html);fs.writeFileSync(path.join(dist,'404.html'),html);
 fs.writeFileSync(path.join(dist,'assets','index-A1.js'),'console.log("safe")');return dist;}
function tap(n){return `TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - case ${i+1}`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;}
const staging=require('../scripts/v55-release-gate').STAGING_FILES.map(x=>`v41 staging: ${x}: 1/1 PASS, 0 skipped`).join('\n')+'\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';

test('v58: rerun creates a distinct artifact and Pages downloads the exact run attempt',()=>{
 assert.match(verify,/ustara-v58-ci-summary-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
 assert.match(pages,/ustara-v58-ci-summary-\$\{\{ github\.event\.workflow_run\.id \}\}-\$\{\{ github\.event\.workflow_run\.run_attempt \}\}/);
 assert.match(pages,/run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
 assert.match(pages,/VERIFIED_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
 assert.match(pages,/VERIFIED_RUN_ATTEMPT: \$\{\{ github\.event\.workflow_run\.run_attempt \}\}/);
});

test('v58: GitHub run provenance requires real numeric run ID and attempt; local mode remains nullable',()=>{
 assert.equal(verifiedSourceRun({GITHUB_ACTIONS:'false'}),null);
 assert.deepEqual(verifiedSourceRun({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'2'}),{runId:100,runAttempt:2});
 for(const [id,attempt] of [['0','1'],['1','0'],['abc','2'],['1','1.5'],['01','1'],['1','9999999'],['90071992547409999','1'],[undefined,'1']])
  assert.throws(()=>verifiedSourceRun({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:id,GITHUB_RUN_ATTEMPT:attempt}),/NOT PASS/);
});

test('v58: Pages rejects prior attempt even if SHA, API, and PASS status are unchanged',async()=>{
 const {verifyPagesEvidence}=await import(pathToFileURL(path.join(root,'frontend/scripts/verify-pages-evidence.mjs')));
 const sha='a'.repeat(40),api='https://api.ustara.uz';
 const row={releaseGate:'PASS',productionReady:false,sourceSha:sha,sourceRunId:100,sourceRunAttempt:2,
  apiBaseSha256:apiBaseSha256(api),publishTreeSha256:'a'.repeat(64),backend:{status:'PASS'},frontend:{status:'PASS'},
  postgres:{status:'PASS',suites:9},browser:{status:'PASS',tests:4},publishedBrowser:{status:'PASS',tests:4},viteBuild:'ARTIFACT_VERIFIED'};
 const input={sha,apiBaseUrl:api,runId:'100',runAttempt:'2'};
 assert.equal(verifyPagesEvidence(row,input),true);
 for(const invalid of [{...input,runAttempt:'1'},{...input,runId:'99'},
   {...input,runAttempt:'0'},{...input,runAttempt:'INVALID'}])
  assert.throws(()=>verifyPagesEvidence(row,invalid),/NOT PASS/);
 assert.throws(()=>verifyPagesEvidence({...row,sourceRunAttempt:1},input),/NOT PASS/);
});

test('v58: redacted CI summary cannot PASS with prior run provenance',()=>withTemp(dir=>{
 const dist=build(dir);
 fs.writeFileSync(path.join(dir,'backend.tap'),tap(2));
 fs.writeFileSync(path.join(dir,'frontend.tap'),tap(1));
 fs.writeFileSync(path.join(dir,'staging.log'),staging);
 fs.writeFileSync(path.join(dir,'browser.tap'),browserTap());
 fs.writeFileSync(path.join(dir,'published-browser.tap'),publishedBrowserTap());
 const values={GITHUB_ACTIONS:'true',GITHUB_SHA:'b'.repeat(40),GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'3',VITE_API_BASE_URL:'https://api.ustara.uz'};
 const originals=Object.fromEntries(Object.keys(values).map(x=>[x,process.env[x]]));
 try{
  Object.assign(process.env,values);
  const record={ciGate:'PASS',productionReady:false,postgresSuites:9,backendUnit:2,frontendUnit:1,
   decisions:185,forwardMigrations:48,browserTests:4,publishBrowserTests:4,publishFiles:3,frontendJsAssets:1,sourceSha:values.GITHUB_SHA,sourceRunId:100,sourceRunAttempt:2,apiBaseSha256:apiBaseSha256(values.VITE_API_BASE_URL),publishTreeSha256:sha256PublishTree(dist)};
  fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(record));
  assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
  record.sourceRunAttempt=3;
  fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(record));
  const report=summarize(dir,dist);assert.equal(report.releaseGate,'PASS');
  assert.equal(report.sourceRunId,100);assert.equal(report.sourceRunAttempt,3);
  assert.doesNotMatch(JSON.stringify(report),/https:\/\/api\.ustara\.uz|postgresql:\/\//);
 }finally{for(const [k,v] of Object.entries(originals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}));

test('v58: Pages build is inspected after build, before any artifact upload',()=>{
 assert.match(verify,/node frontend\/scripts\/verify-pages-build\.mjs frontend\/dist/);
 assert.match(pages,/node frontend\/scripts\/verify-ci-build\.mjs/);
 assert.ok(pages.indexOf('verify-ci-build.mjs')>pages.indexOf('Download exact build'));
 assert.ok(pages.indexOf('verify-pages-build.mjs')<pages.indexOf('actions/upload-pages-artifact@v3'));
});

test('v58: safe Pages output needs matching 404 fallback and real JS entry',()=>withTemp(dir=>{
 const dist=build(dir);
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:3});
 fs.writeFileSync(path.join(dist,'404.html'),'another site');
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 fs.copyFileSync(path.join(dist,'index.html'),path.join(dist,'404.html'));
 fs.rmSync(path.join(dist,'assets','index-A1.js'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));

test('v58: no secret/env/map/symlink files may enter Pages output',()=>withTemp(dir=>{
 const dist=build(dir);
 assert.equal(validatePublishTree(dist),3);
 for(const name of ['.env.production','private.map','.npmrc']){
  fs.writeFileSync(path.join(dist,name),'SENSITIVE');
  assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
  fs.unlinkSync(path.join(dist,name));
 }
 fs.symlinkSync(path.join(dist,'index.html'),path.join(dist,'assets','leak.html'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));

test('v58: Pages build preflight CLI fails without exposing sensitive output',()=>withTemp(dir=>{
 const dist=build(dir);
 const cmd=path.join(root,'frontend/scripts/verify-pages-build.mjs');
 let result=spawnSync(process.execPath,[cmd,dist],{encoding:'utf8'});
 assert.equal(result.status,0);
 fs.writeFileSync(path.join(dist,'.env'),'PRIVATE_PASSWORD_123456');
 result=spawnSync(process.execPath,[cmd,dist],{encoding:'utf8'});
 assert.equal(result.status,1);
 assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_PASSWORD_123456|\.env/);
}));
