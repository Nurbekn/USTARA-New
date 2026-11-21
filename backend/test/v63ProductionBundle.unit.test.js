'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {lookupPath,servePages}=require('./helpers/v63StaticPages');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
const {validatePublishedBrowserTranscript}=require('../scripts/v55-release-gate');
const {summarize}=require('../scripts/v56-ci-summary');
const {STAGING_FILES}=require('../scripts/v55-release-gate');
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
const tap=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - test`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const stage=STAGING_FILES.map(x=>`v41 staging: ${x}: 1/1 PASS, 0 skipped`).join('\n')+'\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v63-'));
 const dist=path.join(dir,'dist');fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 const html='<html><body><div id="root"></div><script type="module" src="/USTARA-New/assets/app.js"></script></body></html>';
 fs.writeFileSync(path.join(dist,'index.html'),html);
 fs.writeFileSync(path.join(dist,'404.html'),html);
 fs.writeFileSync(path.join(dist,'assets','app.js'),'console.log("loaded")');
 return {dir,dist,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('v63: only loopback SPA build routes may resolve; traversal/protocol routes are forbidden',()=>{
 const f=fixture();try{
  assert.equal(lookupPath(f.dist,'/USTARA-New/').full,path.join(f.dist,'index.html'));
  assert.equal(lookupPath(f.dist,'/USTARA-New/login').full,path.join(f.dist,'404.html'));
  assert.equal(lookupPath(f.dist,'/USTARA-New/assets/app.js?v=1').type,'text/javascript; charset=utf-8');
  for(const bad of ['/etc/passwd','/USTARA-New/../package.json',
   '/USTARA-New/%2e%2e/package.json','/USTARA-New/%2fetc/passwd',
   '/USTARA-New/%zz','/USTARA-New//assets/app.js','/USTARA-New/%5csecret',
   '/USTARA-New/.env','/USTARA-New/../index.html','/USTARA-New/unknown.map'])
   assert.equal(lookupPath(f.dist,bad),null,bad);
 }finally{f.close();}
});
test('v63: static server serves compiled JS and SPA fallback without API proxy or cache',async()=>{
 const f=fixture();const server=await servePages(f.dist);
 try{
  assert.match(server.url,/^http:\/\/127\.0\.0\.1:\d+$/);
  for(const location of ['/USTARA-New/','/USTARA-New/login','/USTARA-New/admin']){
   const res=await fetch(server.url+location);assert.equal(res.status,200);
   assert.match(await res.text(),/<div id="root">/);
   assert.equal(res.headers.get('cache-control'),'no-store');
   assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
  }
  const js=await fetch(server.url+'/USTARA-New/assets/app.js');
  assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/text\/javascript/);
  for(const route of ['/api/auth/login','/USTARA-New/../secret.sql','/USTARA-New/nonexistent.js']){
   assert.equal((await fetch(server.url+route)).status,404);
  }
  assert.equal((await fetch(server.url+'/USTARA-New/login',{method:'POST'})).status,404);
 }finally{await server.close();f.close();}
});
test('v63: production Chrome TAP requires the exact three real bundle scenarios',()=>{
 const good=publishedBrowserTap();assert.equal(validatePublishedBrowserTranscript(good),4);
 for(const bad of [
  good.replace('mobile: 390px','mobile: 450px'),
  good.replace('    ok 2 - desktop:','    not ok 2 - desktop:'),
  good.replace('    ok 1 - mobile:','    ok 2 - mobile:'),
  good.replace('    1..3','    1..2'),
  good.replace('# pass 4','# pass 3'),
  good.replace('    ok 3 - SPA','    ok 3 - SPA # SKIP'),
  good.replace('ok 1 - Published bundle','ok 2 - Published bundle'),
  good.replace('    # Subtest: desktop: 1440px production admin rendered\n','')])
  assert.throws(()=>validatePublishedBrowserTranscript(bad),/NOT PASS/);
});
test('v63: redacted CI refuses PASS if real built-bundle smoke TAP is absent or altered',()=>{
 const f=fixture();try{
  for(const [name,content] of [['backend.tap',tap(2)],['frontend.tap',tap(1)],
    ['staging.log',stage],['browser.tap',browserTap()]])fs.writeFileSync(path.join(f.dir,name),content);
  const proof={ciGate:'PASS',productionReady:false,postgresSuites:9,browserTests:4,publishBrowserTests:4,
   backendUnit:2,frontendUnit:1,decisions:185,forwardMigrations:48,publishFiles:3,frontendJsAssets:1,
   publishTreeSha256:sha256PublishTree(f.dist)};
  fs.writeFileSync(path.join(f.dir,'release.json'),JSON.stringify(proof));
  assert.equal(summarize(f.dir,f.dist).releaseGate,'NOT_VERIFIED');
  fs.writeFileSync(path.join(f.dir,'published-browser.tap'),publishedBrowserTap());
  assert.equal(summarize(f.dir,f.dist).releaseGate,'PASS');
  assert.deepEqual(summarize(f.dir,f.dist).publishedBrowser,{status:'PASS',tests:4});
  fs.writeFileSync(path.join(f.dir,'published-browser.tap'),publishedBrowserTap().replace('    ok 1','    not ok 1'));
  assert.equal(summarize(f.dir,f.dist).releaseGate,'NOT_VERIFIED');
  assert.equal(summarize(f.dir,f.dist).publishedBrowser.status,'NOT_VERIFIED');
 }finally{f.close();}
});
test('v63: Pages accepts only proof with actual production-bundle smoke',async()=>{
 const {verifyPagesEvidence}=await import(path.join(root,'frontend/scripts/verify-pages-evidence.mjs'));
 const {apiBaseSha256}=require('../../scripts/production-api-url.cjs');
 const sha='b'.repeat(40),apiBaseUrl='https://api.ustara.uz';
 const evidence={releaseGate:'PASS',productionReady:false,sourceSha:sha,sourceRunId:1,sourceRunAttempt:1,
  apiBaseSha256:apiBaseSha256(apiBaseUrl),publishTreeSha256:'a'.repeat(64),
  backend:{status:'PASS'},frontend:{status:'PASS'},postgres:{status:'PASS',suites:9},
  browser:{status:'PASS',tests:4},publishedBrowser:{status:'PASS',tests:4},viteBuild:'ARTIFACT_VERIFIED'};
 const provenance={sha,runId:1,runAttempt:1,apiBaseUrl};
 assert.equal(verifyPagesEvidence(evidence,provenance),true);
 for(const bad of [undefined,{status:'NOT_VERIFIED',tests:4},{status:'PASS',tests:3},{status:'PASS',tests:'4'}])
  assert.throws(()=>verifyPagesEvidence({...evidence,publishedBrowser:bad},provenance),/NOT PASS/);
});
test('v63: CI verifies real build with Chrome before release proof and Pages publish',()=>{
 const ci=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
 assert.match(ci,/USTARA_PAGES_BUILD_SMOKE: '1'/);
 assert.match(ci,/test\/pagesBuild\.browser\.e2e\.test\.js/);
 assert.ok(ci.indexOf('Create and check the CI-built SPA fallback')<ci.indexOf('Real Chrome smoke of the exact built production bundle'));
 assert.ok(ci.indexOf('Real Chrome smoke of the exact built production bundle')<ci.indexOf('Release evidence gate — fail closed'));
 assert.match(ci,/published-browser\.tap/);
 const smoke=fs.readFileSync(path.join(root,'backend/test/pagesBuild.browser.e2e.test.js'),'utf8');
 assert.match(smoke,/servePages\(dist\)/);assert.doesNotMatch(smoke,/createServer\(|vite\/dist\/node\/index/);
});
