'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {sha256PublishTree,verifyPagesOutput}=require('../../scripts/publish-tree-check.cjs');
const {summarize}=require('../scripts/v56-ci-summary');
const {STAGING_FILES}=require('../scripts/v55-release-gate');
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
const {apiBaseSha256}=require('../../scripts/production-api-url.cjs');
const root=path.resolve(__dirname,'../..');
const ci=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
const pages=fs.readFileSync(path.join(root,'.github/workflows/deploy-pages.yml'),'utf8');
function temp(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v62-'));
 try{return run(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function distAt(dir){
 const dist=path.join(dir,'dist');fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 const html='<script type="module" src="/USTARA-New/assets/app-A.js"></script>';
 fs.writeFileSync(path.join(dist,'index.html'),html);
 fs.writeFileSync(path.join(dist,'404.html'),html);
 fs.writeFileSync(path.join(dist,'assets','app-A.js'),'console.log("ready");');
 return dist;
}
function identity(hash){
 return {releaseGate:'PASS',productionReady:false,sourceSha:'c'.repeat(40),sourceRunId:12345,sourceRunAttempt:2,
  apiBaseSha256:apiBaseSha256('https://api.ustara.uz'),publishTreeSha256:hash,
  backend:{status:'PASS'},frontend:{status:'PASS'},postgres:{status:'PASS',suites:9},
  browser:{status:'PASS',tests:4},publishedBrowser:{status:'PASS',tests:4},viteBuild:'ARTIFACT_VERIFIED',
  frontendJsAssets:1,publishFiles:3};
}
const provenance={sha:'c'.repeat(40),apiBaseUrl:'https://api.ustara.uz',runId:12345,runAttempt:2};
const tap=n=>'TAP version 13\n'+Array.from({length:n},(_,i)=>`ok ${i+1} - test`).join('\n')+`\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const stage=STAGING_FILES.map(x=>`v41 staging: ${x}: 1/1 PASS, 0 skipped`).join('\n')+'\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';

test('v62: SHA-256 identity is deterministic across copying and directory enumeration',()=>temp(dir=>{
 const a=distAt(dir),hash=sha256PublishTree(a);
 assert.match(hash,/^[a-f0-9]{64}$/);
 const elsewhere=path.join(dir,'elsewhere');fs.cpSync(a,elsewhere,{recursive:true});
 assert.equal(sha256PublishTree(elsewhere),hash);
 assert.deepEqual(verifyPagesOutput(elsewhere),{assets:1,files:3});
 fs.writeFileSync(path.join(elsewhere,'assets','app-A.js'),'console.log("altered");');
 assert.notEqual(sha256PublishTree(elsewhere),hash);
}));

test('v62: even one added file or changed SPA fallback changes the verified digest',()=>temp(dir=>{
 const dist=distAt(dir),hash=sha256PublishTree(dist);
 fs.writeFileSync(path.join(dist,'assets','extra.css'),'body{}');
 assert.notEqual(sha256PublishTree(dist),hash);
 fs.unlinkSync(path.join(dist,'assets','extra.css'));
 fs.writeFileSync(path.join(dist,'404.html'),'tampered fallback');
 assert.notEqual(sha256PublishTree(dist),hash);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));

test('v62: symlinks and sensitive files cannot be hashed as approved publish trees',()=>temp(dir=>{
 const dist=distAt(dir);
 fs.writeFileSync(path.join(dist,'.env'),'PRIVATE_PASSWORD');
 assert.throws(()=>sha256PublishTree(dist),/NOT PASS/);
 fs.unlinkSync(path.join(dist,'.env'));
 fs.symlinkSync(path.join(dist,'index.html'),path.join(dist,'assets','alias.html'));
 assert.throws(()=>sha256PublishTree(dist),/NOT PASS/);
}));

test('v62: Pages verifies upstream commit/attempt/API and exact CI build bytes',async()=>{
 const {verifyCiBuild}=await import(pathToFileURL(path.join(root,'frontend/scripts/verify-ci-build.mjs')));
 temp(dir=>{
  const dist=distAt(dir),record=identity(sha256PublishTree(dist));
  assert.deepEqual(verifyCiBuild(record,dist,provenance),{digest:record.publishTreeSha256,assets:1,files:3});
  assert.throws(()=>verifyCiBuild(record,dist,{...provenance,runAttempt:1}),/NOT PASS/);
  assert.throws(()=>verifyCiBuild(record,dist,{...provenance,sha:'d'.repeat(40)}),/NOT PASS/);
  assert.throws(()=>verifyCiBuild(record,dist,{...provenance,apiBaseUrl:'https://other.ustara.uz'}),/NOT PASS/);
  assert.throws(()=>verifyCiBuild({...record,publishFiles:4},dist,provenance),/NOT PASS/);
  assert.throws(()=>verifyCiBuild({...record,frontendJsAssets:2},dist,provenance),/NOT PASS/);
  assert.throws(()=>verifyCiBuild({...record,publishTreeSha256:''},dist,provenance),/NOT PASS/);
  fs.writeFileSync(path.join(dist,'assets','app-A.js'),'console.log("tampered");');
  assert.throws(()=>verifyCiBuild(record,dist,provenance),/NOT PASS/);
 });
});

test('v62: Pages checker CLI fails closed, never echoes tampered file content',()=>temp(dir=>{
 const dist=distAt(dir),record=identity(sha256PublishTree(dist));
 const file=path.join(dir,'proof.json');fs.writeFileSync(file,JSON.stringify(record));
 const env={...process.env,VERIFIED_SHA:provenance.sha,VERIFIED_RUN_ID:'12345',VERIFIED_RUN_ATTEMPT:'2',VITE_API_BASE_URL:provenance.apiBaseUrl};
 const script=path.join(root,'frontend/scripts/verify-ci-build.mjs');
 let r=spawnSync(process.execPath,[script,file,dist],{env,encoding:'utf8'});
 assert.equal(r.status,0);
 fs.writeFileSync(path.join(dist,'assets','app-A.js'),'SENSITIVE_RELEASE_CONTENT');
 r=spawnSync(process.execPath,[script,file,dist],{env,encoding:'utf8'});
 assert.equal(r.status,1);
 assert.doesNotMatch(r.stdout+r.stderr,/SENSITIVE_RELEASE_CONTENT/);
}));

test('v62: only successful CI can upload built site; Pages downloads same run+attempt without rebuilding',()=>{
 assert.match(ci,/Create and check the CI-built SPA fallback/);
 assert.match(ci,/Release evidence gate — fail closed/);
 assert.match(ci,/ustara-v62-pages-build-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
 assert.ok(ci.indexOf('v55-release-gate.js')<ci.indexOf('Upload EXACT verified frontend build'));
 assert.match(ci,/path: frontend\/dist\//);
 assert.match(ci,/include-hidden-files: true/);
 assert.match(pages,/ustara-v62-pages-build-\$\{\{ github\.event\.workflow_run\.id \}\}-\$\{\{ github\.event\.workflow_run\.run_attempt \}\}/);
 assert.match(pages,/node frontend\/scripts\/verify-ci-build\.mjs/);
 assert.ok(pages.indexOf('verify-pages-evidence.mjs')<pages.indexOf('Download exact build'));
 assert.ok(pages.indexOf('verify-ci-build.mjs')<pages.indexOf('actions\/upload-pages-artifact@v3'));
 assert.doesNotMatch(pages,/npm ci|npm run build|cp dist\/index\.html dist\/404\.html/);
 assert.equal((pages.match(/repos\.getBranch\(/g)||[]).length,2);
});

test('v62: CI redacted PASS requires exact release SHA-256, not matching counts alone',()=>temp(dir=>{
 const dist=distAt(dir);
 fs.writeFileSync(path.join(dir,'backend.tap'),tap(2));
 fs.writeFileSync(path.join(dir,'frontend.tap'),tap(1));
 fs.writeFileSync(path.join(dir,'staging.log'),stage);
 fs.writeFileSync(path.join(dir,'browser.tap'),browserTap());
 fs.writeFileSync(path.join(dir,'published-browser.tap'),publishedBrowserTap());
 const proof={ciGate:'PASS',productionReady:false,postgresSuites:9,browserTests:4,publishBrowserTests:4,backendUnit:2,
  frontendUnit:1,decisions:185,forwardMigrations:48,publishFiles:3,frontendJsAssets:1,
  publishTreeSha256:sha256PublishTree(dist)};
 const file=path.join(dir,'release.json');const save=()=>fs.writeFileSync(file,JSON.stringify(proof));
 save();assert.equal(summarize(dir,dist).releaseGate,'PASS');
 fs.writeFileSync(path.join(dist,'assets','app-A.js'),'console.log("modified");');
 assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
 proof.publishTreeSha256=sha256PublishTree(dist);save();
 assert.equal(summarize(dir,dist).releaseGate,'PASS');
 proof.publishTreeSha256='0'.repeat(64);save();
 assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
}));

test('v62: allowed .nojekyll stays part of the checksum, unlike forbidden hidden secrets',()=>temp(dir=>{
 const dist=distAt(dir),first=sha256PublishTree(dist);
 fs.writeFileSync(path.join(dist,'.nojekyll'),'');
 assert.notEqual(sha256PublishTree(dist),first);
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:4});
 fs.writeFileSync(path.join(dist,'.npmrc'),'token=PRIVATE');
 assert.throws(()=>sha256PublishTree(dist),/NOT PASS/);
}));
