'use strict';
// v214: Write the small, credential-free CI evidence through an opened directory
// descriptor. A directory replaced between the safety check and the file open
// must never redirect a successful evidence write to another location.
// The CI runtime is Linux; on Linux /proc/self/fd binds the lookup to the
// already-verified directory inode. No shell, SQL, network, or env reads.
const fs = require('node:fs');
const path = require('node:path');
const {assertSafeArtifactDirectory} = require('./v211-artifact-directory-guard.cjs');

const MAX_EVIDENCE_BYTES = 4096; // Must agree with v212 evidence verifier.

function writeAnchoredEvidence(filename, evidence) {
  if (filename !== 'v196-booking-integration-evidence.json') {
    throw new Error('v214: unexpected evidence filename');
  }
  const payload = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  if (payload.length < 100 || payload.length > MAX_EVIDENCE_BYTES) {
    throw new Error('v214: evidence size out of bounds');
  }
  const root = assertSafeArtifactDirectory({create:true});
  const {O_RDONLY, O_WRONLY, O_DIRECTORY, O_NOFOLLOW, O_CREAT, O_EXCL} = fs.constants;
  if (process.platform === 'linux' &&
      ![O_DIRECTORY,O_NOFOLLOW,O_EXCL].every(Number.isInteger)) {
    throw new Error('v214: secure Linux file flags unavailable');
  }
  let directoryFd;
  let evidenceFd;
  try {
    directoryFd = fs.openSync(root, O_RDONLY | (O_DIRECTORY || 0) | (O_NOFOLLOW || 0));
    const before = fs.fstatSync(directoryFd);
    if (!before.isDirectory()) throw new Error('v214: evidence directory is not a directory');
    const namedBefore = fs.lstatSync(root);
    if (!namedBefore.isDirectory() || namedBefore.isSymbolicLink() ||
        namedBefore.dev !== before.dev || namedBefore.ino !== before.ino) {
      throw new Error('v214: evidence directory was replaced before writing');
    }
    const anchored = process.platform === 'linux'
      ? `/proc/self/fd/${directoryFd}/${filename}` : path.join(root, filename);
    // O_EXCL fails on any existing target, including symlinks. O_NOFOLLOW
    // independently rejects symlink replacement of the final component.
    evidenceFd = fs.openSync(anchored, O_WRONLY | O_CREAT | O_EXCL | (O_NOFOLLOW || 0), 0o600);
    const opened = fs.fstatSync(evidenceFd);
    if (!opened.isFile() || opened.nlink !== 1) throw new Error('v214: unsafe new evidence inode');
    fs.writeFileSync(evidenceFd, payload);
    fs.fsyncSync(evidenceFd);
    const completed = fs.fstatSync(evidenceFd);
    const namedDirectory = fs.lstatSync(root);
    let namedEvidence;
    try { namedEvidence = fs.lstatSync(path.join(root, filename)); }
    catch (_) { throw new Error('v214: evidence path or contents changed while writing'); }
    if (!namedDirectory.isDirectory() || namedDirectory.isSymbolicLink() ||
        namedDirectory.dev !== before.dev || namedDirectory.ino !== before.ino ||
        !namedEvidence.isFile() || namedEvidence.isSymbolicLink() ||
        namedEvidence.dev !== completed.dev || namedEvidence.ino !== completed.ino ||
        completed.nlink !== 1 || completed.size !== payload.length) {
      throw new Error('v214: evidence path or contents changed while writing');
    }
    return path.join(root, filename);
  } finally {
    if (evidenceFd !== undefined) fs.closeSync(evidenceFd);
    if (directoryFd !== undefined) fs.closeSync(directoryFd);
  }
}

module.exports = {writeAnchoredEvidence, MAX_EVIDENCE_BYTES};
