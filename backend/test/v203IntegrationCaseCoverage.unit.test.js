'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {EXPECTED_CASES, assertIntegrationCaseCoverage} = require('../scripts/v203-integration-case-coverage.cjs');
const {validateTapReport, REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {buildEvidence} = require('../scripts/v196-integration-evidence.cjs');

function makeTap(cases = EXPECTED_CASES, {childHeaders = true, diagnostics = false} = {}) {
  const total = cases.length + 1;
  const lines = ['TAP version 13', `# Subtest: ${REQUIRED}`];
  cases.forEach((name, i) => {
    if (childHeaders) lines.push(`    # Subtest: ${name}`);
    lines.push(`    ok ${i + 1} - ${name}`);
    if (diagnostics) lines.push('      ---', '      duration_ms: 1', "      type: 'test'", '      ...');
  });
  lines.push(`    1..${cases.length}`, `ok 1 - ${REQUIRED}`);
  if (diagnostics) lines.push('  ---', '  duration_ms: 20', "  type: 'test'", '  ...');
  lines.push('1..1', `# tests ${total}`, '# suites 0', `# pass ${total}`, '# fail 0',
    '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 40');
  return lines.join('\n')+'\n';
}
const strict = (tap) => buildEvidence(tap, {runId:'12345',runAttempt:'2',requireCaseCoverage:true});
const rejects = (tap, code = /v203/) => assert.throws(() => strict(tap), code);

test('v203: all 12 audited PostgreSQL assertions are required for CI evidence', () => {
  const tap = makeTap();
  assert.equal(EXPECTED_CASES.length, 12);
  assert.equal(assertIntegrationCaseCoverage(tap).cases,12);
  assert.equal(strict(tap).passed,13);
});
test('v203: accepts actual Node 22 TAP reporter output with nested headings and diagnostics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v203-tap-'));
  try {
    const file = path.join(dir,'node-reporter.test.cjs');
    fs.writeFileSync(file, `const {test}=require('node:test');\n`+
      `test(${JSON.stringify(REQUIRED)}, async t => {\n`+
      EXPECTED_CASES.map(label=>`  await t.test(${JSON.stringify(label)},()=>{});`).join('\n')+
      `\n});\n`);
    const env = {...process.env};
    // A nested `node --test` process must not inherit its parent's child-v8 IPC mode.
    delete env.NODE_TEST_CONTEXT;
    const node = spawnSync(process.execPath,['--test','--test-reporter=tap',file],{encoding:'utf8',timeout:10000,env});
    assert.equal(node.status,0,node.stderr);
    assert.match(node.stdout,/^    # Subtest: same customer at another barber/m);
    assert.match(node.stdout,/^      duration_ms:/m);
    assert.equal(validateTapReport(node.stdout).pass,13);
    assert.equal(strict(node.stdout).passed,13);
  }finally{ fs.rmSync(dir,{recursive:true,force:true}); }
});
test('v203: rejected partial set even when its TAP counters were honest',()=>{
  rejects(makeTap(EXPECTED_CASES.slice(0,-1)));
});
test('v203: rejects renamed required concurrency check',()=>{
  const names=[...EXPECTED_CASES];names[2]='two independent uncommitted inserts were not tested';
  rejects(makeTap(names));
});
test('v203: rejects reordered checks with legitimate counts',()=>{
  const names=[...EXPECTED_CASES];[names[0],names[1]]=[names[1],names[0]];
  rejects(makeTap(names));
});
test('v203: rejects a duplicate name replacing an expected case',()=>{
  const names=[...EXPECTED_CASES]; names[1]=names[0];
  rejects(makeTap(names));
});
test('v203: rejects any extra unrelated assertion despite consistent counters',()=>{
  rejects(makeTap([...EXPECTED_CASES,'unreviewed extra']));
});
test('v203: rejects a real-TAP nested heading that disagrees with its assertion',()=>{
  const tap=makeTap().replace(`    # Subtest: ${EXPECTED_CASES[0]}`, '    # Subtest: renamed heading');
  rejects(tap);
});
test('v203: rejects mixture of synthetic and real child headings',()=>{
  const tap=makeTap().replace(`    # Subtest: ${EXPECTED_CASES[1]}\n`, '');
  rejects(tap, /v202/);
});
test('v203: rejects diagnostics that are truncated after a passing assertion',()=>{
  const tap=makeTap(EXPECTED_CASES,{diagnostics:true}).replace('      ...\n', '      malformed\n');
  rejects(tap);
});
test('v203: rejects fake TAP bailouts even if summary claims success',()=>{
  const tap=makeTap().replace('    1..12\n', '    1..12\nBail out! previous test failed\n');
  rejects(tap,/v202|v203/);
});
test('v203: accepts old headerless TAP fixtures only as structural unit validation',()=>{
  const basic = `TAP version 13\n    ok 1 - example\n    ok 2 - example\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 3\n`;
  assert.equal(validateTapReport(basic).pass,3);
  rejects(basic);
});
test('v203: required case names match the real PostgreSQL source',()=>{
  const code=fs.readFileSync(path.join(__dirname,'bookingConcurrency.postgres.integration.test.js'),'utf8');
  const names=[...code.matchAll(/await t\.test\('([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(names,EXPECTED_CASES);
});
test('v203: CI always requests strict named-case proof before creating evidence',()=>{
  const evidenceScript=fs.readFileSync(path.join(__dirname,'../scripts/v196-integration-evidence.cjs'),'utf8');
  const yaml=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(evidenceScript,/const proof = metadata\.requireCaseCoverage === true/);
  assert.match(evidenceScript,/runAttempt: process\.env\.GITHUB_RUN_ATTEMPT,[\s\S]*?provenance: collectCiProvenance\(process\.env\), requireCaseCoverage: true/);
  assert.match(yaml,/npm run test:v213:unit/);
  assert.match(yaml,/node scripts\/v208-integration-exit-gate\.cjs/);
  assert.match(yaml,/^on:\s*\n\s*workflow_dispatch:/m);
});
