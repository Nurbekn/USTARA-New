'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateTapReport,REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');
const base = `TAP version 13\n# Subtest: ${REQUIRED}\n    ok 1 - branch A\n    ok 2 - branch B\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 15\n`;
test('v199: accepts nested TAP evidence with a single expected suite',()=>{
 assert.equal(validateTapReport(base).pass,3);
 assert.equal(buildEvidence(base).passed,3);
});
test('v199: rejects hidden failed assertions despite forged passing counters',()=>{
 assert.throws(()=>buildEvidence(base.replace('    ok 2 -','    not ok 2 -')),/v199/);
});
test('v199: rejects TAP SKIP and TODO directives despite forged passing counters',()=>{
 for(const tag of ['SKIP','TODO']) assert.throws(()=>buildEvidence(base.replace('branch B','branch B # '+tag)),/v199/);
});
test('v199: rejects extra top-level suites despite unchanged success counters',()=>{
 assert.throws(()=>buildEvidence(base.replace('1..1\n# tests','ok 2 - unexpected suite\n1..1\n# tests')),/v199/);
});
test('v199: rejects duplicate TAP header and absent top-level plan',()=>{
 assert.throws(()=>buildEvidence(base.replace('TAP version 13','TAP version 13\nTAP version 13')),/v199/);
 assert.throws(()=>buildEvidence(base.replace('\n1..1\n','\n')),/v199/);
});
test('v199: rejects missing nested plan',()=>{
 assert.throws(()=>buildEvidence(base.replace('    1..2\n','')),/v199/);
});
