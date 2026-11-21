'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const entry = path.join(ROOT, 'backend/scripts/v157-seven-public-decisions.mjs');
let audit;
async function source() { return audit ??= await import('../scripts/v157-seven-public-decisions.mjs'); }

test('v157: exactly original decision #10–#16 traced without prior duplicates', async () => {
  const { auditPublicSeven } = await source();
  const r = auditPublicSeven();
  assert.deepEqual(r.decisions.map(item => item.id), [10, 11, 12, 13, 14, 15, 16]);
  assert.equal(r.previousSourceTraces, 14);
  assert.equal(r.newSourceTraces, 7);
  assert.equal(r.uniqueSourceTraces, 21);
  assert.equal(r.notYetTraced, 164);
  assert.equal(r.registrySha256, 'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});

test('v157: all evidence remains source-only, no real-time or production claim', async () => {
  const r = (await source()).auditPublicSeven();
  for (const item of r.decisions) {
    assert.equal(item.sourceStatus, 'REFERENCES_PRESENT_ONLY');
    assert.equal(item.unitStatus, 'NOT_INFERRED');
    assert.equal(item.productionVerified, false);
    assert.ok(item.code.length >= 2 && item.tests.length >= 1);
  }
  assert.equal(r.postgresE2E, 'NOT_RUN');
  assert.equal(r.browserE2E, 'NOT_RUN');
  assert.equal(r.notificationRealtimeE2E, 'NOT_VERIFIED');
  assert.equal(r.productionReady, false);
});

test('v157: immutable decision registry remains identical', async () => {
  const file = path.join(ROOT, 'docs/USTARA_185_NAZORAT.csv');
  const before = fs.readFileSync(file);
  (await source()).auditPublicSeven();
  assert.deepEqual(fs.readFileSync(file), before);
});

test('v157: modified decision label fails original registry integrity', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v157-'));
  try {
    const original = fs.readFileSync(path.join(ROOT, 'docs/USTARA_185_NAZORAT.csv'), 'utf8');
    const modified = path.join(dir, 'decisions.csv');
    fs.writeFileSync(modified, original.replace('Smart Search qidirish va filtrlar', 'Boshqa qaror'));
    const { auditPublicSeven } = await source();
    assert.throws(() => auditPublicSeven({ registryPath: modified }), /NOT PASS|NOT VERIFIED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('v157: missing file, traversal and symlink cannot act as source evidence', async () => {
  const { assertEvidenceFile } = await import('../scripts/v155-critical-decisions.mjs');
  assert.throws(() => assertEvidenceFile(ROOT, 'backend/no-such-test.js', 'test('), /NOT VERIFIED/);
  assert.throws(() => assertEvidenceFile(ROOT, '../outside.js', 'test('), /NOT VERIFIED/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v157-links-'));
  try {
    fs.symlinkSync('/etc/hosts', path.join(dir, 'linked'));
    assert.throws(() => assertEvidenceFile(dir, 'linked', 'localhost'), /NOT VERIFIED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('v157: CLI reports only source evidence and refuses production flag', () => {
  const good = spawnSync(process.execPath, [entry, '--json'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(good.status, 0, good.stderr);
  const report = JSON.parse(good.stdout);
  assert.equal(report.uniqueSourceTraces, 21);
  assert.equal(report.productionReady, false);
  const denied = spawnSync(process.execPath, [entry, '--require-production'], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /NOT VERIFIED/);
});

test('v157: original CI must check seven more decisions before dependency installation', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/v55-verify.yml'), 'utf8');
  const audit = ci.indexOf('node backend/scripts/v157-seven-public-decisions.mjs --json');
  const installation = ci.indexOf('Install backend and frontend from locks');
  assert.ok(audit > 0 && audit < installation);
});
