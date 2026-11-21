'use strict';
// A release-evidence gate, not a production approval. Verifies on-disk output
// produced by the CI job; all nine PostgreSQL suites must really have run.
// No DB connection, deployment, secrets, or external network access here.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {apiBaseSha256}=require('../../scripts/production-api-url.cjs');
const {parseTapSummary}=require('./v40-staging');
const {TESTS}=require('./v40-staging');
const {auditProject}=require('./audit-phase1');
const {verify}=require('./v45-decision-integrity');
const STAGING_FILES=Object.freeze([...TESTS,
 'v46QueueLifecycle.postgres.integration.test.js',
 'v49ConsentLock.postgres.integration.test.js',
 'v53QrFinalBoundaries.postgres.integration.test.js',
 'v54QrShopWorker.postgres.integration.test.js']);
function fail(message){throw new Error(`v55: ${message}; NOT PASS`);}
function requiredFile(name){
 try{const value=fs.readFileSync(name,'utf8');if(!value.trim())fail('empty evidence file');return value;}
 catch(e){if(e.message.includes('NOT PASS'))throw e;return fail('missing evidence file');}
}
function validateStagingTranscript(log){
 const actual=[...log.matchAll(/^v41 staging: ([^:\r\n]+): (\d+)\/(\d+) PASS, 0 skipped\r?$/gm)];
 if(actual.length!==STAGING_FILES.length)fail('nine PostgreSQL suite results required');
 const seen=new Set();
 for(const [index,[,file,passed,total]] of actual.entries()){
  if(file!==STAGING_FILES[index]||seen.has(file)||!Number.isSafeInteger(Number(total))
     ||Number(total)<1||Number(passed)!==Number(total))
   fail('staging suite missing, repeated, out of order or inconsistent');
  seen.add(file);
 }
 // v56: only one terminal success marker, after all nine suites. A recycled
 // completion line or an out-of-order transcript is never release evidence.
 const finalMarker='v54: nine real PostgreSQL suites PASS, zero SKIP.';
 const markers=[...log.matchAll(/^v54: nine real PostgreSQL suites PASS, zero SKIP\.\r?$/gm)];
 if(seen.size!==STAGING_FILES.length||markers.length!==1||
    !log.trimEnd().endsWith(finalMarker))fail('v54 completion marker missing or duplicated');
 return STAGING_FILES.length;
}
const {validateBuiltFrontend,validatePublishTree,sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
// A browser transcript is REQUIRED evidence, not a runnable unit/mock substitute.
// Check nested real customer/mobile, barber/desktop and admin cases and no skipped tests.
function validateBrowserTranscript(log){
 const result=parseTapSummary(log);
 // A single real parent test with exactly three ordered Chrome scenarios.
 // Reject extra fake nested `ok` rows, missing nested plan or duplicated subtests.
 const expected=[
  'customer: 390px, bitta so‘rov, mustaqil hisob va kutish vaqti',
  'barber: 1440px, bitta so‘rov, mustaqil hisob va kutish vaqti',
  'admin: takroriy bosish bitta so‘rov, 5-xatoda bir daqiqa va muddatdan keyin kirish'
 ];
 const lines=String(log).split(/\r?\n/);
 const nestedResults=lines.filter(x=>/^    ok [1-9]\d* - /.test(x));
 const nestedNames=lines.filter(x=>/^    # Subtest: /.test(x));
 const plans=lines.filter(x=>/^    1\.\.\d+$/.test(x));
 const outer=lines.filter(x=>/^# Subtest: /.test(x));
 if(result.tests!==4||result.pass!==4||nestedResults.length!==3||nestedNames.length!==3||
    plans.length!==1||plans[0]!=='    1..3'||outer.length!==1||
    outer[0]!=='# Subtest: Login E2E: Chrome, React, HTTP va PostgreSQL'||
    !lines.includes('ok 1 - Login E2E: Chrome, React, HTTP va PostgreSQL'))
  fail('Chrome E2E parent or exact three-scenario plan missing');
 for(let i=0;i<3;i++){
  if(nestedResults[i]!==`    ok ${i+1} - ${expected[i]}`||
     nestedNames[i]!==`    # Subtest: ${expected[i]}`)
   fail('Chrome E2E scenario missing, duplicated or out of order');
 }
 if(lines.some(x=>/^\s*(?:not ok [1-9]\d* -|ok [1-9]\d* - .*# (?:SKIP|TODO))/.test(x)))
  fail('Chrome E2E contains failure or skip');
 return result.tests;
}
function validatePublishedBrowserTranscript(log){
 const result=parseTapSummary(log);
 const expected=['mobile: 390px production login rendered',
  'desktop: 1440px production admin rendered',
  'SPA fallback: direct forgot-password route renders'];
 const lines=String(log).split(/\r?\n/);
 const names=lines.filter(x=>/^    # Subtest: /.test(x));
 const results=lines.filter(x=>/^    ok [1-9][0-9]* - /.test(x));
 const plans=lines.filter(x=>/^    1\.\.[0-9]+$/.test(x));
 if(result.tests!==4||result.pass!==4||
    lines.filter(x=>/^# Subtest: /.test(x)).join('')!==
      '# Subtest: Published bundle: Chrome, real Vite dist and SPA fallback'||
    !lines.includes('ok 1 - Published bundle: Chrome, real Vite dist and SPA fallback')||
    names.length!==3||results.length!==3||plans.length!==1||plans[0]!=='    1..3')
  fail('published Chrome bundle E2E missing, malformed or skipped');
 for(let i=0;i<3;i++){
  if(names[i]!==`    # Subtest: ${expected[i]}`||results[i]!==`    ok ${i+1} - ${expected[i]}`)
   fail('published Chrome bundle routes missing, duplicated or out of order');
 }
 return result.tests;
}
function verifiedSourceCommit(projectRoot,env=process.env){
 if(env.GITHUB_ACTIONS!=='true')return null;
 if(!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))fail('missing GitHub source SHA');
 let actual;
 try{actual=execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,
   encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();}
 catch{fail('cannot verify GitHub checkout');}
 if(actual!==env.GITHUB_SHA)fail('source SHA differs from verified checkout');
 return actual;
}
function verifiedSourceRun(env=process.env){
 if(env.GITHUB_ACTIONS!=='true')return null;
 const id=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT;
 if(!/^[1-9][0-9]{0,15}$/.test(id||'') || !/^[1-9][0-9]{0,5}$/.test(attempt||'') ||
   !Number.isSafeInteger(Number(id)) || !Number.isSafeInteger(Number(attempt)))
  fail('missing exact CI run provenance');
 return {runId:Number(id),runAttempt:Number(attempt)};
}
function verifyReleaseEvidence({logsDir,frontendDist,
 projectRoot=path.resolve(__dirname,'../..')}={}){
 if(!logsDir||!frontendDist)fail('explicit evidence and frontend output paths required');
 const backend=parseTapSummary(requiredFile(path.join(logsDir,'backend.tap')));
 const frontend=parseTapSummary(requiredFile(path.join(logsDir,'frontend.tap')));
 // v156: in the actual release job, re-check the transcripts themselves.
 // Never trust a standalone or recycled JSON attestation as runtime proof.
 if(process.env.USTARA_V156_REQUIRE_COMPLETE_MATRIX==='1'){
  const {verifyFullUnitCoverage}=require('./v156-unit-coverage');
  verifyFullUnitCoverage({projectRoot,logsDir});
 }
 const postgresSuites=validateStagingTranscript(requiredFile(path.join(logsDir,'staging.log')));
 const browserTests=validateBrowserTranscript(requiredFile(path.join(logsDir,'browser.tap')));
 const publishBrowserTests=validatePublishedBrowserTranscript(requiredFile(path.join(logsDir,'published-browser.tap')));
 const assets=validateBuiltFrontend(frontendDist);
 const publishFiles=validatePublishTree(frontendDist);
 const publishTreeSha256=sha256PublishTree(frontendDist);
 const sourceSha=verifiedSourceCommit(projectRoot);
 const run=verifiedSourceRun();
 let configHash=null;
 if(process.env.GITHUB_ACTIONS==='true'){
  try{configHash=apiBaseSha256(process.env.VITE_API_BASE_URL);}
  catch{fail('invalid production API origin');}
 }
 const audit=auditProject(projectRoot);
 if(audit.decisionCount!==185||audit.migrationCount!==63)fail('offline structural audit mismatch');
 const register=verify(path.join(projectRoot,'docs','USTARA_185_NAZORAT.csv'));
 if(register.decisions!==185||register.status!=='integrity_verified_not_feature_complete')
  fail('decision-integrity audit mismatch');
 return {version:'v55',ciGate:'PASS',backendUnit:backend.pass,frontendUnit:frontend.pass,
  postgresSuites,browserTests,publishBrowserTests,frontendJsAssets:assets,publishFiles,publishTreeSha256,sourceSha,
  sourceRunId:run?.runId??null,sourceRunAttempt:run?.runAttempt??null,
  apiBaseSha256:configHash,decisions:185,forwardMigrations:63,
  // Integration of actual Telegram delivery and mobile-browser E2E is separate.
  telegramLiveE2E:'NOT_RUN',mobileBrowserE2E:'NOT_RUN',productionReady:false};
}
if(require.main===module){
 try{const result=verifyReleaseEvidence({logsDir:process.argv[2],
  frontendDist:path.resolve(__dirname,'../../frontend/dist')});
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={STAGING_FILES,validateStagingTranscript,validateBrowserTranscript,validateBuiltFrontend,
 validatePublishTree,validatePublishedBrowserTranscript,verifiedSourceCommit,verifiedSourceRun,verifyReleaseEvidence};
