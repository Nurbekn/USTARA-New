'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateTapReport,REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');
const tap = `TAP version 13\n# Subtest: ${REQUIRED}\n    ok 1 - alpha\n    ok 2 - beta\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
test('v200: valid complete nested suite produces evidence',()=>{
  assert.equal(validateTapReport(tap).tests,3);
  assert.equal(buildEvidence(tap).passed,3);
});
test('v200: rejects omitted nested test with unchanged plan and summary',()=>{
  assert.throws(()=>validateTapReport(tap.replace('    ok 2 - beta\n','')),/v200/);
});
test('v200: rejects duplicated nested assertion',()=>{
  assert.throws(()=>validateTapReport(tap.replace('    ok 2 - beta\n','    ok 2 - beta\n    ok 2 - beta\n')),/v200/);
});
test('v200: rejects missing or duplicate assertion numbers',()=>{
  assert.throws(()=>validateTapReport(tap.replace('    ok 2 - beta','    ok 3 - beta')), /v200/);
  assert.throws(()=>validateTapReport(tap.replace('    ok 2 - beta','    ok 1 - beta')), /v200/);
});
test('v200: rejects misleading global test total even if pass matches',()=>{
  assert.throws(()=>buildEvidence(tap.replace('# tests 3\n# suites 0\n# pass 3','# tests 4\n# suites 0\n# pass 4')), /v200/);
});
test('v200: rejects repeated nested plans',()=>{
  assert.throws(()=>validateTapReport(tap.replace('    1..2\n','    1..2\n    1..2\n')), /v200/);
});
test('v200: rejects nested plan smaller than actual assertion count',()=>{
  assert.throws(()=>validateTapReport(tap.replace('    1..2','    1..1')), /v200/);
});
