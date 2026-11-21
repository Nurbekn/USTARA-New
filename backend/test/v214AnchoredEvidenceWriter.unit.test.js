'use strict';
// v214: offline-only filesystem race and legacy TAP log regression tests.
// All paths live in a temporary directory. No pg, GitHub, dotenv or network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {writeEvidence, buildEvidence, DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const {writeAnchoredEvidence, MAX_EVIDENCE_BYTES} = require('../scripts/v214-anchored-evidence-write.cjs');
const {verifyFile} = require('../scripts/v197-verify-evidence.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');
const legacyGate = path.resolve(__dirname, '../scripts/v195-tap-result-gate.cjs');
const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/v193-isolated-postgres-booking.yml'), 'utf8');
const legacyTap = (nested = 'nested') =>
  `TAP version 13\n    ok 1 - ${nested}\n    ok 2 - second\n    1..2\nok 1 - ${REQUIRED}\n1..1\n`+
  '# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';
const proof = () => buildEvidence(legacyTap());
async function inWorkspace(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v214-'));
  try { process.chdir(dir); return await fn(dir); }
  finally { process.chdir(previous); fs.rmSync(dir, {recursive:true, force:true}); }
}

test('v214: exclusive anchored writer creates verifiable, private evidence', async () => {
  await inWorkspace(() => {
    const output = writeEvidence(DEFAULT_OUTPUT, proof());
    assert.equal(output, path.resolve(DEFAULT_OUTPUT));
    assert.equal(verifyFile().tests, 3);
    const stat = fs.lstatSync(output);
    assert.equal(stat.nlink,1);
    if (process.platform !== 'win32') assert.equal(stat.mode & 0o777,0o600);
    assert.equal(fs.readFileSync(output, 'utf8').includes('TAP version 13'), false);
  });
});

test('v214: previously existing evidence cannot be overwritten', async () => {
  await inWorkspace(() => {
    const first = writeEvidence(DEFAULT_OUTPUT, proof());
    const original = fs.readFileSync(first);
    assert.throws(() => writeEvidence(DEFAULT_OUTPUT, proof()), /EEXIST/);
    assert.deepEqual(fs.readFileSync(first), original);
  });
});

test('v214: oversized evidence is refused before creating an output directory', async () => {
  await inWorkspace(() => {
    assert.equal(MAX_EVIDENCE_BYTES,4096);
    assert.throws(() => writeAnchoredEvidence(path.basename(DEFAULT_OUTPUT), {
      outcome:'passed', overlong:'X'.repeat(4500),
    }), /evidence size out of bounds/);
    assert.equal(fs.existsSync('artifacts'),false);
  });
});

test('v214: rejected path cannot create or redirect an evidence write', async () => {
  await inWorkspace(() => {
    assert.throws(() => writeAnchoredEvidence('../untrusted', proof()), /unexpected evidence filename/);
    assert.equal(fs.existsSync('artifacts'),false);
  });
});

test('v214: writer opens directory and artifact with no-follow and exclusive flags', async () => {
  await inWorkspace(() => {
    const old = fs.openSync;
    const flags = [];
    try {
      fs.openSync = function(filename, mode, permissions) {
        flags.push({filename:String(filename),mode});
        return old.call(fs, filename, mode, permissions);
      };
      writeEvidence(DEFAULT_OUTPUT, proof());
    } finally { fs.openSync = old; }
    const openedFile = flags.find(x => x.filename.includes('v196-booking-integration-evidence.json'));
    assert.ok(openedFile);
    assert.ok((openedFile.mode & fs.constants.O_EXCL) !== 0);
    if (process.platform === 'linux') assert.ok((openedFile.mode & fs.constants.O_NOFOLLOW) !== 0);
  });
});

