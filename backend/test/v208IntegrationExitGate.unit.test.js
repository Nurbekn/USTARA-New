'use strict';
// Offline unit/regression tests: no database connections or .env files.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {captureTap, runBookingIntegration} = require('../scripts/v208-integration-exit-gate.cjs');
const {EXPECTED_CASES} = require('../scripts/v203-integration-case-coverage.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/v193-isolated-postgres-booking.yml'), 'utf8');
const env = {
  NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:fixture-only@127.0.0.1:5432/ustara_test_db',
  GITHUB_ACTIONS: 'true',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REPOSITORY: 'Nurbekn/USTARA-New',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: 'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_RUN_ID: '321',
  GITHUB_RUN_ATTEMPT: '2',
};
function tap() {
  const lines = ['TAP version 13', `# Subtest: ${REQUIRED}`];
  for (let i=0; i<EXPECTED_CASES.length; i++) {
    lines.push(`    # Subtest: ${EXPECTED_CASES[i]}`, `    ok ${i + 1} - ${EXPECTED_CASES[i]}`);
  }
  lines.push('    1..12',`ok 1 - ${REQUIRED}`, '1..1',
    '# tests 13','# suites 0','# pass 13','# fail 0','# cancelled 0',
    '# skipped 0','# todo 0','# duration_ms 10');
  return lines.join('\n')+'\n';
}
const launch = (js, opts={}) => captureTap({command:process.execPath, args:['-e', js], timeoutMs:1200, ...opts});

test('v208: subprocess exit 0 collects complete stdout rather than trusting a partial pipe',async()=>{
  const value = await launch(`process.stdout.write(${JSON.stringify(tap())})`);
  assert.equal(value, tap());
});
test('v208: exit code 1 rejects even if stdout claims all 13 tests passed',async()=>{
  await assert.rejects(launch(`process.stdout.write(${JSON.stringify(tap())}); process.exitCode=1`),/nonzero exit or signal/);
});
test('v208: killed subprocess rejects even after valid TAP',async()=>{
  await assert.rejects(launch(`process.stdout.write(${JSON.stringify(tap())}); process.kill(process.pid,'SIGTERM')`),/nonzero exit or signal/);
});
test('v208: child timeout is bounded and does not pretend success',async()=>{
  await assert.rejects(launch('setTimeout(()=>{},2000)',{timeoutMs:70}),/timeout/);
});
test('v208: TAP byte limit kills oversized output',async()=>{
  await assert.rejects(launch('process.stdout.write("x".repeat(100000))',{maxBytes:1000}),/oversized TAP output/);
});
test('v208: successful process with no TAP is rejected',async()=>{
  await assert.rejects(launch(''),/no TAP/);
});
test('v208: impossible command cannot count as passing',async()=>{
  await assert.rejects(captureTap({command:'/nonexistent/ustara-v208-invalid',args:[],timeoutMs:200}),/spawn error/);
});
test('v208: blocked test target must never start integration or write artifact',async()=>{
  let started=false, saved=false;
  await assert.rejects(runBookingIntegration({env:{...env, USTARA_TEST_DATABASE_URL:'postgresql://postgres:a@127.0.0.1:5432/production'},
    runTap:async()=>{started=true; return tap();}, persist:()=>{saved=true;}}),/v193|local/);
  assert.equal(started,false);
  assert.equal(saved,false);
});
test('v208: invalid TAP cannot create evidence even if the process shim returns',async()=>{
  let saved=false;
  await assert.rejects(runBookingIntegration({env,runTap:async()=>tap().replace('# pass 13','# pass 12'),
    persist:()=>{saved=true;}}),/v195|v20/);
  assert.equal(saved,false);
});
test('v208: missing required nested concurrency case fails closed',async()=>{
  let saved=false;
  await assert.rejects(runBookingIntegration({env,runTap:async()=>tap().replace(EXPECTED_CASES[0],'faked assertion'),
    persist:()=>{saved=true;}}),/v203/);
  assert.equal(saved,false);
});
test('v208: after verified child TAP, evidence is bound to CI attempt and only then persisted',async()=>{
  let written;
  const result=await runBookingIntegration({env,runTap:async()=>tap(),persist:(target,evidence)=>{written={target,evidence};}});
  assert.deepEqual(result,{tests:13,passed:13});
  assert.equal(written.target,DEFAULT_OUTPUT);
  assert.equal(written.evidence.ciRunId,'321');
  assert.equal(written.evidence.ciRunAttempt,'2');
  assert.equal(written.evidence.failed,0);
  assert.equal(written.evidence.tapSha256.length,64);
  assert.doesNotMatch(JSON.stringify(written.evidence),/postgresql:|fixture-only|password/i);
});
test('v208: existing evidence is not overwritten or mistaken for new run',async()=>{
  const cwd=process.cwd();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v208-'));
  try {
    process.chdir(dir);
    const target=path.join(dir,DEFAULT_OUTPUT);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,'stale');
    let started=false;
    await assert.rejects(runBookingIntegration({env,runTap:async()=>{started=true;return tap();}}),/pre-existing evidence/);
    assert.equal(started,false);
    assert.equal(fs.readFileSync(target,'utf8'),'stale');
  }finally{process.chdir(cwd); fs.rmSync(dir,{recursive:true,force:true});}
});
test('v208: manual CI runs guarded subprocess with no unsafe shell pipeline',()=>{
  assert.match(workflow,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.match(workflow,/npm run test:v213:unit/);
  const integration=workflow.slice(workflow.indexOf('- name: Booking overlap and concurrency integration'),
    workflow.indexOf('- name: Prove test fixture cleanup after integration'));
  assert.match(integration,/node scripts\/v208-integration-exit-gate\.cjs/);
  assert.doesNotMatch(integration,/\| node |continue-on-error:|\bshell:\s*true/);
  assert.match(workflow,/if: success\(\)/);
  assert.match(workflow,/v206-postrun-cleanup-proof\.cjs/);
});
