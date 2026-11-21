'use strict';
// OFFLINE-only CI identity + checkout proof before npm ci can execute a
// dependency lifecycle script. The same proof is repeated before CREATE ROLE.
// Built-in modules only, no .env, package dependencies, database or network.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {checkPrebootstrapCiIdentity} = require('./v218-prebootstrap-ci-gate.cjs');

const ROOT = path.resolve(__dirname, '../..');

function assertPreinstallCheckout(env = process.env, {
  checkoutRoot = ROOT,
  resolvePath = fs.realpathSync,
  readHead = (cwd) => execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd, encoding:'utf8', timeout:5000, windowsHide:true,
    stdio:['ignore','pipe','ignore'],
  }).trim(),
} = {}) {
  // Fail before opening files or running git if CI metadata is malformed.
  checkPrebootstrapCiIdentity(env);
  if (typeof env.GITHUB_WORKSPACE !== 'string' || !env.GITHUB_WORKSPACE ||
      typeof env.GITHUB_SHA !== 'string') {
    throw new Error('v219: GitHub workspace and commit are mandatory');
  }
  let resolvedCheckout, resolvedWorkspace;
  try {
    resolvedCheckout = resolvePath(checkoutRoot);
    resolvedWorkspace = resolvePath(env.GITHUB_WORKSPACE);
  } catch (_) { throw new Error('v219: checkout root or workspace unavailable'); }
  if (resolvedCheckout !== resolvedWorkspace) {
    throw new Error('v219: checkout is not the declared GitHub workspace');
  }
  let head;
  try { head = readHead(resolvedCheckout); }
  catch (_) { throw new Error('v219: checked-out commit cannot be verified'); }
  if (head !== env.GITHUB_SHA) {
    throw new Error('v219: checkout commit differs from GitHub run SHA');
  }
  return Object.freeze({manualCi:true, checkoutBound:true});
}

if (require.main === module) {
  try {
    assertPreinstallCheckout();
    console.log('v219 manual CI checkout identity PASS (offline, before dependencies)');
  } catch (_) {
    console.error('v219 CI checkout identity BLOCKED (no dependency install authorized)');
    process.exitCode = 1;
  }
}
module.exports = {assertPreinstallCheckout};
