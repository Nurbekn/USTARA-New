'use strict';
// Verify the entire MANUAL GitHub Actions identity before any disposable DB
// is created. Offline-only: no network, SQL, .env reading or credentials.
const {assertUnambiguousCiMode} = require('./v217-ci-environment-mode.cjs');
const {collectCiProvenance} = require('./v213-ci-provenance.cjs');
const {assertRunIdentityBeforeIntegration} = require('./v216-run-identity-guard.cjs');

function checkPrebootstrapCiIdentity(env = process.env) {
  if (assertUnambiguousCiMode(env) !== 'github-actions') {
    throw new Error('v218: manual GitHub Actions context required before database setup');
  }
  const provenance = collectCiProvenance(env, {requireCi:true});
  const identity = assertRunIdentityBeforeIntegration(env, provenance);
  if (identity.local) throw new Error('v218: local run identity forbidden');
  // Never print the identity values, environment or URL to logs.
  return Object.freeze({mode:'github-actions', checked:true});
}

if (require.main === module) {
  try {
    checkPrebootstrapCiIdentity();
    console.log('v218 manual CI identity PASS before disposable database setup');
  } catch (_) {
    console.error('v218 manual CI identity BLOCKED before database setup');
    process.exitCode = 1;
  }
}
module.exports = {checkPrebootstrapCiIdentity};
