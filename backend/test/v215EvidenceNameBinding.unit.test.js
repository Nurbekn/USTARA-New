'use strict';
// v215: Non-mutating, offline proof that evidence still exists at the approved
// path during descriptor-anchored verification. Never touches PG, env files,
// GitHub APIs, or real user data.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildEvidence, writeEvidence, DEFAULT_OUTPUT} = require('../scripts/v196-integration-evidence.cjs');
const {verifyFile} = require('../scripts/v197-verify-evidence.cjs');
const {collectCiProvenance} = require('../scripts/v213-ci-provenance.cjs');
const {REQUIRED} = require('../scripts/v195-tap-result-gate.cjs');

const ENV = Object.freeze({GITHUB_ACTIONS:'true', GITHUB_RUN_ID:'215', GITHUB_RUN_ATTEMPT:'1',
  GITHUB_SHA:'a'.repeat(40), GITHUB_REPOSITORY:'Nurbekn/USTARA-New',
  GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main'});
const tap = `TAP version 13\n    ok 1 - first\n    ok 2 - second\n    1..2\nok 1 - ${REQUIRED}\n1..1\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
function evidence() {
  return buildEvidence(tap, {runId:'215',runAttempt:'1',provenance:collectCiProvenance(ENV)});
}
function withWorkspace(fn) {
  const previous = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v215-'));
  try { process.chdir(dir); return fn(dir); }
  finally { process.chdir(previous); fs.rmSync(dir, {recursive:true, force:true}); }
}
function reject() { assert.throws(() => verifyFile(DEFAULT_OUTPUT, ENV), /unsafe evidence file or directory/); }

test('v215: unchanged evidence remains verifiable and run-bound', () => withWorkspace(() => {
  writeEvidence(DEFAULT_OUTPUT, evidence());
  assert.equal(verifyFile(DEFAULT_OUTPUT, ENV).tests, 3);
  assert.throws(() => verifyFile(DEFAULT_OUTPUT, {...ENV,GITHUB_SHA:'b'.repeat(40)}), /another commit/);
}));

test('v215: renamed directory immediately after descriptor open is rejected',
  {skip:process.platform!=='linux'}, () => withWorkspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, evidence());
    const original = fs.openSync;
    let swapped = false;
    try {
      fs.openSync = function(name, ...args) {
        const fd = original.call(fs, name, ...args);
        if (!swapped && name === path.join(dir,'artifacts')) {
          swapped = true;
          fs.renameSync(path.join(dir,'artifacts'), path.join(dir,'moved'));
          fs.mkdirSync(path.join(dir,'artifacts'));
        }
        return fd;
      };
      reject();
      assert.equal(swapped, true);
    } finally {fs.openSync = original;}
  }));

test('v215: file replacement immediately after descriptor open is rejected',
  {skip:process.platform!=='linux'}, () => withWorkspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, evidence());
    const original = fs.openSync;
    let swapped = false;
    try {
      fs.openSync = function(name, ...args) {
        const fd = original.call(fs, name, ...args);
        if (!swapped && String(name).startsWith('/proc/self/fd/') && String(name).endsWith(path.basename(DEFAULT_OUTPUT))) {
          swapped = true;
          fs.renameSync(path.join(dir,DEFAULT_OUTPUT), path.join(dir,'moved.json'));
          fs.writeFileSync(path.join(dir,DEFAULT_OUTPUT), JSON.stringify(evidence()));
        }
        return fd;
      };
      reject();
      assert.equal(swapped, true);
    } finally {fs.openSync = original;}
  }));

test('v215: directory substitution during read is rejected even if original JSON is valid',
  {skip:process.platform!=='linux'}, () => withWorkspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, evidence());
    const original = fs.readSync;
    let swapped = false;
    try {
      fs.readSync = function(...args) {
        const value = original.apply(fs,args);
        if (!swapped) {
          swapped = true;
          fs.renameSync(path.join(dir,'artifacts'), path.join(dir,'moved'));
          fs.mkdirSync(path.join(dir,'artifacts'));
          fs.writeFileSync(DEFAULT_OUTPUT, JSON.stringify(evidence()));
        }
        return value;
      };
      reject();
      assert.equal(swapped, true);
    } finally {fs.readSync = original;}
  }));

test('v215: swapping evidence inode during read rejects even a copy with the same JSON',
  {skip:process.platform!=='linux'}, () => withWorkspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, evidence());
    const original = fs.readSync;
    let swapped = false;
    try {
      fs.readSync = function(...args) {
        const value = original.apply(fs,args);
        if (!swapped) {
          swapped = true;
          const bytes = fs.readFileSync(DEFAULT_OUTPUT);
          fs.renameSync(path.join(dir,DEFAULT_OUTPUT), path.join(dir,'moved.json'));
          fs.writeFileSync(DEFAULT_OUTPUT, bytes);
        }
        return value;
      };
      reject();
      assert.equal(swapped, true);
    } finally {fs.readSync = original;}
  }));

test('v215: same-length in-place write during read changes file metadata and fails',
  {skip:process.platform!=='linux'}, () => withWorkspace(() => {
    writeEvidence(DEFAULT_OUTPUT, evidence());
    const original = fs.readSync;
    let changed = false;
    try {
      fs.readSync = function(...args) {
        const value = original.apply(fs,args);
        if (!changed) {
          changed = true;
          const copy = fs.readFileSync(DEFAULT_OUTPUT);
          copy[0] = copy[0] === 123 ? 91 : 123;
          fs.writeFileSync(DEFAULT_OUTPUT, copy);
        }
        return value;
      };
      reject();
      assert.equal(changed, true);
    } finally {fs.readSync = original;}
  }));

test('v215: additional hardlink created during read makes evidence unacceptable',
  {skip:process.platform!=='linux'}, () => withWorkspace(dir => {
    writeEvidence(DEFAULT_OUTPUT, evidence());
    const original = fs.readSync;
    let linked = false;
    try {
      fs.readSync = function(...args) {
        const value = original.apply(fs,args);
        if (!linked) {
          linked = true;
          fs.linkSync(DEFAULT_OUTPUT, path.join(dir, 'linked-evidence.json'));
        }
        return value;
      };
      reject();
      assert.equal(linked,true);
    } finally {fs.readSync = original;}
  }));

test('v215: read does not create or rewrite evidence when the file is missing', () => withWorkspace(() => {
  fs.mkdirSync('artifacts');
  reject();
  assert.deepEqual(fs.readdirSync('artifacts'),[]);
}));

test('v215: CI runs verifier regression tests before disposable DB creation and uploads only on success', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(workflow, /npm run test:v215:unit/);
  assert.ok(workflow.indexOf('npm run test:v215:unit') < workflow.indexOf('Create disposable non-superuser DB'));
  assert.match(workflow, /^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/\b(push|pull_request|schedule):/);
  assert.match(workflow, /if: success\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
});
