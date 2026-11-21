'use strict';
// v213: Exact, credential-free source provenance for a MANUAL integration job.
// No SQL, network access, dotenv, git mutations or raw environment logging.
const WORKFLOW_PATH = '.github/workflows/v193-isolated-postgres-booking.yml';
const OFFLINE_PROVENANCE = Object.freeze({
  ciHeadSha: 'local', ciRepository: 'local', ciRef: 'local',
  ciWorkflowRef: 'local', ciEventName: 'local',
});
const PROVENANCE_FIELDS = Object.freeze(Object.keys(OFFLINE_PROVENANCE));

function validateRepository(value) {
  return typeof value === 'string' && value.length <= 160 &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) &&
    value.split('/').every(x => x !== '.' && x !== '..' && !x.startsWith('.'));
}
function validateGitRef(value) {
  if (typeof value !== 'string' || value.length > 240 ||
      !/^refs\/(?:heads|tags)\/[A-Za-z0-9_.\/-]+$/.test(value) ||
      value.includes('//') || value.endsWith('/') || value.endsWith('.') ||
      value.split('/').some(x => x === '.' || x === '..' || x.startsWith('.'))) return false;
  return true;
}
function verifyProvenanceFields(value, {requireCi = false} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...PROVENANCE_FIELDS].sort())) {
    throw new Error('v213: unexpected provenance fields');
  }
  if (PROVENANCE_FIELDS.every(key => value[key] === 'local')) {
    if (requireCi) throw new Error('v213: local provenance is invalid in CI');
    return {...OFFLINE_PROVENANCE};
  }
  if (typeof value.ciHeadSha !== 'string' || !/^[0-9a-f]{40}$/.test(value.ciHeadSha) || /^0{40}$/.test(value.ciHeadSha) ||
      !validateRepository(value.ciRepository) || !validateGitRef(value.ciRef) ||
      value.ciWorkflowRef !== `${value.ciRepository}/${WORKFLOW_PATH}@${value.ciRef}` ||
      value.ciEventName !== 'workflow_dispatch') {
    throw new Error('v213: invalid source commit or manual workflow provenance');
  }
  return {...value};
}
function collectCiProvenance(env = process.env, {requireCi = false} = {}) {
  if (env.GITHUB_ACTIONS !== 'true') {
    if (requireCi) throw new Error('v213: only GitHub Actions may attest CI provenance');
    return {...OFFLINE_PROVENANCE};
  }
  return verifyProvenanceFields({
    ciHeadSha: env.GITHUB_SHA, ciRepository: env.GITHUB_REPOSITORY,
    ciRef: env.GITHUB_REF, ciWorkflowRef: env.GITHUB_WORKFLOW_REF,
    ciEventName: env.GITHUB_EVENT_NAME,
  }, {requireCi: true});
}
if (require.main === module) {
  try {
    collectCiProvenance(process.env, {requireCi: process.argv.includes('--require-ci')});
    console.log('v213 manual CI source provenance PASS (commit/workflow/ref validated)');
  } catch (_) {
    console.error('v213 CI source provenance BLOCKED (missing or inconsistent context)');
    process.exitCode = 1;
  }
}
module.exports = {WORKFLOW_PATH, OFFLINE_PROVENANCE, PROVENANCE_FIELDS,
  validateRepository, validateGitRef, verifyProvenanceFields, collectCiProvenance};
