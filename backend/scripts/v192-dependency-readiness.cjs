'use strict';
// Offline-only dependency preflight. No network, .env loading, DB or Telegram calls.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function inspectManifest(manifest, lock, resolveModule) {
  const desired = { ...manifest.dependencies, ...manifest.devDependencies };
  const locked = lock?.packages?.[''] || {};
  const lockDependencies = { ...locked.dependencies, ...locked.devDependencies };
  const missingFromLock = [];
  const wrongLockSpec = [];
  const missingLocally = [];
  for (const [name, spec] of Object.entries(desired).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Object.hasOwn(lockDependencies, name) || !lock?.packages?.[`node_modules/${name}`]) {
      missingFromLock.push(name);
    } else if (lockDependencies[name] !== spec) {
      wrongLockSpec.push(name);
    }
    try { resolveModule(name); } catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_MODULE_NOT_FOUND') {
        missingLocally.push(name);
      } else {
        // Do not mask a resolver failure as a missing package.
        throw error;
      }
    }
  }
  const lockVersionValid = Number.isInteger(lock?.lockfileVersion) && lock.lockfileVersion >= 2;
  return {
    total: Object.keys(desired).length,
    lockVersionValid,
    missingFromLock,
    wrongLockSpec,
    missingLocally,
    ready: lockVersionValid && !missingFromLock.length && !wrongLockSpec.length && !missingLocally.length,
  };
}

function inspectProject(project, basePath = path.resolve(__dirname, '..', '..')) {
  if (project !== 'backend' && project !== 'frontend') throw new TypeError('Choose backend or frontend');
  const dir = path.join(basePath, project);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  const localRequire = createRequire(path.join(dir, 'package.json'));
  return inspectManifest(manifest, lock, name => localRequire.resolve(name));
}

function main(args = process.argv.slice(2)) {
  const names = args.length === 0 || (args.length === 1 && args[0] === 'all')
    ? ['backend', 'frontend'] : args;
  if (names.some(x => x !== 'backend' && x !== 'frontend') || new Set(names).size !== names.length) {
    console.error('Usage: node backend/scripts/v192-dependency-readiness.cjs [backend|frontend|all]');
    return 2;
  }
  let blocked = false;
  for (const name of names) {
    try {
      const data = inspectProject(name);
      blocked ||= !data.ready;
      console.log(`${name}: ${data.ready ? 'READY' : 'BLOCKED'}; ${data.total} declared packages checked`);
      if (!data.lockVersionValid) console.log('  Invalid lockfile version');
      if (data.missingFromLock.length) console.log(`  Missing lock entries: ${data.missingFromLock.join(', ')}`);
      if (data.wrongLockSpec.length) console.log(`  Lock specification differs: ${data.wrongLockSpec.join(', ')}`);
      if (data.missingLocally.length) console.log(`  Not installed locally: ${data.missingLocally.join(', ')}`);
    } catch {
      // Avoid dumping a path or a potentially sensitive exception.
      blocked = true;
      console.log(`${name}: BLOCKED; cannot read project dependency inventory`);
    }
  }
  if (blocked) console.log('Run npm ci separately in each project when a trusted npm registry is reachable. No tests are claimed to have passed.');
  return blocked ? 1 : 0;
}
if (require.main === module) process.exitCode = main();
module.exports = { inspectManifest, inspectProject, main };
