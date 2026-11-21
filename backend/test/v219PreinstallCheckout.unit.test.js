'use strict';
// Offline test only. git and filesystem are injected; no DB or npm install.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {assertPreinstallCheckout} = require('../scripts/v219-preinstall-ci-gate.cjs');
const workflowPath = path.resolve(__dirname, '../../.github/workflows/v193-isolated-postgres-booking.yml');
const sha = 'a'.repeat(40);
const env = Object.freeze({
  GITHUB_ACTIONS:'true', GITHUB_RUN_ID:'219000', GITHUB_RUN_ATTEMPT:'1',
  GITHUB_SHA:sha, GITHUB_REPOSITORY:'Nurbekn/USTARA-New',
  GITHUB_REF:'refs/heads/main', GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_WORKSPACE:'/checked/out',
});
const injected = Object.freeze({checkoutRoot:'/checked/out',resolvePath: value=>value,readHead:()=>sha});

test('v219: valid manual CI checkout proves exact checked-out commit', () => {
  assert.deepEqual(assertPreinstallCheckout(env,injected), {manualCi:true,checkoutBound:true});
});
test('v219: invalid/manual-missing CI state cannot inspect git or filesystem', () => {
  let touched=false;
  for(const altered of [{GITHUB_ACTIONS:'false'}, {GITHUB_RUN_ID:''},
    {GITHUB_EVENT_NAME:'push'}, {GITHUB_SHA:'bad'}, {GITHUB_WORKFLOW_REF:'unknown'}]) {
    assert.throws(()=>assertPreinstallCheckout({...env,...altered},{
      ...injected,resolvePath:()=>{touched=true;throw Error('should not execute');},
      readHead:()=>{touched=true;throw Error('should not execute');},
    }));
  }
  assert.equal(touched,false);
});
test('v219: no workspace or wrong checkout location cannot authorize installation', () => {
  for(const changed of [{GITHUB_WORKSPACE:undefined},{GITHUB_WORKSPACE:''},{GITHUB_WORKSPACE:'/another'}]) {
    assert.throws(()=>assertPreinstallCheckout({...env,...changed},injected),/v219/);
  }
});
test('v219: git HEAD mismatch or failure fails closed', () => {
  assert.throws(()=>assertPreinstallCheckout(env,{...injected,readHead:()=> 'b'.repeat(40)}),/v219/);
  assert.throws(()=>assertPreinstallCheckout(env,{...injected,readHead:()=>{throw new Error('git failed');}}),/v219/);
});
test('v219: unexpected or inaccessible checkout path fails closed', () => {
  assert.throws(()=>assertPreinstallCheckout(env,{...injected,resolvePath:()=>{throw new Error('missing');}}),/v219/);
});
test('v219: workflow establishes identity before any npm installation or unit-test', () => {
  const w=fs.readFileSync(workflowPath,'utf8');
  const first=w.indexOf('- name: Verify manual CI and checked-out commit BEFORE dependency install');
  const npm=w.indexOf('- name: Install backend dependencies exactly as locked');
  const testFirst=w.indexOf('npm run test:v213:unit');
  const setup=w.indexOf('- uses: actions/setup-node@v4');
  const second=w.indexOf('- name: Verify manual CI identity again before disposable database setup');
  const create=w.indexOf('- name: Create disposable non-superuser DB');
  assert.ok(setup >=0 && setup<first && first<npm && npm<testFirst);
  assert.ok(second>testFirst && second<create);
  assert.equal(w.match(/run: node backend\/scripts\/v219-preinstall-ci-gate\.cjs/g)?.length,2);
});
test('v219: workflow stays manually triggered and artifact is success only', () => {
  const w=fs.readFileSync(workflowPath,'utf8');
  assert.match(w,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(w,/\b(push|pull_request|schedule):/);
  assert.match(w,/if: success\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
});
test('v219: executable preinstall gate blocks local environment without leaking metadata', () => {
  const r=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/v219-preinstall-ci-gate.cjs')],{
    env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000,
  });
  assert.equal(r.status,1);
  assert.match(r.stderr,/BLOCKED/);
  assert.doesNotMatch(r.stdout+r.stderr, /a{40}|\/checked\/out|postgresql:\/\//);
});
