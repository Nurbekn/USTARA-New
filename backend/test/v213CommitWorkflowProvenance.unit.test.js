'use strict';
// Offline tests for commit/repository/workflow/ref provenance; NO PostgreSQL needed.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');
const {verifyEvidence} = require('../scripts/v197-verify-evidence.cjs');
const {runBookingIntegration} = require('../scripts/v208-integration-exit-gate.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {EXPECTED_CASES} = require('../scripts/v203-integration-case-coverage.cjs');
const {collectCiProvenance, verifyProvenanceFields, OFFLINE_PROVENANCE} =
  require('../scripts/v213-ci-provenance.cjs');
const source = path.resolve(__dirname,'../scripts/v213-ci-provenance.cjs');
const workflow = fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
const CI = Object.freeze({
  GITHUB_ACTIONS:'true', GITHUB_SHA:'a'.repeat(40),
  GITHUB_REPOSITORY:'Nurbekn/USTARA-New', GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch', GITHUB_RUN_ID:'213', GITHUB_RUN_ATTEMPT:'2',
});
const DB = Object.freeze({NODE_ENV:'test',USTARA_BOOKING_CONCURRENCY_TESTS:'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:offline@127.0.0.1:5432/ustara_test_db'});
const tap = `TAP version 13\n    ok 1 - nested\n    ok 2 - second\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
function validEvidence() {
  return buildEvidence(tap, {runId:CI.GITHUB_RUN_ID,runAttempt:CI.GITHUB_RUN_ATTEMPT,
    provenance:collectCiProvenance(CI)});
}
function fullTap() {
  const lines=['TAP version 13',`# Subtest: ${REQUIRED}`];
  for (const [i,n] of EXPECTED_CASES.entries()) lines.push(`    # Subtest: ${n}`,`    ok ${i+1} - ${n}`);
  return lines.concat('    1..12',`ok 1 - ${REQUIRED}`,'1..1','# tests 13','# suites 0','# pass 13',
    '# fail 0','# cancelled 0','# skipped 0','# todo 0','# duration_ms 1').join('\n')+'\n';
}

