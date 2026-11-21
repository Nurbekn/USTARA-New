'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {validateProductionApiBaseUrl,apiBaseSha256}=require('../../scripts/production-api-url.cjs');
const {validatePublishTree,verifiedSourceCommit}=require('../scripts/v55-release-gate');
const {summarize}=require('../scripts/v56-ci-summary');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
const yaml=(name)=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');
const pages=yaml('deploy-pages.yml'),ci=yaml('v55-verify.yml');
function temp(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v57-'));
 try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const stageFiles=require('../scripts/v55-release-gate').STAGING_FILES;
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
function tap(n){return `TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - test`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;}
const stage=()=>stageFiles.map(f=>`v41 staging: ${f}: 1/1 PASS, 0 skipped`).join('\n')+'\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';

test('v57: production API is canonical HTTPS public DNS origin, never localhost/path/credentials',()=>{
 for(const good of ['https://api.ustara.uz','https://api.ustara.uz/','https://api.ustara.uz:8443'])
  assert.ok(validateProductionApiBaseUrl(good).startsWith('https://api.ustara.uz'));
 assert.equal(validateProductionApiBaseUrl('https://api.ustara.uz/'),'https://api.ustara.uz');
 assert.equal(apiBaseSha256('https://api.ustara.uz'),apiBaseSha256('https://api.ustara.uz/'));
 for(const bad of ['',undefined,'http://api.ustara.uz','http://127.0.0.1:3001',
  'https://localhost','https://127.0.0.1','https://api.internal',
  'https://api.example','https://api.ustara.uz/api',
  'https://api.ustara.uz?key=abc','https://api.ustara.uz/#hash',
  'https://user:pass@api.ustara.uz','https://api.ustara.uz.evil.test',
  'https://api.ustara.uz\n','https://api.ustara.uz//'])
  assert.throws(()=>validateProductionApiBaseUrl(bad),/NOT PASS/);
});

test('v57: build-time validation CLI fails closed and does not echo invalid URL',()=>{
 const command=path.join(root,'frontend/scripts/validate-production-api.mjs');
 const invalid='http://user:SECRET_PASSWORD@127.0.0.1:3001';
 const no=spawnSync(process.execPath,[command],{env:{...process.env,VITE_API_BASE_URL:invalid},encoding:'utf8'});
 assert.equal(no.status,1);
 assert.doesNotMatch(no.stdout+no.stderr,/SECRET_PASSWORD|127\.0\.0\.1/);
 const yes=spawnSync(process.execPath,[command],{env:{...process.env,VITE_API_BASE_URL:'https://api.ustara.uz'},encoding:'utf8'});
 assert.equal(yes.status,0);
});

test('v57: Pages deploys are serialized across all commits, never cancel newer by stale webhook',()=>{
 assert.match(pages,/group: ustara-pages-main/);
 assert.match(pages,/cancel-in-progress: false/);
 assert.doesNotMatch(pages,/group: pages-\$\{\{/);
 assert.equal((pages.match(/repos\.getBranch\(/g)||[]).length,2);
 assert.match(pages,/workflow_run:/);
 assert.match(pages,/head_repository\.full_name == github\.repository/);
});

test('v57: CI and Pages both validate the same repository production API variable',()=>{
 assert.match(ci,/VITE_API_BASE_URL: \$\{\{ vars\.VITE_API_BASE_URL \}\}/);
 assert.match(pages,/VITE_API_BASE_URL: \$\{\{ vars\.VITE_API_BASE_URL \}\}/);
 assert.match(ci,/node frontend\/scripts\/validate-production-api\.mjs/);
 assert.match(pages,/node frontend\/scripts\/verify-ci-build\.mjs/);
 assert.doesNotMatch(ci,/VITE_API_BASE_URL:\s*http:\/\//);
});

test('v57: Pages only accepts artifact from the exact upstream run, not arbitrary filenames',()=>{
 assert.match(pages,/actions:\s*read/);
 assert.match(pages,/actions\/download-artifact@v4/);
 assert.match(pages,/run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
 assert.match(pages,/name: ustara-v58-ci-summary-\$\{\{ github\.event\.workflow_run\.id \}\}-\$\{\{ github\.event\.workflow_run\.run_attempt \}\}/);
 assert.match(pages,/node frontend\/scripts\/verify-pages-evidence\.mjs/);
 assert.ok(pages.indexOf('verify-pages-evidence.mjs')<pages.indexOf('Download exact build'));
 assert.match(ci,/cp frontend\/dist\/index\.html frontend\/dist\/404\.html/);
});

test('v57: proof validator accepts correct report, rejects altered commit/config/results',async()=>{
 const mod=await import(path.join(root,'frontend/scripts/verify-pages-evidence.mjs'));
 const sha='a'.repeat(40),api='https://api.ustara.uz';
 const record={releaseGate:'PASS',productionReady:false,sourceSha:sha,sourceRunId:77,sourceRunAttempt:2,
  apiBaseSha256:apiBaseSha256(api),publishTreeSha256:'a'.repeat(64),backend:{status:'PASS'},frontend:{status:'PASS'},
  postgres:{status:'PASS',suites:9},browser:{status:'PASS',tests:4},publishedBrowser:{status:'PASS',tests:4},viteBuild:'ARTIFACT_VERIFIED'};
 assert.equal(mod.verifyPagesEvidence(record,{sha,apiBaseUrl:api,runId:77,runAttempt:2}),true);
 const invalid=[{...record,sourceSha:'b'.repeat(40)},
  {...record,apiBaseSha256:'0'.repeat(64)},
  {...record,releaseGate:'NOT_VERIFIED'},
  {...record,postgres:{status:'NOT_VERIFIED',suites:0}},
  {...record,viteBuild:'NOT_VERIFIED'},
  {...record,productionReady:true}];
 for(const bad of invalid) assert.throws(()=>mod.verifyPagesEvidence(bad,{sha,apiBaseUrl:api,runId:77,runAttempt:2}),/NOT PASS/);
 assert.throws(()=>mod.verifyPagesEvidence(record,{sha,apiBaseUrl:'http://localhost:3000',runId:77,runAttempt:2}),/NOT PASS/);
});

test('v57: published build tree rejects sourcemaps, .env files and symlinks',()=>{
 temp(dir=>{
  fs.mkdirSync(path.join(dir,'assets'));
  fs.writeFileSync(path.join(dir,'index.html'),'html');
  fs.writeFileSync(path.join(dir,'assets','main.js'),'javascript');
  assert.equal(validatePublishTree(dir),2);
  const map=path.join(dir,'assets','main.js.map');
  fs.writeFileSync(map,'source');
  assert.throws(()=>validatePublishTree(dir),/NOT PASS/);fs.unlinkSync(map);
  fs.writeFileSync(path.join(dir,'.env.production'),'SECRET');
  assert.throws(()=>validatePublishTree(dir),/NOT PASS/);fs.unlinkSync(path.join(dir,'.env.production'));
  fs.symlinkSync(path.join(dir,'index.html'),path.join(dir,'assets','link.html'));
  assert.throws(()=>validatePublishTree(dir),/NOT PASS/);
 });
});

test('v57: GitHub provenance guard fails on wrong SHA and absent checkout',()=>{
 assert.equal(verifiedSourceCommit(root,{GITHUB_ACTIONS:'false'}),null);
 assert.throws(()=>verifiedSourceCommit(root,{GITHUB_ACTIONS:'true',GITHUB_SHA:'invalid'}),/NOT PASS/);
 assert.throws(()=>verifiedSourceCommit(root,{GITHUB_ACTIONS:'true',GITHUB_SHA:'0'.repeat(40)}),/NOT PASS/);
});

test('v57: redacted CI report binds hash and upstream SHA; no private URL data',()=>{
 temp(dir=>{
  const dist=path.join(dir,'dist');const assets=path.join(dist,'assets');fs.mkdirSync(assets,{recursive:true});
  fs.writeFileSync(path.join(dist,'index.html'),'<script type="module" src="/USTARA-New/assets/app.js"></script>');
  fs.writeFileSync(path.join(assets,'app.js'),'var a=1;');
  fs.writeFileSync(path.join(dir,'backend.tap'),tap(1));
  fs.writeFileSync(path.join(dir,'frontend.tap'),tap(1));
  fs.writeFileSync(path.join(dir,'staging.log'),stage());
  fs.writeFileSync(path.join(dir,'browser.tap'),browserTap());
  fs.writeFileSync(path.join(dir,'published-browser.tap'),publishedBrowserTap());
  const sha='b'.repeat(40),api='https://api.ustara.uz';
  const saved={GITHUB_SHA:process.env.GITHUB_SHA,GITHUB_ACTIONS:process.env.GITHUB_ACTIONS,VITE_API_BASE_URL:process.env.VITE_API_BASE_URL,
   GITHUB_RUN_ID:process.env.GITHUB_RUN_ID,GITHUB_RUN_ATTEMPT:process.env.GITHUB_RUN_ATTEMPT};
  try{
   Object.assign(process.env,{GITHUB_SHA:sha,GITHUB_ACTIONS:'true',VITE_API_BASE_URL:api,GITHUB_RUN_ID:'77',GITHUB_RUN_ATTEMPT:'2'});
   const proof={ciGate:'PASS',productionReady:false,postgresSuites:9,browserTests:4,publishBrowserTests:4,backendUnit:1,
      frontendUnit:1,decisions:185,forwardMigrations:48,publishFiles:2,frontendJsAssets:1,sourceSha:sha,
      sourceRunId:77,sourceRunAttempt:2,apiBaseSha256:apiBaseSha256(api),publishTreeSha256:sha256PublishTree(dist)};
   fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(proof));
   let report=summarize(dir,dist);
   assert.equal(report.releaseGate,'PASS');
   assert.equal(report.sourceSha,sha);
   assert.equal(report.apiBaseSha256,apiBaseSha256(api));
   assert.doesNotMatch(JSON.stringify(report),/api\.ustara\.uz|postgresql:\/\//);
   proof.apiBaseSha256='bad';
   fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(proof));
   report=summarize(dir,dist);
   assert.equal(report.releaseGate,'NOT_VERIFIED');
  }finally{
   for(const [key,value] of Object.entries(saved)) {
    if(value===undefined)delete process.env[key];else process.env[key]=value;
   }
  }
 });
});
