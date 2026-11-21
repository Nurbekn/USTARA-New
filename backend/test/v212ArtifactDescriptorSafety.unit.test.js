'use strict';
// v212: offline descriptor-anchored evidence verification; never touches a DB.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {buildEvidence, writeEvidence, DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const {verifyFile} = require('../scripts/v197-verify-evidence.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const {collectCiProvenance} = require('../scripts/v213-ci-provenance.cjs');

const tap = `TAP version 13\n    ok 1 - first\n    ok 2 - second\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
const env = {GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '212', GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'Nurbekn/USTARA-New',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: 'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch'};
const proof = () => buildEvidence(tap, {runId:'212',runAttempt:'2',provenance:collectCiProvenance(env)});
async function workspace(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v212-evidence-'));
  try { process.chdir(dir); return await fn(dir); }
  finally { process.chdir(previous); fs.rmSync(dir, {recursive:true, force:true}); }
}

test('v212: original exclusive evidence can be opened by descriptor and verified', async () => {
  await workspace(() => {
    writeEvidence(DEFAULT_OUTPUT, proof());
    assert.equal(verifyFile(DEFAULT_OUTPUT, env).tests, 3);
    assert.equal(fs.lstatSync(DEFAULT_OUTPUT).nlink, 1);
  });
});

test('v212: final-component symlink to a valid proof is rejected', async () => {
  await workspace(dir => {
    fs.mkdirSync('artifacts');
    const external = path.join(dir, 'outside.json');
    fs.writeFileSync(external, JSON.stringify(proof()));
    fs.symlinkSync(external, DEFAULT_OUTPUT);
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
  });
});

test('v212: hard-linked proof is rejected even when JSON and run ID are valid', async () => {
  await workspace(dir => {
    fs.mkdirSync('artifacts');
    const external = path.join(dir, 'outside.json');
    fs.writeFileSync(external, JSON.stringify(proof()));
    fs.linkSync(external, DEFAULT_OUTPUT);
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
  });
});

test('v212: FIFO cannot block verifier while waiting for a writer', {skip: process.platform !== 'linux'}, async () => {
  await workspace(() => {
    fs.mkdirSync('artifacts');
    const result = spawnSync('mkfifo', [DEFAULT_OUTPUT], {timeout: 2000});
    assert.equal(result.status, 0);
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
  });
});

test('v212: directory masquerading as the file is rejected', async () => {
  await workspace(() => {
    fs.mkdirSync('artifacts');
    fs.mkdirSync(DEFAULT_OUTPUT);
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
  });
});

test('v212: oversized file is rejected before reading its contents', async () => {
  await workspace(() => {
    fs.mkdirSync('artifacts');
    fs.writeFileSync(DEFAULT_OUTPUT, 'x'.repeat(4097));
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
  });
});

test('v212/v215: renamed directory is rejected even when descriptor still points to old proof', {skip: process.platform !== 'linux'}, async () => {
  await workspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, proof());
    const originalOpen = fs.openSync;
    let switched = false;
    try {
      fs.openSync = function(filename, flags, mode) {
        const fd = originalOpen.call(fs, filename, flags, mode);
        if (!switched && filename === path.join(dir, 'artifacts')) {
          switched = true;
          fs.renameSync(path.join(dir,'artifacts'), path.join(dir,'artifacts-moved'));
          fs.mkdirSync(path.join(dir,'artifacts'));
          fs.writeFileSync(path.join(dir,DEFAULT_OUTPUT), 'untrusted replacement');
        }
        return fd;
      };
      assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file or directory/);
      assert.equal(switched,true);
    } finally {fs.openSync = originalOpen;}
  });
});

test('v212/v215: renamed evidence file is rejected even when old descriptor remains valid', {skip: process.platform !== 'linux'}, async () => {
  await workspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, proof());
    const originalOpen = fs.openSync;
    let switched = false;
    try {
      fs.openSync = function(filename, flags, mode) {
        const fd = originalOpen.call(fs, filename, flags, mode);
        if (!switched && typeof filename === 'string' &&
            filename.startsWith('/proc/self/fd/') && filename.endsWith(path.basename(DEFAULT_OUTPUT))) {
          switched = true;
          fs.renameSync(path.join(dir,DEFAULT_OUTPUT), path.join(dir,'proof-moved.json'));
          fs.symlinkSync('/etc/passwd', path.join(dir,DEFAULT_OUTPUT));
        }
        return fd;
      };
      assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file or directory/);
      assert.equal(switched,true);
    } finally {fs.openSync = originalOpen;}
  });
});

test('v212: secure file reading does not bypass run-attempt verification', async () => {
  await workspace(() => {
    writeEvidence(DEFAULT_OUTPUT, proof());
    assert.throws(() => verifyFile(DEFAULT_OUTPUT, {...env, GITHUB_RUN_ATTEMPT:'3'}), /workflow run/);
  });
});

test('v212: evidence growth during bounded read fails closed', async () => {
  await workspace(() => {
    writeEvidence(DEFAULT_OUTPUT, proof());
    const readOriginal = fs.readSync;
    let grew = false;
    try {
      fs.readSync = function(fd, buffer, offset, length, position) {
        const count = readOriginal.call(fs, fd, buffer, offset, length, position);
        if (!grew) {
          grew = true;
          fs.appendFileSync(DEFAULT_OUTPUT, 'untrusted addition');
        }
        return count;
      };
      assert.throws(() => verifyFile(DEFAULT_OUTPUT, env), /unsafe evidence file/);
      assert.equal(grew,true);
    } finally {fs.readSync = readOriginal;}
  });
});
