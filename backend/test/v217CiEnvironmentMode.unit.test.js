'use strict';
// Offline-only guard: never connects to PostgreSQL or launches actual test data writes.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {GITHUB_IDENTITY_MARKERS, assertUnambiguousCiMode} = require('../scripts/v217-ci-environment-mode.cjs');
const {runBookingIntegration} = require('../scripts/v208-integration-exit-gate.cjs');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');
const {verifyEvidence} = require('../scripts/v197-verify-evidence.cjs');
const {collectCiProvenance} = require('../scripts/v213-ci-provenance.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');

const ci = Object.freeze({
  GITHUB_ACTIONS:'true', GITHUB_RUN_ID:'217000', GITHUB_RUN_ATTEMPT:'1',
  GITHUB_SHA:'a'.repeat(40), GITHUB_REPOSITORY:'Nurbekn/USTARA-New',
  GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
});
const db = Object.freeze({
  NODE_ENV:'test', USTARA_BOOKING_CONCURRENCY_TESTS:'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:offline@127.0.0.1:5432/ustara_test_db',
});
const tap = `TAP version 13\n    ok 1 - first\n    ok 2 - second\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
const evidence = () => buildEvidence(tap,{runId:ci.GITHUB_RUN_ID,runAttempt:ci.GITHUB_RUN_ATTEMPT,
  provenance:collectCiProvenance(ci)});

async function assertBlockedBeforeLaunch(extra) {
  let started = false, persisted = false;
  await assert.rejects(runBookingIntegration({env:{...db,...extra},
    runTap:async()=>{started=true;throw new Error('should not launch');},
    persist:()=>{persisted=true;}}), /v217: ambiguous GitHub Actions environment/);
  assert.equal(started,false);
  assert.equal(persisted,false);
}

test('v217: local mode without GitHub identity markers is allowed',()=>{
  assert.equal(assertUnambiguousCiMode({}), 'local');
  assert.equal(assertUnambiguousCiMode({...db, CI:'true'}), 'local');
});

test('v217: complete GitHub Actions marker is allowed for further strict provenance checks',()=>{
  assert.equal(assertUnambiguousCiMode(ci),'github-actions');
  assert.equal(verifyEvidence(evidence(),ci).tests,3);
});

test('v217: every incomplete GitHub identity marker forbids an offline downgrade',()=>{
  for(const marker of GITHUB_IDENTITY_MARKERS){
    assert.throws(()=>assertUnambiguousCiMode({[marker]:'placeholder'}),/v217/);
  }
});

test('v217: even an empty GitHub marker is still an ambiguous identity',()=>{
  for(const marker of GITHUB_IDENTITY_MARKERS){
    assert.throws(()=>assertUnambiguousCiMode({[marker]:''}),/v217/);
  }
});

test('v217: invalid/false/empty GitHub Actions switch is not interpreted as local',()=>{
  for(const value of ['false','','TRUE','0',null,false]){
    assert.throws(()=>assertUnambiguousCiMode({GITHUB_ACTIONS:value}),/v217/);
  }
});

test('v217: malformed environment objects are rejected',()=>{
  for(const value of [null,[],1,'github']){
    assert.throws(()=>assertUnambiguousCiMode(value),/v217/);
  }
});

test('v217: partial source environment cannot authorize a mutating subprocess',async()=>{
  await assertBlockedBeforeLaunch({GITHUB_SHA:ci.GITHUB_SHA,GITHUB_REPOSITORY:ci.GITHUB_REPOSITORY});
});

test('v217: invalid GitHub Actions switch cannot authorize a mutating subprocess',async()=>{
  await assertBlockedBeforeLaunch({GITHUB_ACTIONS:'false', GITHUB_SHA:ci.GITHUB_SHA});
});

test('v217: evidence verifier rejects missing/invalid GitHub mode when source markers exist',()=>{
  const proof=evidence();
  assert.throws(()=>verifyEvidence(proof,{GITHUB_SHA:ci.GITHUB_SHA}),/v217/);
  assert.throws(()=>verifyEvidence(proof,{...ci,GITHUB_ACTIONS:'false'}),/v217/);
  assert.equal(verifyEvidence(proof,ci).tests,3);
});

test('v217: complete legitimate CI context reaches the subprocess boundary (offline stub)',async()=>{
  let started=false;
  await assert.rejects(runBookingIntegration({env:{...db,...ci},
    runTap:async()=>{started=true;throw new Error('offline stub stopped test');},
    persist:()=>{throw new Error('no evidence allowed');}}),/offline stub stopped test/);
  assert.equal(started,true);
});

test('v217: workflow runs mode guard before database setup and evidence upload requires success',()=>{
  const file=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(file,/npm run test:v217:unit/);
  assert.ok(file.indexOf('npm run test:v217:unit')<file.indexOf('Create disposable non-superuser DB'));
  assert.match(file,/if: success\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
  assert.match(file,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(file,/\b(push|pull_request|schedule):/);
});
