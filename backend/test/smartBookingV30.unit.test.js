'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readBootstrapPlan}=require('../scripts/bootstrap-plan');
const root=path.resolve(__dirname,'..');
const migrationName='20261211_smart_booking_active_entry';
const migration=fs.readFileSync(path.join(root,'database/migrations',migrationName+'.sql'),'utf8');
const service=fs.readFileSync(path.join(root,'services/smartBookingOffers.js'),'utf8');
const verify=fs.readFileSync(path.join(root,'database/bootstrap/verify.sql'),'utf8');

test('v30 forward migration is remains tracked exactly once, and bootstrap checks live index',()=>{
 const all=readBootstrapPlan();
 assert.equal(all.filter(x=>x.file.startsWith('migrations/')).length,63);
 assert.equal(all.filter(x=>x.file==='migrations/'+migrationName+'.sql').length,1);
 assert.ok(all.findIndex(x=>x.file==='migrations/'+migrationName+'.sql')<all.findIndex(x=>x.file==='migrations/20261212_queue_self_exit_audit.sql'));
 assert.equal(all.at(-1).file,'bootstrap/verify.sql');
 assert.match(verify,/20261211_smart_booking_active_entry/);
 assert.match(verify,/idx\.relname='smart_booking_one_active_entry'/);
 assert.match(verify,/i\.indisunique AND i\.indisvalid AND i\.indisready AND i\.indpred IS NOT NULL/);
});
test('v30 duplicate active offers abort migration before index without deleting users or offers',()=>{
 assert.match(migration,/BEGIN;[\s\S]*COMMIT;/);
 assert.match(migration,/20261210_manual_queue_claims/);
 assert.match(migration,/LOCK TABLE smart_booking_offers IN SHARE ROW EXCLUSIVE MODE/);
 assert.match(migration,/WHERE status IN \('pending','accepted'\)[\s\S]*GROUP BY entry_id HAVING count\(\*\) > 1/);
 assert.match(migration,/RAISE EXCEPTION 'Multiple active offers per entry/);
 assert.match(migration,/CREATE UNIQUE INDEX smart_booking_one_active_entry ON smart_booking_offers\(entry_id\)\s+WHERE status IN \('pending','accepted'\)/);
 assert.match(migration,/INSERT INTO ustara_schema_migrations\(version\)/);
 assert.doesNotMatch(migration,/\b(?:DELETE FROM|UPDATE|TRUNCATE)\s+(?:smart_booking_offers|walkin_queue|bookings)\b/i);
});
test('v30 candidate selection excludes any unconfirmed accepted offer, not just pending',()=>{
 assert.match(service,/NOT EXISTS\(SELECT 1 FROM smart_booking_offers o WHERE o\.entry_id=q\.id AND o\.status IN \('pending','accepted'\)\)/);
 assert.match(service,/await lockBarber\(c,barberId\)/);
 assert.match(service,/ORDER BY q\.queue_position ASC NULLS LAST,q\.id LIMIT 1 FOR UPDATE OF q/);
});
test('v30 read-only opt-in staging test is strict and does not run on production by default',()=>{
 const pg=fs.readFileSync(path.join(__dirname,'smartBookingV30.postgres.integration.test.js'),'utf8');
 assert.match(pg,/USTARA_SMART_V30_DB_AUDIT==='I_AUTHORIZE_READ_ONLY_TEST'/);
 assert.match(pg,/NODE_ENV==='test'/);
 assert.match(pg,/testTarget\(process\.env\.USTARA_TEST_DATABASE_URL/);
 assert.match(pg,/assertTestConnection\(c1,target,'ustara_account_test'\)/);
 assert.match(pg,/default_transaction_read_only=on/);
 assert.match(pg,/pg_try_advisory_xact_lock/);
 assert.doesNotMatch(pg,/\b(?:CREATE TABLE|DROP TABLE|INSERT INTO|UPDATE bookings|DELETE FROM)\b/i);
});
