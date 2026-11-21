'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateTapReport, REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');
const tap = `TAP version 13\n# Subtest: ${REQUIRED}\n    ok 1 - alpha\n    ok 2 - beta\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1.23\n`;
const rejected = text => assert.throws(() => validateTapReport(text), /v201/);
test('v201: accepts intact TAP footer and produces evidence', () => {
  assert.equal(validateTapReport(tap).pass, 3);
  assert.equal(buildEvidence(tap).passed, 3);
});
test('v201: rejects prefix before TAP header', () => rejected('LOGGING FIRST\n' + tap));
test('v201: rejects appended assertions after footer', () => assert.throws(() => validateTapReport(tap + 'ok 7 - fake\n'), /v199|v201/));
test('v201: rejects duplicate footer metadata', () => rejected(tap.replace('# suites 0', '# suites 0\n# suites 0')));
test('v201: rejects reordered footer metadata', () => rejected(tap.replace('# suites 0\n# pass 3', '# pass 3\n# suites 0')));
test('v201: rejects unknown extra footer lines', () => rejected(tap.replace('# duration_ms', '# mystery 9\n# duration_ms')));
test('v201: rejects misplaced suite plan', () => rejected(tap.replace(`ok 1 - ${REQUIRED}\n1..1`, `1..1\nok 1 - ${REQUIRED}`)));
test('v201: rejects summary inserted before suite end', () => rejected(tap.replace('1..1\n# tests 3', '# tests 3\n1..1')));
test('v201: rejects nested plan after subtest completion', () => rejected(tap.replace('    1..2\n', '').replace(`ok 1 - ${REQUIRED}\n`, `ok 1 - ${REQUIRED}\n    1..2\n`)));
