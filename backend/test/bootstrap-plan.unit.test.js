const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readBootstrapPlan } = require('../scripts/bootstrap-plan');
const root = path.resolve(__dirname, '../database');
const guardSql = fs.readFileSync(path.join(root, 'bootstrap/guard.sql'), 'utf8');
const verifySql = fs.readFileSync(path.join(root, 'bootstrap/verify.sql'), 'utf8');
test('offline bootstrap resolves every real forward migration in dependency order', () => {
  const plan = readBootstrapPlan();
  assert.equal(plan.length, 66);
  assert.equal(plan.filter(({ file }) => file.startsWith('migrations/')).length, 63);
  assert.ok(plan.some(({ file }) => file === 'migrations/20261121_telegram_auth_hardening.sql'));
  assert.ok(plan.some(({ file }) => file === 'migrations/20261117_barber_profile_02_booking_acceptance.sql'));
  const acceptance = plan.find(({ file }) => file === 'migrations/20261117_barber_profile_02_booking_acceptance.sql').sql;
  assert.match(acceptance, /ADD COLUMN accepting_bookings BOOLEAN NOT NULL DEFAULT TRUE/i);
  assert.match(acceptance, /20261117_barber_profile/);
  assert.match(acceptance, /20261117_barber_profile_02_booking_acceptance/);
  assert.ok(plan.some(({ file }) => file === 'migrations/20261118_social_portfolio_reviews.sql'));
  assert.match(verifySql, /20261118_social_portfolio_reviews/);
  assert.match(verifySql, /barber_reviews/);
  assert.ok(plan.every(({ sql }) => sql.length > 0));
  const core = plan.find(({ file }) => file === 'bootstrap/core.sql').sql;
  assert.deepEqual([...core.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]),
    ['customers', 'barbers', 'services', 'barber_working_hours', 'bookings']);
});
for (const [name, change, error] of [
  ['out-of-order forward migration', (s) => s.replace(/(\\ir migrations\/20261114_security_01_login_protection.sql)\n(\\ir migrations\/20261114_security_02_password_reset.sql)/, '$2\n$1'), /coverage\/order/],
  ['duplicate forward migration', (s) => s.replace('20261114_security_01_login_protection.sql', '20261114_security_02_password_reset.sql'), /Duplicate/],
  ['rollback include', (s) => s.replace('migrations/20261113_unified_accounts.sql', 'migrations/20261113_unified_accounts_rollback.sql'), /coverage\/order/],
  ['schema.sql shortcut', (s) => s.replace('bootstrap/core.sql', 'schema.sql'), /order/],
  ['missing error-stop', (s) => s.replace('\\set ON_ERROR_STOP on', ''), /stop on error/],
]) {
  test(`offline bootstrap rejects ${name}`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-bootstrap-plan-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.cpSync(root, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bootstrap.sql'), change(fs.readFileSync(path.join(dir, 'bootstrap.sql'), 'utf8')));
    assert.throws(() => readBootstrapPlan(dir), error);
  });
}

test('offline bootstrap guard permits only public objects owned by the required btree_gist extension', async (t) => {
  await t.test('public btree_gist extension members are identified by pg_depend membership', () => {
    assert.match(guardSql, /pg_catalog\.pg_extension e WHERE e\.extname='btree_gist'/);
    assert.match(guardSql, /btree_gist_schema_oid IS DISTINCT FROM public_schema_oid/);
    assert.match(guardSql, /d\.refclassid='pg_catalog\.pg_extension'::pg_catalog\.regclass/);
    assert.match(guardSql, /d\.refobjid=btree_gist_oid AND d\.deptype='e'/);
    assert.match(guardSql, /schema_name='public'/);
    assert.match(guardSql, /o\.classid='pg_catalog\.pg_extension'::pg_catalog\.regclass AND o\.objid=btree_gist_oid/);
  });
  await t.test('an unrelated public table remains an unexpected relation', () => {
    assert.match(guardSql, /'pg_catalog\.pg_class'::pg_catalog\.regclass,c\.oid/);
    assert.match(guardSql, /target schema contains non-bootstrap objects/);
    assert.match(guardSql, /FROM pg_catalog\.pg_class c WHERE c\.relnamespace=schema_oid/);
  });
  await t.test('an unrelated public function remains an unexpected routine', () => {
    assert.match(guardSql, /'pg_catalog\.pg_proc'::pg_catalog\.regclass,p\.oid/);
    assert.match(guardSql, /FROM pg_catalog\.pg_proc p WHERE p\.pronamespace=schema_oid/);
  });
  await t.test('a separate schema is not exempted by the public extension', () => {
    assert.match(guardSql, /WHERE o\.object_schema=schema_oid/);
    assert.match(guardSql, /WHERE c\.relnamespace=schema_oid/);
    assert.match(guardSql, /WHERE p\.pronamespace=schema_oid/);
    assert.match(guardSql, /schema_name='public'\s+AND\s+\(/);
    assert.match(guardSql, /'pg_catalog\.pg_type'::pg_catalog\.regclass,t\.oid/);
  });
  await t.test('missing extension and missing or unowned operator class have explicit prerequisite errors', () => {
    assert.match(guardSql, /prerequisite missing; an administrator must install btree_gist in public/);
    assert.match(guardSql, /prerequisite missing; public\.gist_int4_ops must be owned by btree_gist/);
    assert.match(guardSql, /opc\.opcname='gist_int4_ops'/);
    assert.match(guardSql, /am\.amname='gist' AND opc\.opcintype='integer'::regtype/);
  });
  await t.test('final verification requires the same extension schema and operator-class membership', () => {
    assert.match(verifySql, /e\.extname='btree_gist' AND n\.nspname='public'/);
    assert.match(verifySql, /public\.gist_int4_ops must be owned by btree_gist/);
    assert.match(verifySql, /d\.refobjid=btree_gist_oid AND d\.deptype='e'/);
  });
});
