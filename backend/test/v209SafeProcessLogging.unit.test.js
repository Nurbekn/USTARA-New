'use strict';
// v209: offline subprocess diagnostic safety, never connect to PostgreSQL.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  captureTap, runBookingIntegration, STDERR_LIMIT_BYTES, TAP_LIMIT_BYTES,
} = require('../scripts/v208-integration-exit-gate.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {EXPECTED_CASES} = require('../scripts/v203-integration-case-coverage.cjs');
const workflow = fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
const env = Object.freeze({
  NODE_ENV:'test', USTARA_BOOKING_CONCURRENCY_TESTS:'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:test-only@127.0.0.1:5432/ustara_test_db',
  GITHUB_ACTIONS:'true', GITHUB_SHA:'a'.repeat(40),
  GITHUB_REPOSITORY:'Nurbekn/USTARA-New', GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_RUN_ID:'209',GITHUB_RUN_ATTEMPT:'1',
});
function tap() {
  const body = ['TAP version 13',`# Subtest: ${REQUIRED}`];
  for (const [i,name] of EXPECTED_CASES.entries()) body.push(`    # Subtest: ${name}`,`    ok ${i+1} - ${name}`);
  return body.concat('    1..12',`ok 1 - ${REQUIRED}`,'1..1','# tests 13','# suites 0','# pass 13','# fail 0','# cancelled 0','# skipped 0','# todo 0','# duration_ms 1').join('\n')+'\n';
}
function launch(src, opts={}) {
  return captureTap({command:process.execPath,args:['-e',src],timeoutMs:3000,...opts});
}
test('v209: max stderr limit stays strictly bounded and is smaller than TAP limit',()=>{
  assert.equal(STDERR_LIMIT_BYTES,32768);
  assert.ok(STDERR_LIMIT_BYTES<TAP_LIMIT_BYTES);
});
test('v209: small diagnostic output does not invalidate passing child',async()=>{
  const data=await launch('process.stderr.write("harmless diagnostic"); process.stdout.write("ok\\n");');
  assert.equal(data,'ok\n');
});
test('v209: excessive stderr terminates child even when stdout looks successful',async()=>{
  await assert.rejects(launch('process.stdout.write("ok\\n");process.stderr.write("x".repeat(100000));'),/oversized diagnostic output/);
});
test('v209: stderr cap is enforced independently of stdout cap',async()=>{
  await assert.rejects(launch('process.stderr.write("x".repeat(80000));',{maxBytes:4000000,maxStderrBytes:1024}),/oversized diagnostic output/);
});
test('v209: error output and forged passing TAP cannot override failed process exit',async()=>{
  await assert.rejects(launch(`process.stderr.write("sensitive details");process.stdout.write(${JSON.stringify(tap())});process.exitCode=1`),/nonzero exit or signal/);
});
test('v209: child output is never echoed, even if caller provides old echo option',()=>{
  const modulePath = path.resolve(__dirname,'../scripts/v208-integration-exit-gate.cjs');
  const program=`(async()=>{const {captureTap}=require(${JSON.stringify(modulePath)});`+
    `const t=await captureTap({command:process.execPath,args:['-e',`+
    `${JSON.stringify('process.stdout.write("PRIVATE_STDOUT\\n");process.stderr.write("PRIVATE_STDERR\\n")')}],`+
    `echo:true,timeoutMs:2000});if(t!=='PRIVATE_STDOUT\\n')process.exitCode=1;else process.stdout.write('OK\\n')})().catch(()=>process.exitCode=2)`;
  const output=execFileSync(process.execPath,['-e',program],{encoding:'utf8'});
  assert.equal(output,'OK\n');
  assert.doesNotMatch(output,/PRIVATE_STDOUT|PRIVATE_STDERR/);
});
test('v209: live runner does not enable raw TAP echo option',async()=>{
  let args;
  let recorded;
  const res=await runBookingIntegration({env,runTap:async options=>{args=options;return tap();},persist:(file,proof)=>{recorded=proof;}});
  assert.equal(args.echo,undefined);
  assert.equal(recorded.tests,13);
  assert.equal(res.passed,13);
});
test('v209: workflow explicitly runs latest offline safety regression checks',()=>{
  assert.match(workflow,/npm run test:v213:unit/);
  assert.match(workflow,/node scripts\/v208-integration-exit-gate\.cjs/);
  assert.match(workflow,/if: success\(\)/);
});
