'use strict';
// v208/v209: Only a genuinely successful, bounded subprocess can create CI evidence.
// v209: Never replay raw TAP or stderr into CI logs (may contain test data).
// v210: Linux/POSIX subprocess is a new process group; abort the whole group,
// not only the TAP parent, so worker descendants cannot retain DB connections/pipes.
// Run solely against the explicitly approved, disposable PostgreSQL test DB.
// No shell interpolation, no .env reads, no credentials in the artifact.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {checkIsolatedDbGate} = require('./v193-isolated-db-gate.cjs');
const {buildEvidence, writeEvidence, DEFAULT_OUTPUT} = require('./v196-integration-evidence.cjs');
const {assertSafeArtifactDirectory} = require('./v211-artifact-directory-guard.cjs');
const {collectCiProvenance} = require('./v213-ci-provenance.cjs');
const {assertRunIdentityBeforeIntegration} = require('./v216-run-identity-guard.cjs');
const {assertUnambiguousCiMode} = require('./v217-ci-environment-mode.cjs');

const TEST_FILE = 'test/bookingConcurrency.postgres.integration.test.js';
const TAP_LIMIT_BYTES = 4_000_000;
const STDERR_LIMIT_BYTES = 32_768;
const PROCESS_TIMEOUT_MS = 150_000;
const ABORT_CLOSE_GRACE_MS = 1_500;

function captureTap({
  command = process.execPath,
  args = ['--test', '--test-reporter=tap', TEST_FILE],
  cwd = process.cwd(),
  env = process.env,
  timeoutMs = PROCESS_TIMEOUT_MS,
  maxBytes = TAP_LIMIT_BYTES,
  maxStderrBytes = STDERR_LIMIT_BYTES,
} = {}) {
  return new Promise((resolve, reject) => {
    // Reject process-level failure even if stdout contains valid-looking TAP.
    const buffers = [];
    let bytes = 0;
    let stderrBytes = 0;
    let aborted = false;
    let reason = null;
    let child;
    let abortTimer;
    let finished = false;
    const useProcessGroup = process.platform !== 'win32';
    function rejectOnce(message) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(abortTimer);
      reject(new Error(message));
    }
    function terminateTree() {
      // detached creates a new process group on POSIX. SIGKILL the group,
      // including Node's test worker processes inheriting stdout/stderr.
      if (useProcessGroup && Number.isSafeInteger(child?.pid) && child.pid > 1) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch (_) { /* group already gone or signalling not permitted */ }
      }
      try { child?.kill('SIGKILL'); } catch (_) { /* already exited */ }
    }
    function abort(why) {
      if (aborted || finished) return;
      reason = why;
      aborted = true;
      terminateTree();
      // Close normally follows SIGKILL. In case inherited streams never
      // close, do not leave the CI runner's promise pending indefinitely.
      abortTimer = setTimeout(() => {
        // If an unrelated process inherited our pipes, a missing 'close'
        // must not retain Node's event loop after the failed CI proof.
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.unref();
        rejectOnce(`v208: integration subprocess failed (${reason})`);
      }, ABORT_CLOSE_GRACE_MS);
    }
    let timer;
    try {
      child = spawn(command, args, {
        cwd, env, shell: false, windowsHide: true,
        detached: useProcessGroup,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(new Error('v208: integration subprocess could not start'));
      return;
    }
    timer = setTimeout(() => abort('timeout'), timeoutMs);
    child.stdout.on('data', chunk => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        abort('oversized TAP output');
        return;
      }
      buffers.push(chunk);
      // Intentionally do not mirror stdout to CI logs: TAP may carry data.
    });
    child.stderr.on('data', chunk => {
      if (aborted) return;
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) {
        abort('oversized diagnostic output');
      }
      // Never echo arbitrary child diagnostics (may contain DB credentials).
    });
    child.once('error', () => abort('spawn error'));
    child.once('close', (code, signal) => {
      if (finished) return;
      clearTimeout(timer);
      clearTimeout(abortTimer);
      finished = true;
      if (reason || aborted || code !== 0 || signal) {
        reject(new Error(`v208: integration subprocess failed (${reason || 'nonzero exit or signal'})`));
        return;
      }
      const tap = Buffer.concat(buffers).toString('utf8');
      if (!tap.trim()) {
        reject(new Error('v208: integration subprocess produced no TAP'));
        return;
      }
      resolve(tap);
    });
  });
}

async function runBookingIntegration({
  env = process.env,
  runTap = captureTap,
  persist = writeEvidence,
} = {}) {
  // Validate the URL and opt-in BEFORE starting any child or touching output.
  checkIsolatedDbGate(env);
  // Preserve the v216 explicit run/attempt mismatch failure before checking
  // remaining GitHub identity markers: both checks precede any test subprocess.
  const provenance = collectCiProvenance(env);
  const runIdentity = assertRunIdentityBeforeIntegration(env, provenance);
  // A partial GitHub identity cannot silently downgrade to a local run.
  assertUnambiguousCiMode(env);
  // Reject a linked/misplaced artifact root BEFORE starting a mutating test.
  assertSafeArtifactDirectory({allowMissing: true});
  const output = path.resolve(process.cwd(), DEFAULT_OUTPUT);
  // Fail closed if the current workspace already contains possibly stale evidence.
  if (fs.existsSync(output)) throw new Error('v208: pre-existing evidence cannot be reused');
  const tap = await runTap({env});
  // Do not persist evidence from a nonzero process, failed/skipped test, or
  // missing/reordered required 12 integration cases.
  const evidence = buildEvidence(tap, {
    runId: runIdentity.ciRunId,
    runAttempt: runIdentity.ciRunAttempt,
    provenance,
    requireCaseCoverage: true,
  });
  persist(DEFAULT_OUTPUT, evidence);
  return {tests: evidence.tests, passed: evidence.passed};
}

if (require.main === module) {
  runBookingIntegration()
    .then(result => console.log(`v208 real integration exit + evidence PASS: ${result.passed}/${result.tests}`))
    .catch(() => {
      console.error('v208 integration FAILED (subprocess exit or evidence invalid; no artifact authorized)');
      process.exitCode = 1;
    });
}

module.exports = {captureTap, runBookingIntegration, TEST_FILE, TAP_LIMIT_BYTES, STDERR_LIMIT_BYTES, PROCESS_TIMEOUT_MS, ABORT_CLOSE_GRACE_MS};