test('v213: exact manual CI source context yields credential-free v2 evidence',()=>{
  const evidence=validEvidence();
  assert.equal(evidence.schema,'ustara.booking-concurrency-evidence.v2');
  assert.equal(evidence.ciHeadSha,CI.GITHUB_SHA);
  assert.equal(evidence.ciWorkflowRef,CI.GITHUB_WORKFLOW_REF);
  assert.equal(verifyEvidence(evidence,CI).tests,3);
  assert.doesNotMatch(JSON.stringify(evidence),/postgresql:|password|fixture-only|offline@/);
});
test('v213: mismatch on commit/ref/repository/workflow is rejected',()=>{
  const changes=[{GITHUB_SHA:'b'.repeat(40)}, {GITHUB_REF:'refs/heads/other'},
    {GITHUB_REPOSITORY:'Other/USTARA-New'},
    {GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/other.yml@refs/heads/main'}];
  for (const change of changes) {
    assert.throws(()=>verifyEvidence(validEvidence(),{...CI,...change}),/v197/);
  }
});
test('v213: injected evidence mutation is rejected even with correct counters',()=>{
  const changes=[{ciHeadSha:'b'.repeat(40)}, {ciWorkflowRef:'local'},
    {ciRef:'refs/heads/other'}, {ciRepository:'Other/Repo'}, {ciEventName:'push'},
    {ciHeadSha:'a'.repeat(39)}, {ciHeadSha:'a'.repeat(40)+'\nsecret'}];
  for (const change of changes) assert.throws(()=>verifyEvidence({...validEvidence(),...change},CI),/v197/);
});
test('v213: cannot downgrade v2 evidence to v1 or omit provenance fields',()=>{
  const value=validEvidence();
  assert.throws(()=>verifyEvidence({...value,schema:'ustara.booking-concurrency-evidence.v1'},CI),/v197/);
  const {ciHeadSha, ...missing}=value;
  assert.throws(()=>verifyEvidence(missing,CI),/v197/);
});
test('v213: CI may not create evidence without a complete, valid source identity',()=>{
  for (const change of [{GITHUB_SHA:''},{GITHUB_WORKFLOW_REF:''},
    {GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'example/../../bad'},
    {GITHUB_REF:'refs/heads/../main'},{GITHUB_REF:'refs/heads/a//b'},
    {GITHUB_SHA:'deadbeef'}, {GITHUB_SHA:'0'.repeat(40)}, {GITHUB_ACTIONS:'false'}]) {
    assert.throws(()=>collectCiProvenance({...CI,...change},{requireCi:true}),/v213/);
  }
});
test('v213: local evidence is allowed offline but never accepted as CI provenance',()=>{
  assert.deepEqual(collectCiProvenance({}),OFFLINE_PROVENANCE);
  assert.equal(verifyEvidence(buildEvidence(tap)).tests,3);
  assert.throws(()=>verifyEvidence(buildEvidence(tap),CI),/v197/);
  assert.throws(()=>verifyProvenanceFields(OFFLINE_PROVENANCE,{requireCi:true}),/v213/);
});
test('v213: disallow any mixed local/CI provenance or additional fields',()=>{
  const valid=collectCiProvenance(CI);
  assert.throws(()=>verifyProvenanceFields({...valid,ciHeadSha:'local'}),/v213/);
  assert.throws(()=>verifyProvenanceFields({...valid,extra:'secret'}),/v213/);
  assert.throws(()=>verifyProvenanceFields({...valid,ciWorkflowRef:valid.ciWorkflowRef+' ' }),/v213/);
});
test('v213: runner fails before launching mutating tests on missing CI SHA',async()=>{
  let launched=false, persisted=false;
  await assert.rejects(runBookingIntegration({env:{...DB,...CI,GITHUB_SHA:''},
    runTap:async()=>{launched=true;return fullTap();},
    persist:()=>{persisted=true;}}),/v213/);
  assert.equal(launched,false);assert.equal(persisted,false);
});
test('v213: runner produces commit-bound evidence for a valid CI context',async()=>{
  let evidence;
  const result=await runBookingIntegration({env:{...DB,...CI},runTap:async()=>fullTap(),
    persist:(_,proof)=>{evidence=proof;}});
  assert.deepEqual(result,{tests:13,passed:13});
  assert.equal(evidence.ciHeadSha,CI.GITHUB_SHA);
  assert.equal(verifyEvidence(evidence,CI).tests,13);
});
test('v213: CI provenance script requires active GitHub Actions in strict mode',()=>{
  const result=spawnSync(process.execPath,[source,'--require-ci'],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(result.status,1);
  assert.doesNotMatch(result.stderr,/postgresql:|password|secret/i);
});
test('v213: CI preflight precedes first database operation and checks checkout commit',()=>{
  // v219's built-in-only preinstall gate includes v213 provenance validation
  // and compares git HEAD to GITHUB_SHA before any npm lifecycle hooks.
  const marker='node backend/scripts/v219-preinstall-ci-gate.cjs';
  assert.ok(workflow.indexOf(marker)>0);
  assert.ok(workflow.indexOf(marker)<workflow.indexOf('- name: Install backend dependencies'));
  assert.ok(workflow.lastIndexOf(marker)<workflow.indexOf('- name: Create disposable non-superuser DB'));
  assert.match(workflow,/npm run test:v213:unit/);
  assert.match(workflow,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/\b(push|pull_request|schedule):/);
});
test('v213: strict provenance accepts legitimate tag references as well as branches',()=>{
  const env={...CI,GITHUB_REF:'refs/tags/v213',GITHUB_WORKFLOW_REF:
    'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/tags/v213'};
  assert.equal(collectCiProvenance(env).ciRef,'refs/tags/v213');
});
