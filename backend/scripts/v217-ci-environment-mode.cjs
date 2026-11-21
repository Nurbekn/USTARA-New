'use strict';
// v217: A partial or ambiguously marked GitHub Actions environment must not
// be treated as a local run. This is an OFFLINE provenance check: no SQL,
// network, dotenv, filesystem modification, or logging of environment values.
const GITHUB_IDENTITY_MARKERS = Object.freeze([
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_SHA',
  'GITHUB_REPOSITORY',
  'GITHUB_REF',
  'GITHUB_WORKFLOW_REF',
  'GITHUB_EVENT_NAME',
  'GITHUB_WORKSPACE',
  'GITHUB_JOB',
  'GITHUB_RUN_NUMBER',
]);

function assertUnambiguousCiMode(env = process.env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('v217: invalid execution environment');
  }
  if (env.GITHUB_ACTIONS === 'true') return 'github-actions';
  // A genuine local test has no GitHub Actions switch or identity markers.
  // GITHUB_ACTIONS=false, empty, or otherwise malformed must NOT silently
  // fall back to local provenance. Treat even empty marker values as present.
  if (Object.prototype.hasOwnProperty.call(env, 'GITHUB_ACTIONS') ||
      GITHUB_IDENTITY_MARKERS.some(key => Object.prototype.hasOwnProperty.call(env, key))) {
    throw new Error('v217: ambiguous GitHub Actions environment');
  }
  return 'local';
}

module.exports = {GITHUB_IDENTITY_MARKERS, assertUnambiguousCiMode};
