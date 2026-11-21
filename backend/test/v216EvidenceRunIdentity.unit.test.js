'use strict';
// Offline-only: validation of mutually consistent GitHub run/attempt/source
// evidence, and preflight rejection before any mutating PostgreSQL tests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');
const {verifyEvidence} = require('../scripts/v197-verify-evidence.cjs');
const {runBookingIntegration} = require('../scripts/v208-integration-exit-gate.cjs');
const {collectCiProvenance, OFFLINE_PROVENANCE} = require('../scripts/v213-ci-provenance.cjs');
const {validateEvidenceRunIdentity, assertRunIdentityBeforeIntegration} = require('../scripts/v216-run-identity-guard.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');

const ci = Object.freeze({
  GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '216000', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'Nurbekn/USTARA-New',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: 'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
});
const db = Object.freeze({NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:offline@127.0.0.1:5432/ustara_test_db',
});
const tap = `TAP version 13\n    ok 1 - a\n    ok 2 - b\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
const ciEvidence = () => buildEvidence(tap, {runId:ci.GITHUB_RUN_ID, runAttempt:ci.GITHUB_RUN_ATTEMPT,
  provenance:collectCiProvenance(ci)});

test('v216: a valid local run and local source are consistent', () => {
  assert.equal(validateEvidenceRunIdentity('local', 'local', OFFLINE_PROVENANCE).local, true);
  assert.equal(verifyEvidence(buildEvidence(tap)).tests, 3);
});
test('v216: valid CI run and attempt must have a verified CI source', () => {
  const verified = validateEvidenceRunIdentity(ci.GITHUB_RUN_ID, ci.GITHUB_RUN_ATTEMPT, collectCiProvenance(ci));
  assert.equal(verified.local, false);
  assert.equal(verifyEvidence(ciEvidence(), ci).tests, 3);
});
test('v216: fabricated numeric run with entirely local source must be rejected', () => {
  const mixed = buildEvidence(tap, {runId:'216', runAttempt:'2'});
  assert.throws(() => verifyEvidence(mixed), /inconsistent run provenance/);
  assert.throws(() => validateEvidenceRunIdentity('216', '2', OFFLINE_PROVENANCE), /v216/);
});
test('v216: CI source with local run and attempt must be rejected', () => {
  const mixed = buildEvidence(tap, {provenance:collectCiProvenance(ci)});
  assert.throws(() => verifyEvidence(mixed), /inconsistent run provenance/);
  assert.throws(() => validateEvidenceRunIdentity('local', 'local', collectCiProvenance(ci)), /v216/);
});
test('v216: mixed local and numeric run identity fields fail closed', () => {
  for (const [id, attempt] of [['local','1'], ['216','local'], ['0','1'], ['216','0'],
    ['216','-1'], ['216','1\nsecret']]) {
    assert.throws(() => validateEvidenceRunIdentity(id,attempt,collectCiProvenance(ci)),/v216/);
  }
});
test('v216: preserve explicit string-only metadata and reject arbitrary objects', () => {
  assert.throws(() => validateEvidenceRunIdentity(216,'1',collectCiProvenance(ci)),/v216/);
  assert.throws(() => validateEvidenceRunIdentity('216',{toString(){return '1';}},collectCiProvenance(ci)),/v216/);
});
test('v216: CI metadata guard passes real CI context before running DB tests', () => {
  const identity = assertRunIdentityBeforeIntegration(ci,collectCiProvenance(ci));
  assert.equal(identity.ciRunId,'216000');
  assert.equal(identity.ciRunAttempt,'1');
});
test('v216: missing or malformed run ID / attempt prevents launch of mutating test', async () => {
  for (const mutation of [{GITHUB_RUN_ID:''},{GITHUB_RUN_ATTEMPT:''},
    {GITHUB_RUN_ID:'local'},{GITHUB_RUN_ATTEMPT:'local'},
    {GITHUB_RUN_ID:'0'},{GITHUB_RUN_ATTEMPT:'0'},
    {GITHUB_RUN_ID:'2\nsecret'},{GITHUB_RUN_ATTEMPT:'1.2'}]) {
    let launched = false, saved = false;
    await assert.rejects(runBookingIntegration({env:{...db,...ci,...mutation},
      runTap:async()=>{launched=true;return tap;}, persist:()=>{saved=true;}}),/v216/);
    assert.equal(launched,false);
    assert.equal(saved,false);
  }
});
test('v216: offline runner cannot masquerade as a GitHub Actions attempt', async () => {
  let launched = false;
  await assert.rejects(runBookingIntegration({env:{...db,GITHUB_RUN_ID:'216',GITHUB_RUN_ATTEMPT:'1'},
    runTap:async()=>{launched=true;return tap;}}),/v216/);
  assert.equal(launched,false);
});
test('v216: verifier rejects edited run identity without changing TAP hash or test counts', () => {
  const proof = ciEvidence();
  for (const mutation of [{ciRunId:'local'}, {ciRunAttempt:'local'},
    {ciRunId:'0'}, {ciRunAttempt:'2\n'}]) {
    assert.throws(() => verifyEvidence({...proof,...mutation}),/v197/);
  }
});
test('v216: CI gate runs before disposable DB creation and upload remains success-only', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(workflow, /npm run test:v216:unit/);
  assert.ok(workflow.indexOf('npm run test:v216:unit') < workflow.indexOf('Create disposable non-superuser DB'));
  assert.match(workflow, /^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\b(push|pull_request|schedule):/);
  assert.match(workflow, /if: success\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
  const runner = fs.readFileSync(path.resolve(__dirname,'../scripts/v208-integration-exit-gate.cjs'),'utf8');
  assert.ok(runner.indexOf('assertRunIdentityBeforeIntegration(env, provenance)') < runner.indexOf('const tap = await runTap'));
});
