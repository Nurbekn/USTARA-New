'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {buildEvidence, writeEvidence, DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const valid = `TAP version 13\n    ok 1 - nested check\n    ok 2 - second nested check\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 111\n`;

test('v196: writes only minimal passed summary and cryptographic TAP fingerprint', () => {
  const proof = buildEvidence(valid, {runId:'12345',runAttempt:'2'});
  assert.equal(proof.outcome,'passed');
  assert.equal(proof.tests,3);
  assert.equal(proof.passed,3);
  assert.equal(proof.tapSha256,crypto.createHash('sha256').update(valid).digest('hex'));
  assert.equal(proof.ciRunId,'12345');
  assert.equal(proof.ciRunAttempt,'2');
  assert.doesNotMatch(JSON.stringify(proof),/postgresql:|password|token|127\.0\.0\.1/i);
});
test('v196: skips, failures, missing summary or wrong suite never produce evidence', () => {
  for (const bad of [valid.replace('# skipped 0','# skipped 1'),valid.replace('# pass 3','# pass 2'),
    valid.replace(REQUIRED,'unrelated suite'),valid.replace('# tests 3','')]) {
    assert.throws(()=>buildEvidence(bad));
  }
});
test('v196: malformed CI metadata is rejected rather than persisted',()=>{
  for (const runId of ['http://example.com','-1','x','0','1\nsecret'])
    assert.throws(()=>buildEvidence(valid,{runId}),/metadata/);
});
test('v196: evidence path is fixed and files cannot be silently overwritten',()=>{
  const cwd=process.cwd();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v196-'));
  try {
    process.chdir(temp);
    assert.throws(()=>writeEvidence('other/evidence.json',buildEvidence(valid)),/output path/);
    const written=writeEvidence(DEFAULT_OUTPUT,buildEvidence(valid));
    assert.equal(JSON.parse(fs.readFileSync(written,'utf8')).outcome,'passed');
    assert.throws(()=>writeEvidence(DEFAULT_OUTPUT,buildEvidence(valid)),/EEXIST/);
  } finally {process.chdir(cwd);fs.rmSync(temp,{recursive:true,force:true});}
});
test('v196: CI is manual-only, locked to evidence gate and upload is fail closed',()=>{
  const yaml=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(yaml,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(yaml,/\b(push|pull_request|schedule|deployment):/);
  assert.match(yaml,/set -euo pipefail[\s\S]*?node scripts\/v208-integration-exit-gate\.cjs/);
  assert.match(yaml,/actions\/upload-artifact@v4/);
  assert.match(yaml,/if-no-files-found: error/);
  assert.match(yaml,/path: backend\/artifacts\/v196-booking-integration-evidence\.json/);
  assert.ok(yaml.indexOf('v194-bootstrap-proof.cjs')<yaml.indexOf('v208-integration-exit-gate.cjs'));
});
