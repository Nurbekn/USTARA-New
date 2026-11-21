'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildEvidence, DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {verifyEvidence,verifyFile} = require('../scripts/v197-verify-evidence.cjs');
const {collectCiProvenance} = require('../scripts/v213-ci-provenance.cjs');
const tap = `TAP version 13\n    ok 1 - nested\n    ok 2 - nested\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 10\n`;
const ci = {GITHUB_ACTIONS:'true', GITHUB_SHA:'a'.repeat(40), GITHUB_REPOSITORY:'Nurbekn/USTARA-New', GITHUB_REF:'refs/heads/main', GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main', GITHUB_EVENT_NAME:'workflow_dispatch'};
const valid = () => buildEvidence(tap,{runId:'12345',runAttempt:'2',provenance:collectCiProvenance(ci)});
test('v197: valid passed evidence belongs to active GitHub run',()=>{
  assert.equal(verifyEvidence(valid(),{...ci,GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'2'}).tests,3);
  assert.throws(()=>verifyEvidence(valid(),{...ci,GITHUB_RUN_ID:'12346',GITHUB_RUN_ATTEMPT:'2'}),/workflow run/);
  assert.throws(()=>verifyEvidence(valid(),{...ci,GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'3'}),/workflow run/);
});
test('v197: fail closed on corrupted counters, hashes, schema and extra fields',()=>{
  const mutations=[{passed:2},{tests:0},{skipped:1},{failed:1},{todo:1},{cancelled:1},
    {tapSha256:'0'.repeat(63)},{schema:'unknown'},{outcome:'skipped'},{suite:'wrong'},
    {unexpected:'secret'},{ciRunId:'local\nnewline'},{ciRunAttempt:'-1'}];
  for (const mutation of mutations) assert.throws(()=>verifyEvidence({...valid(),...mutation}),/v197/);
});
test('v197: rejects local metadata in CI, permits it offline only',()=>{
  const evidence=buildEvidence(tap);
  assert.equal(verifyEvidence(evidence).tests,3);
  assert.throws(()=>verifyEvidence(evidence,{...ci,GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1'}));
});
test('v197: strict path, no symlinks and no oversized evidence',()=>{
  const cwd=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v197-'));
  try {
    process.chdir(temp); fs.mkdirSync('artifacts');
    assert.throws(()=>verifyFile('other.json'),/path/);
    const target=path.resolve(DEFAULT_OUTPUT);
    fs.writeFileSync(target,JSON.stringify(valid()));
    assert.equal(verifyFile(DEFAULT_OUTPUT,{...ci,GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'2'}).tests,3);
    fs.renameSync(target,target+'.real'); fs.symlinkSync(target+'.real',target);
    assert.throws(()=>verifyFile(),/unsafe/);
    fs.unlinkSync(target);fs.writeFileSync(target,'x'.repeat(5000));
    assert.throws(()=>verifyFile(),/unsafe/);
  } finally {process.chdir(cwd); fs.rmSync(temp,{recursive:true,force:true});}
});
test('v197: CI must verify evidence before uploading artifact',()=>{
  const yaml=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.ok(yaml.indexOf('node scripts/v197-verify-evidence.cjs')>yaml.indexOf('node scripts/v208-integration-exit-gate.cjs'));
  assert.ok(yaml.indexOf('node scripts/v197-verify-evidence.cjs')<yaml.indexOf('actions/upload-artifact@v4'));
  assert.match(yaml,/if: success\(\)/);
});
