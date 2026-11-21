'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  expectedMigrationVersions,
  verifyBootstrapSnapshot,
  runBootstrapProof,
} = require('../scripts/v194-bootstrap-proof.cjs');

function targetEnv() {
  return {
    NODE_ENV: 'test',
    USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
    USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:disposable@127.0.0.1:5432/ustara_test_db',
  };
}
function validSnapshot() {
  return {
    database:'ustara_test_db', schema:'public',
    session_user:'ustara_account_test', current_user:'ustara_account_test',
    is_superuser:false, can_create_db:false, can_create_role:false, can_bypass_rls:false,
    in_recovery:false, read_only:'on',
    customer_exclusion:true, barber_exclusion:true, checkins_table:true,
    customer_notices_table:true, telegram_opt_in_table:true, btree_gist_public:true,
    versions:expectedMigrationVersions(),
  };
}

test('v194: the source migration list is complete, sorted and unique', () => {
  const expected = expectedMigrationVersions();
  assert.equal(expected.length, 63);
  assert.equal(new Set(expected).size, expected.length);
  assert.ok(expected.includes('20261130_customer_time_overlap'));
  assert.ok(expected.includes('20270103_customer_booking_telegram_outbox'));
  assert.deepEqual(expected, [...expected].sort());
});

test('v194: valid isolated role, full migration history and both exclusion constraints pass', () => {
  assert.deepEqual(verifyBootstrapSnapshot(validSnapshot(),expectedMigrationVersions()),{
    database:'ustara_test_db', migrations:63, readOnly:true, constraints:'verified'
  });
});

test('v194: missing, extra, repeated or wrong migration versions fail closed', () => {
  const expected=expectedMigrationVersions();
  for(const versions of [expected.slice(1),[...expected,'unexpected'],[...expected.slice(0,-1),expected[0]],['fake']]) {
    assert.throws(()=>verifyBootstrapSnapshot({...validSnapshot(), versions},expected), /migration/);
  }
  assert.throws(()=>verifyBootstrapSnapshot(validSnapshot(),[...expected,expected[0]]),/duplicate/);
});

test('v194: unsafe DB role, schema, privilege, read-only state and constraints fail closed', () => {
  const base=validSnapshot(), expected=expectedMigrationVersions();
  for (const [key,value] of [
    ['database','ustara_db'],['schema','private'],['session_user','postgres'],
    ['current_user','postgres'],['is_superuser',true],['can_create_db',true],
    ['can_create_role',true],['can_bypass_rls',true],['in_recovery',true],
    ['read_only','off'],['customer_exclusion',false],['barber_exclusion',false],
    ['checkins_table',false],['customer_notices_table',false],
    ['telegram_opt_in_table',false],['btree_gist_public',false]
  ]) assert.throws(()=>verifyBootstrapSnapshot({...base,[key]:value},expected),key);
});

test('v194: request denied BEFORE obtaining a database connection without explicit authorization',async()=>{
  let attempts=0;
  const injected={connect:async()=>{attempts++;throw Error('Should never connect');}};
  await assert.rejects(runBootstrapProof({...targetEnv(),NODE_ENV:'production'},injected),/NODE_ENV/);
  assert.equal(attempts,0);
  await assert.rejects(runBootstrapProof({...targetEnv(),TELEGRAM_BOT_TOKEN:'do-not-use'},injected),/production or Telegram/);
  assert.equal(attempts,0);
});

test('v194: injected DB client executes only read-only proof and explicit ROLLBACK',async()=>{
  const snapshot=validSnapshot();
  const statements=[];
  let released=false;
  const fakeClient={
    async query(statement){
      statements.push(statement);
      if(statement.includes('AS customer_exclusion'))return {rows:[Object.fromEntries(Object.entries(snapshot).filter(([key])=>key!=='versions'))]};
      if(statement.includes('SELECT version FROM public.ustara_schema_migrations'))return {rows:snapshot.versions.map(version=>({version}))};
      return {rows:[]};
    },
    release(){released=true;},
  };
  const result=await runBootstrapProof(targetEnv(),{connect:async()=>fakeClient});
  assert.equal(result.migrations,63);
  assert.equal(released,true);
  assert.equal(statements[0],'BEGIN READ ONLY');
  assert.equal(statements.at(-1),'ROLLBACK');
  assert.ok(statements.every(q=>!/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i.test(q)));
  assert.equal(statements.filter(q=>/\bSELECT\b/.test(q)).length,2);
});

test('v194: validation failure triggers rollback, releasing the injected connection',async()=>{
  const snapshot={...validSnapshot(),customer_exclusion:false};
  let released=false;const statements=[];
  const client={async query(statement){statements.push(statement);if(statement.includes('AS customer_exclusion'))return {rows:[snapshot]};if(statement.includes('SELECT version'))return {rows:snapshot.versions.map(version=>({version}))};return {rows:[]};},release(){released=true;}};
  await assert.rejects(runBootstrapProof(targetEnv(),{connect:async()=>client}),/critical/);
  assert.equal(statements.at(-1),'ROLLBACK');assert.equal(released,true);
});

test('v194: CI proof is gated after bootstrap and before the booking integration',()=>{
  const yml=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  const bootstrap=yml.indexOf('- name: Bootstrap ONLY the disposable CI database');
  const proof=yml.indexOf('- name: Verify disposable bootstrap catalog');
  const booking=yml.indexOf('- name: Booking overlap and concurrency integration');
  assert.ok(bootstrap>=0 && proof>bootstrap && booking>proof);
  assert.match(yml,/node scripts\/v194-bootstrap-proof\.cjs/);
  assert.match(yml,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(yml,/\b(push|pull_request|schedule|deployment):/);
});

test('v194: proof implementation cannot access app tables, chat content or runtime .env',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../scripts/v194-bootstrap-proof.cjs'),'utf8');
  assert.doesNotMatch(src,/dotenv|readFileSync\(.+\.env|process\.env\.(?:DATABASE_URL|DB_PASSWORD|TELEGRAM_BOT_TOKEN)/);
  assert.doesNotMatch(src,/(?:INSERT INTO|UPDATE\s+\w+|DELETE FROM|DROP TABLE|TRUNCATE TABLE)/i);
  assert.match(src,/BEGIN READ ONLY/);
});
