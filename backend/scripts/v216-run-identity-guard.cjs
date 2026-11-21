'use strict';
// v216: Ensure an evidence run ID, attempt and source provenance all describe
// the same provenance mode. Read-only: no SQL, .env, network or file writes.
// Locally generated evidence must never claim to be a GitHub Actions attempt;
// a CI evidence claim must have a numeric run/attempt and validated CI origin.
const {PROVENANCE_FIELDS, verifyProvenanceFields, OFFLINE_PROVENANCE} =
  require('./v213-ci-provenance.cjs');

const RUN_ID_RE = /^[1-9]\d{0,19}$/;
const RUN_ATTEMPT_RE = /^[1-9]\d{0,9}$/;

function validateEvidenceRunIdentity(runId, runAttempt, provenance = OFFLINE_PROVENANCE) {
  if (typeof runId !== 'string' || typeof runAttempt !== 'string') {
    throw new Error('v216: run identity values must be strings');
  }
  const checkedProvenance = verifyProvenanceFields(provenance);
  const localSource = PROVENANCE_FIELDS.every(field => checkedProvenance[field] === 'local');
  const localRun = runId === 'local' && runAttempt === 'local';
  const ciRun = RUN_ID_RE.test(runId) && RUN_ATTEMPT_RE.test(runAttempt);
  if (!(localSource && localRun) && !(!localSource && ciRun)) {
    throw new Error('v216: run identity and source provenance disagree');
  }
  return {ciRunId: runId, ciRunAttempt: runAttempt, provenance: checkedProvenance, local: localRun};
}

// Called BEFORE launching any database-writing test subprocess. Do not let
// missing/invalid CI run metadata produce writes that can never be attested.
function assertRunIdentityBeforeIntegration(env, provenance) {
  if (env.GITHUB_ACTIONS === 'true') {
    const validated = validateEvidenceRunIdentity(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, provenance);
    if (validated.local) throw new Error('v216: local metadata forbidden in CI');
    return validated;
  }
  if (env.GITHUB_RUN_ID !== undefined || env.GITHUB_RUN_ATTEMPT !== undefined) {
    throw new Error('v216: offline run may not claim GitHub Actions run metadata');
  }
  return validateEvidenceRunIdentity('local', 'local', provenance);
}
module.exports = {RUN_ID_RE, RUN_ATTEMPT_RE, validateEvidenceRunIdentity, assertRunIdentityBeforeIntegration};
