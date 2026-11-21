'use strict';
// v211: Fail closed if the evidence directory is missing, a symlink,
// a non-directory, or resolves outside the active backend working directory.
// Does not read .env, connect to a DB, or print any artifact payloads.
const fs = require('node:fs');
const path = require('node:path');

function assertSafeArtifactDirectory({create = false, allowMissing = false} = {}) {
  const cwd = fs.realpathSync(process.cwd());
  const root = path.join(cwd, 'artifacts');
  let stat;
  try {
    stat = fs.lstatSync(root);
  } catch (error) {
    if (error.code === 'ENOENT' && allowMissing && !create) return root;
    if (error.code !== 'ENOENT' || !create) {
      throw new Error('v211: evidence directory unavailable');
    }
    // Do not follow an existing link; mkdir without recursive traversal.
    try {
      fs.mkdirSync(root, {mode: 0o700});
    } catch (_) {
      throw new Error('v211: could not create safe evidence directory');
    }
    stat = fs.lstatSync(root);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory() ||
      fs.realpathSync(root) !== root) {
    throw new Error('v211: unsafe evidence directory');
  }
  return root;
}

module.exports = {assertSafeArtifactDirectory};
