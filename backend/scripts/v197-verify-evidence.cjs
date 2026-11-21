'use strict';
// Offline, strictly bounded verification before CI uploads the v196 evidence.
// Does not read TAP logs, credentials, dotenv or connect to any database.
const fs = require('node:fs');
const path = require('node:path');
const { REQUIRED, } = require('./v195-tap-result-gate.cjs');
const { DEFAULT_OUTPUT } = require('./v196-integration-evidence.cjs');
const { assertSafeArtifactDirectory } = require('./v211-artifact-directory-guard.cjs');
const { PROVENANCE_FIELDS, verifyProvenanceFields, collectCiProvenance } = require('./v213-ci-provenance.cjs');
const {validateEvidenceRunIdentity} = require('./v216-run-identity-guard.cjs');
const {assertUnambiguousCiMode} = require('./v217-ci-environment-mode.cjs');
const KEYS = ['schema','outcome','suite','tests','passed','skipped','failed','cancelled','todo','tapSha256','ciRunId','ciRunAttempt',...PROVENANCE_FIELDS];
function verifyEvidence(value, env = {}) {
  // Do not silently skip CI provenance matching if GITHUB_ACTIONS is absent
  // but other GitHub identity variables are present.
  assertUnambiguousCiMode(env);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...KEYS].sort())) {
    throw new Error('v197: unexpected evidence fields');
  }
  if (value.schema !== 'ustara.booking-concurrency-evidence.v2' ||
      value.outcome !== 'passed' || value.suite !== REQUIRED ||
      !Number.isSafeInteger(value.tests) || value.tests < 2 ||
      value.passed !== value.tests ||
      ![value.failed,value.skipped,value.cancelled,value.todo].every(n => n === 0) ||
      typeof value.tapSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.tapSha256)) {
    throw new Error('v197: invalid passing test evidence');
  }
  const validId = /^(?:local|[1-9]\d{0,19})$/;
  const validAttempt = /^(?:local|[1-9]\d{0,9})$/;
  if (typeof value.ciRunId !== 'string' || !validId.test(value.ciRunId) ||
      typeof value.ciRunAttempt !== 'string' || !validAttempt.test(value.ciRunAttempt)) {
    throw new Error('v197: invalid run metadata');
  }
  let provenance;
  try {
    provenance = verifyProvenanceFields(Object.fromEntries(PROVENANCE_FIELDS.map(key => [key, value[key]])));
  } catch (_) {
    throw new Error('v197: invalid commit/workflow provenance');
  }
  // The run and attempt may be locally attested OR CI-attested, never mixed.
  try { validateEvidenceRunIdentity(value.ciRunId, value.ciRunAttempt, provenance); }
  catch (_) { throw new Error('v197: inconsistent run provenance and attempt'); }
  if (env.GITHUB_ACTIONS === 'true') {
    if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT ||
        value.ciRunId !== env.GITHUB_RUN_ID || value.ciRunAttempt !== env.GITHUB_RUN_ATTEMPT ||
        value.ciRunId === 'local' || value.ciRunAttempt === 'local') {
      throw new Error('v197: evidence does not belong to this workflow run');
    }
  }
  if (env.GITHUB_ACTIONS === 'true') {
    let expected;
    try { expected = collectCiProvenance(env, {requireCi: true}); }
    catch (_) {throw new Error('v197: missing or invalid CI source provenance');}
    if (PROVENANCE_FIELDS.some(key => provenance[key] !== expected[key])) {
      throw new Error('v197: evidence belongs to another commit or workflow');
    }
  }
  return {tests:value.tests, sha256:value.tapSha256};
}
// v212/v215: Read through a descriptor bound to the approved directory.
// v215 additionally requires that the opened inodes remain reachable through
// the APPROVED names before and after reading. A renamed/moved directory or
// substituted evidence filename is not an acceptable proof for CI upload.
function readEvidenceFromApprovedDirectory() {
  const root = assertSafeArtifactDirectory();
  const {O_RDONLY, O_NOFOLLOW, O_DIRECTORY, O_NONBLOCK} = fs.constants;
  if (process.platform === 'linux' &&
      ![O_NOFOLLOW, O_DIRECTORY, O_NONBLOCK].every(Number.isInteger)) {
    throw new Error('v215: secure file descriptor flags unavailable');
  }
  const filename = path.basename(DEFAULT_OUTPUT);
  const approvedFile = path.join(root, filename);
  let directoryFd;
  let fileFd;
  try {
    directoryFd = fs.openSync(root, O_RDONLY | (O_NOFOLLOW || 0) | (O_DIRECTORY || 0));
    const directoryStat = fs.fstatSync(directoryFd, {bigint: true});
    if (!directoryStat.isDirectory()) throw new Error('v215: unsafe evidence directory');

    // fstat alone would allow a renamed directory to retain valid old content.
    function checkApprovedDirectoryName() {
      const named = fs.lstatSync(root, {bigint: true});
      if (!named.isDirectory() || named.isSymbolicLink() ||
          named.dev !== directoryStat.dev || named.ino !== directoryStat.ino) {
        throw new Error('v215: evidence directory name changed');
      }
    }
    checkApprovedDirectoryName();

    const anchoredFile = process.platform === 'linux'
      ? `/proc/self/fd/${directoryFd}/${filename}` : approvedFile;
    fileFd = fs.openSync(anchoredFile, O_RDONLY | (O_NOFOLLOW || 0) | (O_NONBLOCK || 0));
    const initial = fs.fstatSync(fileFd, {bigint: true});
    if (!initial.isFile() || initial.nlink !== 1n || initial.size > 4096n || initial.size < 100n) {
      throw new Error('v215: unsafe evidence file');
    }
    function checkApprovedFileName() {
      checkApprovedDirectoryName();
      const named = fs.lstatSync(approvedFile, {bigint: true});
      if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n ||
          named.dev !== initial.dev || named.ino !== initial.ino ||
          named.size !== initial.size) {
        throw new Error('v215: evidence filename changed');
      }
    }
    checkApprovedFileName();

    // Bound the actual read as well as stat size. Metadata checks catch
    // same-size in-place edits as well as growth/truncation during reading.
    const buffer = Buffer.alloc(4097);
    const bytesRead = fs.readSync(fileFd, buffer, 0, buffer.length, 0);
    const completed = fs.fstatSync(fileFd, {bigint: true});
    if (BigInt(bytesRead) !== initial.size || completed.size !== initial.size ||
        completed.dev !== initial.dev || completed.ino !== initial.ino ||
        completed.mtimeNs !== initial.mtimeNs || completed.ctimeNs !== initial.ctimeNs) {
      throw new Error('v215: evidence modified during verification');
    }
    checkApprovedFileName();
    return buffer.toString('utf8', 0, bytesRead);
  } catch (_) {
    throw new Error('v212: unsafe evidence file or directory');
  } finally {
    if (fileFd !== undefined) fs.closeSync(fileFd);
    if (directoryFd !== undefined) fs.closeSync(directoryFd);
  }
}
function verifyFile(filename = DEFAULT_OUTPUT, env = process.env) {
  if (filename !== DEFAULT_OUTPUT) throw new Error('v197: unexpected evidence path');
  const contents = readEvidenceFromApprovedDirectory();
  return verifyEvidence(JSON.parse(contents), env);
}

if (require.main === module) {
  try {
    const result = verifyFile();
    console.log(`v197 evidence verification PASS: ${result.tests} tests, schema and run identity checked`);
  } catch (_) {
    console.error('v197 evidence verification FAILED (artifact not eligible for upload)');
    process.exitCode = 1;
  }
}
module.exports = {verifyEvidence,verifyFile,readEvidenceFromApprovedDirectory};
