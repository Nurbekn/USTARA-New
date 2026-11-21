'use strict';
// v211: isolated, offline tests of evidence directory boundary and CLI logging.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {assertSafeArtifactDirectory} = require('../scripts/v211-artifact-directory-guard.cjs');
const {writeEvidence, buildEvidence, DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const {verifyFile} = require('../scripts/v197-verify-evidence.cjs');
const {runBookingIntegration} = require('../scripts/v208-integration-exit-gate.cjs');
const {EXPECTED_CASES} = require('../scripts/v203-integration-case-coverage.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const evidenceScript = path.resolve(__dirname, '../scripts/v196-integration-evidence.cjs');
const {collectCiProvenance} = require('../scripts/v213-ci-provenance.cjs');
const env = Object.freeze({
  NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:offline-example@127.0.0.1:5432/ustara_test_db',
  GITHUB_RUN_ID: '211', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_ACTIONS: 'true', GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REPOSITORY: 'Nurbekn/USTARA-New', GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: 'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
});
function tap() {
  const body = ['TAP version 13', `# Subtest: ${REQUIRED}`];
  for (const [i, name] of EXPECTED_CASES.entries()) {
    body.push(`    # Subtest: ${name}`, `    ok ${i + 1} - ${name}`);
  }
  return body.concat('    1..12', `ok 1 - ${REQUIRED}`, '1..1',
    '# tests 13', '# suites 0', '# pass 13', '# fail 0', '# cancelled 0',
    '# skipped 0', '# todo 0', '# duration_ms 1').join('\n') + '\n';
}
const proof = () => buildEvidence(tap(), {runId: '211', runAttempt: '1', provenance: collectCiProvenance(env), requireCaseCoverage: true});
async function workspace(fn) {
  const old = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v211-boundary-'));
  try {
    process.chdir(dir);
    return await fn(dir);
  } finally {
    process.chdir(old);
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('v211: an approved new directory supports verified credential-free evidence', async () => {
  await workspace(() => {
    const target = writeEvidence(DEFAULT_OUTPUT, proof());
    assert.equal(fs.lstatSync('artifacts').isDirectory(), true);
    assert.equal(fs.lstatSync('artifacts').isSymbolicLink(), false);
    assert.equal(verifyFile(DEFAULT_OUTPUT, env).tests, 13);
    assert.equal(target, path.resolve(DEFAULT_OUTPUT));
    if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  });
});

test('v211: symlink evidence directory cannot redirect a write outside workspace', async () => {
  await workspace(async dir => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v211-external-'));
    try {
      fs.symlinkSync(outside, path.join(dir, 'artifacts'), 'dir');
      assert.throws(() => writeEvidence(DEFAULT_OUTPUT, proof()), /v211: unsafe evidence directory/);
      assert.equal(fs.existsSync(path.join(outside, path.basename(DEFAULT_OUTPUT))), false);
    } finally {fs.rmSync(outside, {recursive: true, force: true});}
  });
});

test('v211: verifier refuses external evidence accessed through a symlink directory', async () => {
  await workspace(async dir => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v211-external-'));
    try {
      fs.writeFileSync(path.join(outside, path.basename(DEFAULT_OUTPUT)), JSON.stringify(proof()));
      fs.symlinkSync(outside, path.join(dir, 'artifacts'), 'dir');
      assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /v211: unsafe evidence directory/);
    } finally {fs.rmSync(outside, {recursive: true, force: true});}
  });
});

test('v211: an artifacts regular file is neither writable nor verifiable as directory', async () => {
  await workspace(() => {
    fs.writeFileSync('artifacts', 'occupied');
    assert.throws(() => writeEvidence(DEFAULT_OUTPUT, proof()), /unsafe evidence directory/);
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence directory/);
    assert.equal(fs.readFileSync('artifacts', 'utf8'), 'occupied');
  });
});

test('v211: verifier fails closed if evidence directory was never created', async () => {
  await workspace(() => {
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /evidence directory unavailable/);
    assert.equal(fs.existsSync('artifacts'), false);
  });
});

test('v211: even a valid directory rejects existing evidence symlink', async () => {
  await workspace(dir => {
    fs.mkdirSync('artifacts');
    const outside = path.join(dir, 'real-proof.json');
    fs.writeFileSync(outside, JSON.stringify(proof()));
    fs.symlinkSync(outside, DEFAULT_OUTPUT);
    assert.throws(() => writeEvidence(DEFAULT_OUTPUT, proof()), /EEXIST/);
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
    assert.equal(JSON.parse(fs.readFileSync(outside, 'utf8')).passed, 13);
  });
});

test('v211: unexpected file path is rejected before a directory can be created', async () => {
  await workspace(() => {
    assert.throws(() => writeEvidence('artifacts/other.json', proof()), /output path/);
    assert.equal(fs.existsSync('artifacts'), false);
  });
});

test('v211: missing but safe directory is allowed by preflight without creation', async () => {
  await workspace(() => {
    assert.equal(assertSafeArtifactDirectory({allowMissing: true}), path.resolve('artifacts'));
    assert.equal(fs.existsSync('artifacts'), false);
  });
});

test('v211: runner blocks a linked directory before launching an integration process', async () => {
  await workspace(async dir => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v211-external-'));
    let started = false;
    try {
      fs.symlinkSync(outside, path.join(dir, 'artifacts'), 'dir');
      await assert.rejects(runBookingIntegration({env,
        runTap: async () => {started = true; return tap();},
        persist: () => {throw new Error('must not persist');},
      }), /v211: unsafe evidence directory/);
      assert.equal(started, false);
    } finally {fs.rmSync(outside, {recursive: true, force: true});}
  });
});

test('v211: legacy evidence CLI never echoes failed raw TAP containing secrets', async () => {
  await workspace(dir => {
    const result = spawnSync(process.execPath, [evidenceScript], {cwd: dir,
      input: 'TAP version 13\nPRIVATE_TAP_DATA=secret\nnot ok 1 - broken\n', encoding: 'utf8', timeout: 3000});
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_TAP_DATA|secret|broken/);
    assert.equal(fs.existsSync('artifacts'), false);
  });
});

test('v211: legacy evidence CLI accepts full TAP without printing the raw TAP', async () => {
  await workspace(dir => {
    const result = spawnSync(process.execPath, [evidenceScript], {cwd: dir,
      input: tap(), encoding: 'utf8', timeout: 3000});
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /TAP version|Subtest|booking_time/);
    assert.match(result.stdout, /evidence PASS: 13\/13/);
    assert.equal(verifyFile(DEFAULT_OUTPUT).tests, 13);
  });
});
