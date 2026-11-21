// Offline only. No pg, dotenv, subprocess, connection or SQL execution.
const fs = require('node:fs');
const path = require('node:path');
const databaseRoot = path.resolve(__dirname, '../database');
function readBootstrapPlan(root = databaseRoot) {
  const entry = fs.readFileSync(path.join(root, 'bootstrap.sql'), 'utf8');
  if (!/^\\set ON_ERROR_STOP on$/m.test(entry)) throw new Error('Bootstrap must stop on error');
  const files = [...entry.matchAll(/^\\ir ([a-zA-Z0-9_./-]+)$/gm)].map((match) => match[1]);
  const forward = fs.readdirSync(path.join(root, 'migrations'))
    .filter((name) => name.endsWith('.sql') && !name.endsWith('_rollback.sql')).sort();
  const migrations = files.filter((file) => file.startsWith('migrations/'));
  if (new Set(files).size !== files.length) throw new Error('Duplicate bootstrap include');
  if (JSON.stringify(migrations) !== JSON.stringify(forward.map((file) => `migrations/${file}`))) {
    throw new Error('Forward migration coverage/order mismatch');
  }
  if (files[0] !== 'bootstrap/guard.sql' || files[2] !== 'bootstrap/core.sql'
      || files.at(-1) !== 'bootstrap/verify.sql' || files.length !== forward.length + 3) {
    throw new Error('Guard/core/verification order mismatch');
  }
  const seen = new Set();
  return files.map((file) => {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(path.resolve(root) + path.sep) || file.includes('rollback') || file === 'schema.sql') {
      throw new Error('Unsafe bootstrap include');
    }
    const sql = fs.readFileSync(absolute, 'utf8');
    if (/^\\/m.test(sql)) throw new Error('Leaf SQL must not contain psql commands');
    const declared = sql.match(/(?:prerequisites|prerequisite_versions)\s+CONSTANT\s+TEXT\[\]\s*:=\s*ARRAY\[([\s\S]*?)\]/i);
    if (declared) {
      for (const [, version] of declared[1].matchAll(/'([^']+)'/g)) {
        if (!seen.has(version)) throw new Error(`Missing earlier prerequisite: ${version}`);
      }
    }
    if (file.startsWith('migrations/')) seen.add(path.basename(file, '.sql'));
    return { file, sql };
  });
}
if (require.main === module) {
  for (const { file } of readBootstrapPlan()) process.stdout.write(file + '\n');
}
module.exports = { readBootstrapPlan };
