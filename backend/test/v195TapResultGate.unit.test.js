'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {validateTapReport, REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
function report({tests=3,pass=3,fail=0,cancelled=0,skipped=0,todo=0,first=REQUIRED}={}) {
  return `TAP version 13\n    ok 1 - nested check\n    ok 2 - other nested check\n    1..2\nok 1 - ${first}\n1..1\n# tests ${tests}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped ${skipped}\n# todo ${todo}\n# duration_ms 111\n`;
}
test('v195: accepts a fully executed nested Node TAP integration suite',()=>{
  assert.deepEqual(validateTapReport(report()),{tests:3,pass:3,skipped:0});
});
test('v195: refuses a skipped integration even if the runner exits successfully',()=>{
  assert.throws(()=>validateTapReport(report({tests:1,pass:0,skipped:1})),/did not execute/);
});
test('v195: refuses failure, cancellation, todo and incomplete counts',()=>{
  for(const changes of [{fail:1,pass:2},{cancelled:1,pass:2},{todo:1,pass:2},{pass:2},{tests:0,pass:0}])
    assert.throws(()=>validateTapReport(report(changes)),/did not execute/);
});
test('v195: refuses unrelated, missing, duplicated or incomplete TAP evidence',()=>{
  assert.throws(()=>validateTapReport(report({first:'unrelated suite'})),/did not execute/);
  assert.throws(()=>validateTapReport(''),/header absent/);
  assert.throws(()=>validateTapReport(report().replace('# skipped 0\n','')),/skipped summary/);
  assert.throws(()=>validateTapReport(report()+'# pass 3\n'),/repeated TAP pass/);
  assert.throws(()=>validateTapReport(report().replace('    ok 1 - nested check\n    ok 2 - other nested check\n','')),/missing nested assertions/);
  assert.throws(()=>validateTapReport(report().replace('ok 1 - '+REQUIRED, 'not ok 1 - '+REQUIRED)),/did not execute/);
});
test('v195: CI enforces the TAP gate after the v194 proof and keeps workflow manual-only',()=>{
  const yml = fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(yml,/set -euo pipefail/);
  assert.match(yml,/node scripts\/v208-integration-exit-gate\.cjs/);
  assert.ok(yml.indexOf('v194-bootstrap-proof.cjs') < yml.indexOf('v208-integration-exit-gate.cjs'));
  assert.match(yml,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(yml,/\b(push|pull_request|schedule|deployment):/);
});
