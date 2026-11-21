'use strict';
// Reuse the already-tested read-only v198 PostgreSQL 18 runtime proof, but
// run it BEFORE the 63-migration bootstrap as well as after it. Requires a
// complete manual GitHub Actions identity and the existing isolated DB gate.
const {checkPrebootstrapCiIdentity} = require('./v218-prebootstrap-ci-gate.cjs');
const {runRuntimeProof} = require('./v198-postgres-runtime-proof.cjs');

async function runPrebootstrapRuntimeProof(env = process.env, injectedPool) {
  checkPrebootstrapCiIdentity(env);  // no SQL / network
  return runRuntimeProof(env, injectedPool); // BEGIN READ ONLY, ROLLBACK
}

if (require.main === module) {
  runPrebootstrapRuntimeProof()
    .then(() => console.log('v218 prebootstrap PostgreSQL 18 runtime PASS (read-only)'))
    .catch(() => {
      console.error('v218 prebootstrap PostgreSQL runtime BLOCKED before migrations');
      process.exitCode = 1;
    });
}
module.exports = {runPrebootstrapRuntimeProof};
