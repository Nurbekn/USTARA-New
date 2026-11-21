'use strict';
// v220: A matching Git HEAD does not prove that checked-out source files still
// match that commit. Require a clean, CI-critical worktree before npm ci and
// before any disposable database setup. Built-in modules + local git only.
// No database connections, network, .env reads, or source modifications.
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {assertPreinstallCheckout} = require('./v219-preinstall-ci-gate.cjs');

const ROOT = path.resolve(__dirname, '../..');
const GUARDED_PATHS = Object.freeze([
  '.github',
  '.gitignore',
  '.gitattributes',
  '.gitmodules',
  '.npmrc',
  'backend',
]);

function readGuardedStatus(cwd) {
  // Include unstaged changes, staged changes and untracked files anywhere
  // under backend/ or .github/, plus root Git/npm config files.
  // Git status does not follow .gitignore paths (secrets are not inspected).
  return execFileSync('git', [
    'status', '--porcelain=v1', '--untracked-files=all', '--', ...GUARDED_PATHS,
  ], {
    cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024,
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function assertCheckedSourceTree(env = process.env, {
  checkoutRoot = ROOT,
  resolvePath,
  readHead,
  readStatus = readGuardedStatus,
} = {}) {
  // v219 checks complete manual CI identity and proves HEAD matches GITHUB_SHA.
  // Call it FIRST; malformed CI metadata must not trigger a git status scan.
  assertPreinstallCheckout(env, {checkoutRoot, resolvePath, readHead});
  let status;
  try { status = readStatus(checkoutRoot); }
  catch (_) { throw new Error('v220: cannot verify guarded source tree'); }
  if (typeof status !== 'string' || status.length !== 0) {
    throw new Error('v220: guarded checkout files have local changes');
  }
  return Object.freeze({commitBound: true, guardedTreeClean: true});
}

if (require.main === module) {
  try {
    assertCheckedSourceTree();
    console.log('v220 checked source tree PASS (CI-critical files match commit)');
  } catch (_) {
    console.error('v220 checked source tree BLOCKED (no install or DB setup authorized)');
    process.exitCode = 1;
  }
}

module.exports = {GUARDED_PATHS, readGuardedStatus, assertCheckedSourceTree};
