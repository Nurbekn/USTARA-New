'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectManifest, inspectProject, main } = require('../scripts/v192-dependency-readiness.cjs');

function inventory() {
  return {
    manifest: { dependencies: { pg: '^8.0.0', express: '^5.0.0' }, devDependencies: { nodemon: '^3.0.0' } },
    lock: { lockfileVersion: 3, packages: {
      '': { dependencies: { pg: '^8.0.0', express: '^5.0.0' }, devDependencies: { nodemon: '^3.0.0' } },
      'node_modules/pg': {}, 'node_modules/express': {}, 'node_modules/nodemon': {},
    } },
  };
}
test('v192: only complete local install AND coherent lock are marked ready', () => {
  const {manifest,lock}=inventory();
  const result=inspectManifest(manifest,lock,()=>'/fake/entry.js');
  assert.equal(result.ready,true);assert.equal(result.total,3);
  assert.deepEqual(result.missingLocally,[]);
});
test('v192: missing modules block readiness instead of being called test regressions', () => {
  const {manifest,lock}=inventory();
  const result=inspectManifest(manifest,lock,name=>{
    if(name==='pg') { const error = Error('package unavailable');error.code='MODULE_NOT_FOUND';throw error; }
    return '/fake/entry.js';
  });
  assert.equal(result.ready,false);assert.deepEqual(result.missingLocally,['pg']);
});
test('v192: drifted lock, missing package entry and invalid lockfile are not ready', () => {
  const {manifest,lock}=inventory();
  lock.packages[''].dependencies.pg='^7.0.0';
  delete lock.packages['node_modules/express'];
  const result=inspectManifest(manifest,lock,()=>'/fake/entry.js');
  assert.equal(result.ready,false);
  assert.deepEqual(result.wrongLockSpec,['pg']);
  assert.deepEqual(result.missingFromLock,['express']);
  assert.equal(inspectManifest(manifest,{...lock,lockfileVersion:1},()=>'/fake').lockVersionValid,false);
});
test('v192: preflight rejects arbitrary project names and never reads environment files', () => {
  assert.throws(()=>inspectProject('../outside'),/Choose backend or frontend/);
  assert.equal(main(['--secrets']),2);
  const source=fs.readFileSync(path.join(__dirname,'../scripts/v192-dependency-readiness.cjs'),'utf8');
  assert.doesNotMatch(source,/dotenv\/config|readFileSync\([^\n]*\.env|execSync|spawnSync|https\.request/);
});
test('v192: verified-install CI performs dependency installation before unit and build tests, without secrets or DB migrations', () => {
  const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v192-verified-dependencies.yml'),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.match(workflow,/npm ci --no-audit --no-fund/);
  assert.match(workflow,/v192-dependency-readiness\.cjs/);
  assert.match(workflow,/npm run test:unit/);
  assert.match(workflow,/npm run build/);
  assert.doesNotMatch(workflow,/DATABASE_URL|TELEGRAM_BOT_TOKEN|migrat(e|ion)|deploy|secrets\./i);
});
