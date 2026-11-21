'use strict';
// v56: deliberately REDACTED, bounded CI diagnostic. Never copies raw TAP,
// database URLs, exception messages, bot tokens, or arbitrary log lines.
const fs=require('node:fs');
const path=require('node:path');
const {parseTapSummary}=require('./v40-staging');
const {validateStagingTranscript,validateBrowserTranscript,validatePublishedBrowserTranscript,validateBuiltFrontend,validatePublishTree,verifiedSourceRun}=require('./v55-release-gate');
const {apiBaseSha256}=require('../../scripts/production-api-url.cjs');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
function safely(read){try{return read();}catch{return null;}}
function readLog(dir,name){return fs.readFileSync(path.join(dir,name),'utf8');}
function summarize(logDir,distDir){
 const tap=name=>safely(()=>{
  const r=parseTapSummary(readLog(logDir,name));
  return {status:'PASS',tests:r.tests,pass:r.pass,skipped:0};
 })||{status:'NOT_VERIFIED'};
 const backend=tap('backend.tap');
 const frontend=tap('frontend.tap');
 const staging=safely(()=>validateStagingTranscript(readLog(logDir,'staging.log')));
 const browserTests=safely(()=>validateBrowserTranscript(readLog(logDir,'browser.tap')));
 const publishBrowserTests=safely(()=>validatePublishedBrowserTranscript(readLog(logDir,'published-browser.tap')));
 const assets=safely(()=>validateBuiltFrontend(distDir));
 const publishFiles=safely(()=>validatePublishTree(distDir));
 const publishTreeSha256=safely(()=>sha256PublishTree(distDir));
 const sourceSha=/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||'')?process.env.GITHUB_SHA:null;
 const configHash=safely(()=>apiBaseSha256(process.env.VITE_API_BASE_URL));
 const run=safely(()=>verifiedSourceRun());
 const provenanceOk=process.env.GITHUB_ACTIONS!=='true' ||
   (sourceSha!==null && configHash!==null && run!==null);
 const ready=safely(()=>{
  const record=JSON.parse(readLog(logDir,'release.json'));
  return provenanceOk && backend.status==='PASS' && frontend.status==='PASS' &&
    staging===9 && browserTests===4 && publishBrowserTests===4 &&
    Number.isSafeInteger(assets) && assets>0 && Number.isSafeInteger(publishFiles) && publishFiles>=2 &&
    record.ciGate==='PASS' && record.productionReady===false &&
    record.postgresSuites===9 && record.browserTests===browserTests &&
    record.publishBrowserTests===publishBrowserTests &&
    record.backendUnit===backend.pass &&
    record.frontendUnit===frontend.pass && record.publishFiles===publishFiles &&
    record.frontendJsAssets===assets && record.publishTreeSha256===publishTreeSha256 &&
    typeof publishTreeSha256==='string' && /^[a-f0-9]{64}$/.test(publishTreeSha256) && record.decisions===185 &&
    record.forwardMigrations===48 &&
    (process.env.GITHUB_ACTIONS!=='true' ||
      (record.sourceSha===sourceSha && record.apiBaseSha256===configHash &&
       record.sourceRunId===run.runId && record.sourceRunAttempt===run.runAttempt));
 });
 return {version:'v63',kind:'redacted_diagnostics_only',
  sourceSha,sourceRunId:run?.runId??null,sourceRunAttempt:run?.runAttempt??null,
  apiBaseSha256:configHash,backend,frontend,
  postgres:{status:staging===9?'PASS':'NOT_VERIFIED',suites:staging===9?9:0},
  browser:{status:browserTests===4?'PASS':'NOT_VERIFIED',tests:browserTests===4?browserTests:0},
  publishedBrowser:{status:publishBrowserTests===4?'PASS':'NOT_VERIFIED',tests:publishBrowserTests===4?publishBrowserTests:0},
  viteBuild:assets>0 && publishFiles>=2 && publishTreeSha256?'ARTIFACT_VERIFIED':'NOT_VERIFIED',
  publishTreeSha256:publishTreeSha256??null,
  releaseGate:ready?'PASS':'NOT_VERIFIED',
  liveTelegram:'NOT_RUN',mobileBrowserE2E:'NOT_RUN',productionReady:false};
}
if(require.main===module){
 const dir=process.argv[2]||'';
 const dist=process.argv[3]||'';
 // Always output sanitized diagnostics, even when prior steps failed.
 console.log(JSON.stringify(summarize(dir,dist),null,2));
}
module.exports={summarize};
