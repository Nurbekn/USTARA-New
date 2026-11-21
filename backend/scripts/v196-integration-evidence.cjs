'use strict';
// Generate a minimal, credential-free CI artifact only after full TAP validation.
// No database connections, dotenv, external packages, or raw TAP in the artifact.
const crypto = require('node:crypto');
const path = require('node:path');
const { validateTapReport, REQUIRED } = require('./v195-tap-result-gate.cjs');
const { assertIntegrationCaseCoverage } = require('./v203-integration-case-coverage.cjs');
const { writeAnchoredEvidence } = require('./v214-anchored-evidence-write.cjs');
const { collectCiProvenance, verifyProvenanceFields, OFFLINE_PROVENANCE } = require('./v213-ci-provenance.cjs');
const MAX_BYTES = 4_000_000;
const DEFAULT_OUTPUT = 'artifacts/v196-booking-integration-evidence.json';

function buildEvidence(tap, metadata = {}) {
  const proof = metadata.requireCaseCoverage === true
    ? assertIntegrationCaseCoverage(tap) : validateTapReport(tap);
  const runId = String(metadata.runId || 'local');
  const runAttempt = String(metadata.runAttempt || 'local');
  if (!/^(?:local|[1-9]\d{0,19})$/.test(runId) ||
      !/^(?:local|[1-9]\d{0,9})$/.test(runAttempt)) {
    throw new Error('v196: invalid CI run metadata');
  }
  const provenance = verifyProvenanceFields(metadata.provenance || OFFLINE_PROVENANCE);
  return {
    schema: 'ustara.booking-concurrency-evidence.v2',
    outcome: 'passed',
    suite: REQUIRED,
    tests: proof.tests,
    passed: proof.pass,
    skipped: proof.skipped,
    failed: 0,
    cancelled: 0,
    todo: 0,
    tapSha256: crypto.createHash('sha256').update(tap, 'utf8').digest('hex'),
    ciRunId: runId,
    ciRunAttempt: runAttempt,
    ...provenance,
  };
}
function writeEvidence(filePath, evidence) {
  const target = path.resolve(filePath);
  if (target !== path.resolve(process.cwd(), DEFAULT_OUTPUT)) {
    throw new Error('v196: output path must be the approved artifacts path');
  }
  if (!evidence || evidence.outcome !== 'passed') throw new Error('v196: invalid evidence');
  return writeAnchoredEvidence(path.basename(DEFAULT_OUTPUT), evidence);
}
async function main() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('v196: TAP exceeds safe limit');
    chunks.push(chunk);
    // Never mirror arbitrary TAP payloads to CI logs (v209/v211).
  }
  const tap = Buffer.concat(chunks).toString('utf8');
  const evidence = buildEvidence(tap, {runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    provenance: collectCiProvenance(process.env), requireCaseCoverage: true});
  writeEvidence(DEFAULT_OUTPUT, evidence);
  console.log(`v196 integration evidence PASS: ${evidence.passed}/${evidence.tests} (SHA-256 recorded)`);
}
if (require.main === module) {
  main().catch(() => {
    console.error('v196 integration evidence FAILED (invalid test evidence or output path)');
    process.exitCode = 1;
  });
}
module.exports = { buildEvidence, writeEvidence, DEFAULT_OUTPUT };