test('v214: directory rename and symlink swap before file creation fails closed',
  {skip:process.platform!=='linux'}, async () => {
  await inWorkspace(dir => {
    fs.mkdirSync('artifacts');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v214-outside-'));
    const old = fs.openSync;
    let replaced = false;
    try {
      fs.openSync = function(filename, flags, mode) {
        if (!replaced && String(filename).startsWith('/proc/self/fd/') &&
            String(filename).endsWith(path.basename(DEFAULT_OUTPUT))) {
          replaced = true;
          fs.renameSync(path.join(dir,'artifacts'),path.join(dir,'original-artifacts'));
          fs.symlinkSync(outside,path.join(dir,'artifacts'),'dir');
        }
        return old.call(fs,filename,flags,mode);
      };
      assert.throws(() => writeEvidence(DEFAULT_OUTPUT,proof()), /v214: evidence path or contents changed/);
      assert.equal(replaced,true);
      assert.equal(fs.readdirSync(outside).length,0);
    } finally {
      fs.openSync = old;
      fs.rmSync(outside,{recursive:true,force:true});
    }
  });
});

test('v214: replacing the directory right after opening its descriptor blocks write',
  {skip:process.platform!=='linux'}, async () => {
  await inWorkspace(dir => {
    fs.mkdirSync('artifacts');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v214-outside-'));
    const old = fs.openSync;
    let changed = false;
    try {
      fs.openSync = function(filename,flags,mode) {
        const fd = old.call(fs,filename,flags,mode);
        if (!changed && filename === path.join(dir,'artifacts')) {
          changed = true;
          fs.renameSync(path.join(dir,'artifacts'),path.join(dir,'original-artifacts'));
          fs.symlinkSync(outside,path.join(dir,'artifacts'),'dir');
        }
        return fd;
      };
      assert.throws(() => writeEvidence(DEFAULT_OUTPUT,proof()), /v214: evidence directory was replaced/);
      assert.equal(changed,true);
      assert.deepEqual(fs.readdirSync(outside),[]);
    } finally { fs.openSync = old; fs.rmSync(outside,{recursive:true,force:true}); }
  });
});

test('v214: evidence filename swap after writing is detected without following link',
  {skip:process.platform!=='linux'}, async () => {
  await inWorkspace(dir => {
    const old = fs.fsyncSync;
    let swapped = false;
    try {
      fs.fsyncSync = function(fd) {
        old.call(fs,fd);
        if (!swapped) {
          swapped=true;
          fs.renameSync(path.join(dir,DEFAULT_OUTPUT),path.join(dir,'original-evidence.json'));
          fs.symlinkSync('/etc/passwd',path.join(dir,DEFAULT_OUTPUT));
        }
      };
      assert.throws(() => writeEvidence(DEFAULT_OUTPUT,proof()), /v214: evidence path or contents changed/);
      assert.equal(swapped,true);
      assert.ok(fs.lstatSync(DEFAULT_OUTPUT).isSymbolicLink());
    } finally { fs.fsyncSync = old; }
  });
});

test('v214: legacy TAP CLI accepts a passing report but never echoes private assertion text', () => {
  const secret = 'PRIVATE_TAP_TOKEN_DO_NOT_PRINT_214';
  const result = spawnSync(process.execPath, [legacyGate],{
    input:legacyTap(`nested ${secret}`),encoding:'utf8',timeout:5000,
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/result gate PASS: 3\/3/);
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_TAP_TOKEN|TAP version 13|ok 1 - nested/);
});

test('v214: invalid legacy TAP never prints raw diagnostic content to stdout or stderr', () => {
  const secret = 'PRIVATE_TAP_ERROR_DO_NOT_PRINT_214';
  const result = spawnSync(process.execPath,[legacyGate],{
    input:`TAP version 13\nnot ok 1 - ${secret}\n`,encoding:'utf8',timeout:5000,
  });
  assert.equal(result.status,1);
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_TAP_ERROR|TAP version 13|not ok 1/);
});

test('v214: oversized legacy TAP does not dump its data and fails closed', () => {
  const result = spawnSync(process.execPath,[legacyGate],{
    input:legacyTap()+ 'PRIVATE_OVERSIZED_TAP_214'.repeat(200_000),
    encoding:'utf8',timeout:5000,
  });
  assert.equal(result.status,1);
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_OVERSIZED_TAP_214|TAP version 13/);
});

test('v214: manual CI runs legacy coverage and the new writer/log regression suite before SQL', () => {
  assert.match(workflow,/npm run test:v213:unit/);
  assert.match(workflow,/npm run test:v214:unit/);
  assert.ok(workflow.indexOf('npm run test:v214:unit') < workflow.indexOf('Create disposable non-superuser DB'));
  assert.match(workflow,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/\b(push|pull_request|schedule):/);
});
